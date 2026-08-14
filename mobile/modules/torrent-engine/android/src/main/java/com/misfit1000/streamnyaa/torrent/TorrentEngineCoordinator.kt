package com.misfit1000.streamnyaa.torrent

import android.content.Context
import java.util.concurrent.Executors

internal data class TorrentEngineStartSpec(
  val magnet: String,
  val preferredFile: String?,
  val options: Map<String, Any?>,
)

/** Owns either one normal engine or a short, bounded race of equivalent sources. */
internal class TorrentEngineCoordinator(
  private val context: Context,
  private val onStatus: (Map<String, Any?>) -> Unit,
) {
  private data class Slot(val token: Long, val engine: TorrentStreamEngine)

  private val lock = Any()
  private val cleanupExecutor = Executors.newSingleThreadExecutor()
  private var nextToken = 0L
  @Volatile private var active = newSlot()
  private var raceSlots = linkedMapOf<Long, Slot>()
  private var raceSpecs = linkedMapOf<Long, TorrentEngineStartSpec>()
  private var raceStatuses = linkedMapOf<Long, Map<String, Any?>>()
  private var raceInProgress = false
  private var raceWinnerToken: Long? = null
  private var raceWinnerIndex = -1
  private var raceCandidateCount = 0

  private fun newSlot(): Slot {
    val token = ++nextToken
    return Slot(token, TorrentStreamEngine(context) { status -> handleStatus(token, status) })
  }

  fun start(spec: TorrentEngineStartSpec) {
    val discarded = synchronized(lock) {
      val keep = active.token
      val old = raceSlots.values.filter { it.token != keep }
      clearRaceLocked()
      old
    }
    discard(discarded)
    active.engine.start(spec.magnet, spec.preferredFile, spec.options)
  }

  fun startRace(specs: List<TorrentEngineStartSpec>) {
    require(specs.size in 2..3) { "A source race requires two or three candidates." }
    val previous = synchronized(lock) { allSlotsLocked() }
    val nextSlots = specs.map { newSlot() }
    synchronized(lock) {
      raceSlots = nextSlots.associateByTo(linkedMapOf()) { it.token }
      raceSpecs = nextSlots.zip(specs).associateTo(linkedMapOf()) { (slot, spec) -> slot.token to spec }
      raceStatuses = linkedMapOf()
      raceInProgress = true
      raceWinnerToken = null
      raceWinnerIndex = -1
      raceCandidateCount = specs.size
      active = nextSlots.first()
    }
    discard(previous)
    nextSlots.zip(specs).forEach { (slot, spec) ->
      slot.engine.start(spec.magnet, spec.preferredFile, spec.options + ("raceMode" to true))
    }
  }

  fun status(): Map<String, Any?> {
    val mode = synchronized(lock) {
      Triple(raceInProgress, raceWinnerToken, raceCandidateCount)
    }
    if (mode.first || (mode.third > 0 && mode.second == null)) return synchronized(lock) { aggregateRaceStatusLocked() }
    val status = active.engine.status()
    return synchronized(lock) {
      if (raceWinnerToken == active.token) winnerStatusLocked(status) else status
    }
  }

  fun pause() = active.engine.pause()
  fun resume() = active.engine.resume()

  fun stop(removeFiles: Boolean) {
    val (activeToken, slots) = synchronized(lock) {
      val current = active.token to allSlotsLocked()
      clearRaceLocked()
      current
    }
    val unique = slots.distinctBy { it.token }
    unique.forEach { runCatching { it.engine.stop(false) } }
    if (removeFiles) runCatching { active.engine.clearCache() }
    unique.filter { it.token != activeToken }.forEach { runCatching { it.engine.destroy() } }
  }

  fun clearCache() = active.engine.clearCache()
  fun cacheStats() = active.engine.cacheStats()
  fun cacheEntries() = active.engine.cacheEntries()
  fun removeCacheEntry(infoHash: String) = active.engine.removeCacheEntry(infoHash)

  fun destroy() {
    val slots = synchronized(lock) {
      val current = allSlotsLocked()
      clearRaceLocked()
      current
    }
    slots.distinctBy { it.token }.forEach { runCatching { it.engine.destroy() } }
    cleanupExecutor.shutdownNow()
  }

  private fun handleStatus(token: Long, status: Map<String, Any?>) {
    var outgoing: Map<String, Any?>? = null
    var losers: List<Slot> = emptyList()
    synchronized(lock) {
      if (raceCandidateCount == 0) {
        if (token == active.token) outgoing = status
        return@synchronized
      }
      if (raceWinnerToken != null) {
        if (token == raceWinnerToken) outgoing = winnerStatusLocked(status)
        return@synchronized
      }
      if (!raceSlots.containsKey(token)) return@synchronized
      raceStatuses[token] = status
      val playable = (status["streamUrl"] as? String).orEmpty().isNotBlank() && status["state"] != "error"
      if (playable) {
        raceWinnerToken = token
        raceWinnerIndex = raceSpecs.keys.indexOf(token)
        raceInProgress = false
        active = checkNotNull(raceSlots[token])
        losers = raceSlots.values.filter { it.token != token }
        raceSlots = linkedMapOf(token to active)
        outgoing = winnerStatusLocked(status)
      } else {
        val allFinished = raceStatuses.size == raceCandidateCount && raceStatuses.values.all { it["state"] == "error" }
        if (allFinished) raceInProgress = false
        outgoing = aggregateRaceStatusLocked()
      }
    }
    discard(losers)
    outgoing?.let(onStatus)
  }

  private fun aggregateRaceStatusLocked(): Map<String, Any?> {
    val statuses = raceStatuses.values.toList()
    val allFailed = statuses.size == raceCandidateCount && statuses.all { it["state"] == "error" }
    val ready = statuses.count { (it["streamUrl"] as? String).orEmpty().isNotBlank() }
    fun sum(key: String) = statuses.sumOf { (it[key] as? Number)?.toLong() ?: 0L }
    val state = when {
      allFailed -> "error"
      statuses.any { it["state"] == "buffering" || it["state"] == "ready" } -> "buffering"
      else -> "metadata"
    }
    val failureMessage = statuses.mapNotNull { it["error"] as? String }.distinct().joinToString(" · ").take(360)
    return mapOf(
      "state" to state,
      "message" to if (allFailed) "None of the raced sources became playable." else "Racing $raceCandidateCount similar-quality releases…",
      "progress" to (statuses.maxOfOrNull { (it["progress"] as? Number)?.toInt() ?: 0 } ?: 0),
      "bufferedPercent" to (statuses.maxOfOrNull { (it["bufferedPercent"] as? Number)?.toDouble() ?: 0.0 } ?: 0.0),
      "peers" to sum("peers"),
      "seeds" to sum("seeds"),
      "connectCandidates" to sum("connectCandidates"),
      "trackerCount" to sum("trackerCount"),
      "dhtNodes" to sum("dhtNodes"),
      "downloadRate" to sum("downloadRate"),
      "downloadedBytes" to sum("downloadedBytes"),
      "connectionStage" to if (allFailed) "failed" else if (state == "buffering") "buffering" else "peer-discovery",
      "failureStage" to if (allFailed) "source-race" else null,
      "error" to failureMessage.takeIf { allFailed && it.isNotBlank() },
      "raceActive" to !allFailed,
      "raceCandidateCount" to raceCandidateCount,
      "raceReadyCount" to ready,
      "racedSourceIds" to raceSpecs.values.joinToString(",") { (it.options["infoHash"] as? String).orEmpty() },
    )
  }

  private fun winnerStatusLocked(status: Map<String, Any?>): Map<String, Any?> {
    val winner = raceWinnerToken?.let(raceSpecs::get)
    return status + mapOf(
      "raceActive" to false,
      "raceCandidateCount" to raceCandidateCount,
      "raceReadyCount" to 1,
      "raceWinnerIndex" to raceWinnerIndex,
      "raceWinnerInfoHash" to (winner?.options?.get("infoHash") as? String),
      "racedSourceIds" to raceSpecs.values.joinToString(",") { (it.options["infoHash"] as? String).orEmpty() },
    )
  }

  private fun allSlotsLocked() = (raceSlots.values + active).distinctBy { it.token }

  private fun clearRaceLocked() {
    raceSlots = linkedMapOf()
    raceSpecs = linkedMapOf()
    raceStatuses = linkedMapOf()
    raceInProgress = false
    raceWinnerToken = null
    raceWinnerIndex = -1
    raceCandidateCount = 0
  }

  private fun discard(slots: List<Slot>) {
    if (slots.isEmpty()) return
    cleanupExecutor.execute {
      slots.distinctBy { it.token }.forEach { runCatching { it.engine.destroy() } }
    }
  }
}
