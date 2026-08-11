package com.misfit1000.streamnyaa.torrent

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.StatFs
import android.util.AtomicFile
import org.libtorrent4j.AlertListener
import org.libtorrent4j.AnnounceEntry
import org.libtorrent4j.Priority
import org.libtorrent4j.SessionParams
import org.libtorrent4j.SessionManager
import org.libtorrent4j.SettingsPack
import org.libtorrent4j.TorrentFlags
import org.libtorrent4j.TorrentHandle
import org.libtorrent4j.TorrentInfo
import org.libtorrent4j.alerts.AddTorrentAlert
import org.libtorrent4j.alerts.Alert
import org.libtorrent4j.alerts.AlertType
import org.libtorrent4j.alerts.MetadataReceivedAlert
import org.libtorrent4j.alerts.TorrentErrorAlert
import java.io.File
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt
import org.json.JSONObject

class TorrentStreamEngine(
  private val context: Context,
  private val onStatus: (Map<String, Any?>) -> Unit,
) {
  private val scheduler = Executors.newSingleThreadScheduledExecutor()
  private val metadataExecutor = Executors.newSingleThreadExecutor()
  private val cacheRoot = File(context.cacheDir, "torrent-streams")
  private var sessionDir = cacheRoot
  private var session: SessionManager? = null
  private var alertListener: AlertListener? = null
  private var handle: TorrentHandle? = null
  private var selectedFileIndex = -1
  private var selectedFile: File? = null
  private var selectedFileSize = 0L
  private var selectedFirstPiece = -1
  private var selectedLastPiece = -1
  private var selectedFirstPieceOffset = 0L
  private var contiguousPieceCursor = -1
  private var contiguousBytes = 0L
  private var server: LocalTorrentHttpServer? = null
  private var poller: ScheduledFuture<*>? = null
  private var state = "idle"
  private var message = "Choose a source to begin."
  private var error: String? = null
  private var preferredFile: String? = null
  private var maxCacheBytes = 2L * 1024 * 1024 * 1024
  private var batterySaver = true
  private var wifiOnly = false
  private var performanceProfile = "standard"
  private var pausedForNetwork = false
  private var sessionGeneration = 0L
  private var startedAtMs = 0L
  private var lastBufferAdvanceAtMs = 0L
  private var lastObservedContiguousBytes = 0L
  private var lastObservedDownloadedBytes = 0L
  private var lastPeerDiscoveryAtMs = 0L
  private var lastCacheMetadataWriteAtMs = 0L
  private var currentInfoHash = ""
  private var currentMetadata: Map<String, Any?> = emptyMap()
  private var reusedCache = false
  private var failureStage: String? = null
  private var metadataFailure: String? = null

  @Synchronized
  fun start(magnet: String, preferredFile: String?, options: Map<String, Any?>) {
    require(magnet.startsWith("magnet:?")) { "A valid magnet URI is required." }
    prepareForNextSource()
    val runGeneration = sessionGeneration
    cacheRoot.mkdirs()
    maxCacheBytes = ((options["maxCacheMiB"] as? Number)?.toLong() ?: 2048L).coerceIn(512L, 8192L) * 1024 * 1024
    batterySaver = options["batterySaver"] as? Boolean ?: true
    wifiOnly = options["wifiOnly"] as? Boolean ?: false
    performanceProfile = options["performanceProfile"] as? String ?: "standard"
    currentInfoHash = (options["infoHash"] as? String)?.lowercase()?.takeIf(String::isNotBlank) ?: torrentKey(magnet)
    currentMetadata = options
    pausedForNetwork = false
    if (!isNetworkAvailable()) {
      return fail("No internet connection is available. Connect to a network and try again.")
    }
    if (wifiOnly && !isUnmeteredNetwork()) {
      return fail("Wi-Fi-only streaming is enabled. Connect to Wi-Fi or change the setting.")
    }
    if (StatFs(cacheRoot.absolutePath).availableBytes < MINIMUM_FREE_BYTES) {
      return fail("Not enough free storage to buffer safely. Clear the streaming cache and try again.")
    }
    sessionDir = cacheRoot
    trimCache(maxCacheBytes)
    sessionDir = File(cacheRoot, torrentKey(magnet)).apply { mkdirs(); setLastModified(System.currentTimeMillis()) }
    reusedCache = readCacheMetadata(sessionDir)?.optLong("downloadedBytes", 0L)?.let { it > 0L } ?: false
    this.preferredFile = preferredFile
    startedAtMs = System.currentTimeMillis()
    lastBufferAdvanceAtMs = startedAtMs
    lastObservedContiguousBytes = 0L
    lastObservedDownloadedBytes = 0L
    lastPeerDiscoveryAtMs = 0L
    state = "metadata"
    message = "Starting peer discovery…"
    error = null
    failureStage = null
    metadataFailure = null
    emit()

    val newSession = session == null
    val nextSession = session ?: try {
      SessionManager(false).also { session = it }
    } catch (throwable: Throwable) {
      return fail("The native streaming engine could not start: ${safeMessage(throwable)}")
    }
    val nextListener = object : AlertListener {
      override fun types(): IntArray? = null
      override fun alert(alert: Alert<*>) {
        synchronized(this@TorrentStreamEngine) {
          if (!isCurrentSession(runGeneration, nextSession)) return@synchronized
          try {
            when (alert.type()) {
              AlertType.ADD_TORRENT -> {
                // Alert handles are non-owning SWIG views and expire with the callback.
                // Resolve an owning copy from the live session before retaining it.
                val alertHandle = (alert as AddTorrentAlert).handle()
                val nextHandle = persistentHandle(alertHandle, nextSession) ?: return@synchronized
                nextHandle.resume()
                handle = nextHandle
                reinforcePeerDiscovery(nextHandle)
                if (nextHandle.torrentFile() != null) configureSelectedFile(nextHandle, runGeneration)
              }
              AlertType.METADATA_RECEIVED -> {
                val alertHandle = (alert as MetadataReceivedAlert).handle()
                persistentHandle(alertHandle, nextSession)?.let { configureSelectedFile(it, runGeneration) }
              }
              AlertType.TORRENT_ERROR -> failForSession(runGeneration, (alert as TorrentErrorAlert).error().message)
              else -> Unit
            }
          } catch (throwable: Throwable) {
            failForSession(runGeneration, "The selected source failed safely: ${safeMessage(throwable)}")
          }
        }
      }
    }
    alertListener = nextListener
    nextSession.addListener(nextListener)
    try {
      if (newSession) {
        val settings = SettingsPack.defaultSettings().apply {
          setEnableDht(true)
          setEnableLsd(true)
          setDhtBootstrapNodes(DHT_BOOTSTRAP_NODES)
          activeDownloads(1)
          activeSeeds(0)
          activeDhtLimit(if (batterySaver) 40 else 80)
          activeTrackerLimit(if (batterySaver) 24 else 48)
          connectionsLimit(if (batterySaver) 64 else 112)
          maxPeerlistSize(if (batterySaver) 160 else 320)
          alertQueueSize(2_000)
          tickInterval(if (batterySaver) 1_000 else 500)
        }
        nextSession.start(SessionParams(settings))
        nextSession.startDht()
      }
      nextSession.maxActiveDownloads(1)
      nextSession.maxActiveSeeds(0)
      nextSession.maxConnections(if (batterySaver) 48 else 80)
      nextSession.maxPeers(if (batterySaver) 40 else 70)
      // Start the magnet immediately. Network metadata lookups used to block this call
      // for up to 16 seconds before DHT or a tracker was allowed to find a peer.
      // Start peer discovery immediately, then merge trusted .torrent metadata
      // when the source index provides it. This avoids relying on DHT for the
      // file list without delaying tracker/DHT announces on restricted networks.
      nextSession.download(magnet, sessionDir, TorrentFlags.SEQUENTIAL_DOWNLOAD)
      val metadataUrls = buildList {
        (options["metadataUrls"] as? List<*>)?.mapNotNullTo(this) { it as? String }
        (options["torrentUrl"] as? String)?.takeIf(String::isNotBlank)?.let(::add)
      }.filter { it.startsWith("https://", ignoreCase = true) }.distinct().take(4)
      if (metadataUrls.isNotEmpty()) metadataExecutor.execute {
        var torrentInfo: TorrentInfo? = null
        for (url in metadataUrls) {
          torrentInfo = fetchTorrentMetadata(url, currentInfoHash)
          if (torrentInfo != null) break
        }
        if (torrentInfo == null) {
          synchronized(this) {
            if (isCurrentSession(runGeneration, nextSession)) metadataFailure = "Metadata endpoints failed; continuing with magnet discovery."
          }
          return@execute
        }
        synchronized(this) {
          if (!isCurrentSession(runGeneration, nextSession)) return@synchronized
          if (selectedFileIndex >= 0) return@synchronized
          val currentHandle = handle
          val alreadyHasMetadata = currentHandle != null && runCatching { currentHandle.torrentFile() }.getOrNull() != null
          if (alreadyHasMetadata) {
            configureSelectedFile(checkNotNull(currentHandle), runGeneration)
          } else {
            // libtorrent4j does not merge TorrentInfo into an existing magnet-only
            // torrent. Remove the owning handle only after it is no longer observable.
            handle = null
            currentHandle?.let { runCatching { nextSession.remove(it) } }
          }
          if (!alreadyHasMetadata && runCatching { nextSession.download(torrentInfo, sessionDir) }.isSuccess) {
            message = "Torrent metadata loaded. Connecting to peersâ€¦"
            emit()
          } else if (!alreadyHasMetadata) {
            metadataFailure = "Indexed metadata could not be merged; continuing with magnet discovery."
          }
        }
      }
    } catch (throwable: Throwable) {
      runCatching { nextSession.removeListener(nextListener) }
      if (newSession) {
        runCatching { nextSession.stop() }
        if (isCurrentSession(runGeneration, nextSession)) session = null
      }
      return fail("The source could not be opened: ${safeMessage(throwable)}")
    }
    val pollSeconds = if (batterySaver) 2L else 1L
    poller = scheduler.scheduleAtFixedRate({ runCatching { emitForSession(runGeneration) } }, pollSeconds, pollSeconds, TimeUnit.SECONDS)
  }

  @Synchronized
  private fun configureSelectedFile(torrentHandle: TorrentHandle, runGeneration: Long) {
    if (runGeneration != sessionGeneration) return
    if (selectedFileIndex >= 0) return
    val info = torrentHandle.torrentFile() ?: return
    val files = info.files()
    val videoExtensions = setOf("mkv", "mp4", "webm", "avi", "mov", "m4v")
    val candidates = (0 until files.numFiles()).filter { index ->
      val extension = files.fileName(index).substringAfterLast('.', "").lowercase()
      extension in videoExtensions && !files.padFileAt(index)
    }
    if (candidates.isEmpty()) return fail("This source does not contain a supported video file.")
    val preferred = preferredFile?.lowercase()
    val preferredEpisode = preferred?.removePrefix("episode:")?.toIntOrNull()
    selectedFileIndex = when {
      candidates.size == 1 -> candidates.first()
      preferredEpisode != null -> candidates
        .map { index -> index to episodeFileScore(files.fileName(index), preferredEpisode) }
        .filter { it.second > 0 }
        .maxWithOrNull(compareBy<Pair<Int, Int>> { it.second }.thenBy { files.fileSize(it.first) })
        ?.first
        ?: return fail("This release contains multiple videos, but Episode $preferredEpisode could not be identified safely.")
      preferred != null -> candidates.firstOrNull { files.fileName(it).lowercase().contains(preferred) }
        ?: return fail("The requested episode file is not present in this release.")
      else -> candidates.maxBy { files.fileSize(it) }
    }
    selectedFileSize = files.fileSize(selectedFileIndex)
    if (selectedFileSize > maxCacheBytes) {
      return fail("This video requires ${roundedMiB(selectedFileSize)} MB, above the ${maxCacheBytes / 1024 / 1024} MB cache limit.")
    }
    val candidateFile = File(sessionDir, files.filePath(selectedFileIndex)).canonicalFile
    val safeRoot = sessionDir.canonicalFile.path + File.separator
    if (!candidateFile.path.startsWith(safeRoot)) return fail("This source contains an unsafe file path.")
    val cachedBytes = readCacheMetadata(sessionDir)?.optLong("downloadedBytes", 0L)?.coerceAtLeast(0L) ?: 0L
    val remainingBytes = (selectedFileSize - cachedBytes).coerceAtLeast(0L)
    if (StatFs(cacheRoot.absolutePath).availableBytes < remainingBytes + STORAGE_HEADROOM_BYTES) {
      return fail("Not enough free storage for this video. Clear the streaming cache or choose a smaller source.")
    }
    trimCache((maxCacheBytes - selectedFileSize).coerceAtLeast(0L))
    selectedFile = candidateFile
    writeCacheMetadata(force = true)
    val firstRequest = info.mapFile(selectedFileIndex, 0L, 1)
    val lastRequest = info.mapFile(selectedFileIndex, (selectedFileSize - 1L).coerceAtLeast(0L), 1)
    selectedFirstPiece = firstRequest.piece()
    selectedLastPiece = lastRequest.piece()
    selectedFirstPieceOffset = firstRequest.start().toLong()
    contiguousPieceCursor = selectedFirstPiece
    contiguousBytes = 0L
    lastObservedContiguousBytes = 0L
    lastBufferAdvanceAtMs = System.currentTimeMillis()

    val priorities = Priority.array(Priority.IGNORE, info.numFiles())
    priorities[selectedFileIndex] = Priority.TOP_PRIORITY
    torrentHandle.prioritizeFiles(priorities)
    runCatching { torrentHandle.setSequentialRange(selectedFirstPiece, selectedLastPiece) }
    prioritizePlaybackEdges(torrentHandle, files.fileName(selectedFileIndex))
    reinforcePeerDiscovery(torrentHandle)
    torrentHandle.resume()
    handle = torrentHandle
    state = "buffering"
    message = "Buffering ${files.fileName(selectedFileIndex)}…"

    val nextServer = LocalTorrentHttpServer(
      fileProvider = { selectedFile },
      sizeProvider = { selectedFileSize },
      readableBytesProvider = { offset -> readableBytesFrom(offset) },
      onRangeRequested = { offset -> prioritizeReadOffset(offset) },
      mimeProvider = { mimeFor(files.fileName(selectedFileIndex)) },
    )
    try {
      nextServer.start(5_000, false)
      server = nextServer
    } catch (throwable: Throwable) {
      return fail("The private playback server could not start: ${safeMessage(throwable)}")
    }
    emit()
  }

  @Synchronized
  fun status(): Map<String, Any?> {
    val torrentStatus = runCatching { handle?.status(true) }.getOrNull()
    val contiguousDownloaded = contiguousAvailableBytes()
    val downloaded = (torrentStatus?.totalWantedDone() ?: contiguousDownloaded).coerceIn(0L, selectedFileSize.coerceAtLeast(contiguousDownloaded))
    val now = System.currentTimeMillis()
    if (contiguousDownloaded > lastObservedContiguousBytes) lastObservedContiguousBytes = contiguousDownloaded
    if (downloaded > lastObservedDownloadedBytes) {
      lastObservedDownloadedBytes = downloaded
      lastBufferAdvanceAtMs = now
    }
    val buffered = if (selectedFileSize > 0) ((contiguousDownloaded.toDouble() / selectedFileSize) * 100).coerceIn(0.0, 100.0) else 0.0
    if (state == "buffering" && contiguousDownloaded >= minimumBufferBytes()) {
      state = "ready"
      message = "Buffered and ready to play."
    }
    val peers = torrentStatus?.numPeers() ?: 0
    val seeds = torrentStatus?.numSeeds() ?: 0
    val connectCandidates = torrentStatus?.connectCandidates() ?: 0
    val rate = torrentStatus?.downloadPayloadRate() ?: 0
    val trackerCount = runCatching { handle?.trackers()?.size ?: 0 }.getOrDefault(0)
    val playbackPort = server?.listeningPort?.takeIf { it > 0 }
    if ((state == "metadata" || state == "buffering") && peers <= 0 && handle != null && now - lastPeerDiscoveryAtMs >= DISCOVERY_REANNOUNCE_MS) {
      reinforcePeerDiscovery(checkNotNull(handle))
    }
    if (state == "metadata" && peers <= 0 && error == null) {
      message = "Finding peers with DHT and $trackerCount trackers…"
    }
    if ((state == "metadata" || state == "buffering") && peers <= 0 && now - startedAtMs >= NO_PEER_TIMEOUT_MS) {
      transitionToError("No reachable peers were found for this release.")
    } else if (state == "metadata" && now - startedAtMs >= METADATA_TIMEOUT_MS) {
      transitionToError("This torrent did not return video metadata.")
    } else if ((state == "buffering" || state == "ready") && downloaded < selectedFileSize && now - lastBufferAdvanceAtMs >= BUFFER_STALL_TIMEOUT_MS) {
      transitionToError("This source stopped sending video data.")
    } else if (state == "buffering" && now - startedAtMs >= PLAYBACK_READY_TIMEOUT_MS) {
      transitionToError("This source is too slow to start reliably.")
    }
    return mapOf(
      "state" to state,
      "message" to message,
      "progress" to ((torrentStatus?.progress() ?: 0f) * 100).roundToInt(),
      "bufferedPercent" to buffered,
      "peers" to peers,
      "seeds" to seeds,
      "connectCandidates" to connectCandidates,
      "trackerCount" to trackerCount,
      "dhtNodes" to runCatching { session?.dhtNodes() ?: 0L }.getOrDefault(0L),
      "dhtRunning" to runCatching { session?.isDhtRunning() ?: false }.getOrDefault(false),
      "firewalled" to runCatching { session?.isFirewalled() ?: false }.getOrDefault(false),
      "announcingToTrackers" to (torrentStatus?.announcingToTrackers() ?: false),
      "announcingToDht" to (torrentStatus?.announcingToDht() ?: false),
      "announcingToLsd" to (torrentStatus?.announcingToLsd() ?: false),
      "connectionStage" to connectionStage(),
      "downloadRate" to rate,
      "downloadedBytes" to downloaded,
      "totalBytes" to selectedFileSize,
      "etaSeconds" to if (rate > 0 && selectedFileSize > downloaded) (selectedFileSize - downloaded) / rate else 0L,
      "failureStage" to failureStage,
      "metadataFailure" to metadataFailure,
      "cached" to reusedCache,
      "waitSeconds" to if (startedAtMs > 0L) ((now - startedAtMs) / 1000L).coerceAtLeast(0L) else 0L,
      "fileName" to selectedFile?.name,
      "streamUrl" to if (contiguousDownloaded >= minimumBufferBytes() && playbackPort != null) "http://127.0.0.1:$playbackPort/video" else null,
      "error" to error,
    ).also { writeCacheMetadata() }
  }

  @Synchronized
  private fun emit() {
    enforceRuntimePolicies()
    runCatching { onStatus(status()) }
  }

  @Synchronized
  private fun emitForSession(runGeneration: Long) {
    if (runGeneration != sessionGeneration) return
    emit()
  }

  private fun enforceRuntimePolicies() {
    val current = handle ?: return
    val connected = isNetworkAvailable()
    val allowed = connected && (!wifiOnly || isUnmeteredNetwork())
    if (!allowed && !pausedForNetwork) {
      current.pause()
      pausedForNetwork = true
      state = "paused"
      message = if (connected) "Waiting for Wi-Fi. Streaming will resume automatically." else "Connection lost. Streaming will resume automatically."
    } else if (allowed && pausedForNetwork) {
      current.resume()
      reinforcePeerDiscovery(current)
      pausedForNetwork = false
      val now = System.currentTimeMillis()
      startedAtMs = now
      lastBufferAdvanceAtMs = now
      state = if (contiguousAvailableBytes() >= minimumBufferBytes()) "ready" else "buffering"
      message = "Connection restored. Streaming resumed."
    }
    if (pausedForNetwork) return
    if (selectedFileSize > contiguousAvailableBytes() && StatFs(cacheRoot.absolutePath).availableBytes < CRITICAL_FREE_BYTES) {
      current.pause()
      poller?.cancel(false); poller = null
      server?.stop(); server = null
      state = "error"
      message = "Streaming stopped because device storage is critically low."
      error = message
    }
  }

  private fun contiguousAvailableBytes(): Long {
    val current = handle ?: return 0
    val info = current.torrentFile() ?: return 0
    if (selectedFileIndex < 0 || contiguousPieceCursor < 0) return 0
    while (contiguousPieceCursor <= selectedLastPiece && runCatching { current.havePiece(contiguousPieceCursor) }.getOrDefault(false)) {
      val pieceSize = info.pieceSize(contiguousPieceCursor).toLong()
      contiguousBytes += if (contiguousPieceCursor == selectedFirstPiece) (pieceSize - selectedFirstPieceOffset).coerceAtLeast(0L) else pieceSize
      contiguousPieceCursor += 1
    }
    return contiguousBytes.coerceIn(0L, selectedFileSize)
  }

  @Synchronized
  private fun readableBytesFrom(fileOffset: Long): Long {
    val current = handle ?: return 0L
    val info = current.torrentFile() ?: return 0L
    if (selectedFileIndex < 0 || fileOffset !in 0L until selectedFileSize) return 0L
    val request = runCatching { info.mapFile(selectedFileIndex, fileOffset, 1) }.getOrNull() ?: return 0L
    var piece = request.piece()
    var offsetInPiece = request.start().toLong()
    var readable = 0L
    var inspected = 0
    while (piece <= selectedLastPiece && inspected < MAX_READABLE_PIECE_SCAN && runCatching { current.havePiece(piece) }.getOrDefault(false)) {
      readable += (info.pieceSize(piece).toLong() - offsetInPiece).coerceAtLeast(0L)
      offsetInPiece = 0L
      piece += 1
      inspected += 1
    }
    return readable.coerceIn(0L, selectedFileSize - fileOffset)
  }

  private fun minimumBufferBytes(): Long = if (performanceProfile == "constrained") {
    minOf(selectedFileSize, maxOf(4L * 1024 * 1024, selectedFileSize / 300))
  } else {
    minOf(selectedFileSize, maxOf(8L * 1024 * 1024, selectedFileSize / 200))
  }

  @Synchronized
  fun pause() {
    if (handle == null) return
    pausedForNetwork = false
    handle?.pause(); state = "paused"; message = "Download paused."; emit()
  }

  @Synchronized
  fun resume() {
    val current = handle ?: return
    if (!isNetworkAvailable() || (wifiOnly && !isUnmeteredNetwork())) {
      pausedForNetwork = true
      state = "paused"
      message = if (isNetworkAvailable()) "Waiting for Wi-Fi before resuming." else "Waiting for a network connection before resuming."
      emit()
      return
    }
    pausedForNetwork = false
    current.resume()
    reinforcePeerDiscovery(current)
    val now = System.currentTimeMillis()
    startedAtMs = now
    lastBufferAdvanceAtMs = now
    state = if (contiguousAvailableBytes() >= minimumBufferBytes()) "ready" else "buffering"
    message = "Download resumed."
    emit()
  }

  @Synchronized
  fun stop(removeFiles: Boolean) {
    prepareForNextSource()
    runCatching { session?.stop() }
    session = null
    if (removeFiles) clearCache()
  }

  @Synchronized
  fun clearCache(): Long {
    cacheRoot.mkdirs()
    val activeDirectory = sessionDir.takeIf { handle != null && it.parentFile == cacheRoot }
    var removedBytes = 0L
    cacheRoot.listFiles()?.filter { it != activeDirectory }?.forEach { entry ->
      val bytes = cachedDirectoryBytes(entry)
      if (entry.deleteRecursively()) removedBytes += bytes
    }
    return removedBytes
  }

  @Synchronized
  fun cacheStats(): Map<String, Long> {
    cacheRoot.mkdirs()
    return mapOf(
      "bytes" to (cacheRoot.listFiles()?.sumOf(::cachedDirectoryBytes) ?: 0L),
      "freeBytes" to StatFs(cacheRoot.absolutePath).availableBytes,
      "maxBytes" to maxCacheBytes,
    )
  }

  @Synchronized
  fun destroy() {
    stop(false)
    scheduler.shutdownNow()
    metadataExecutor.shutdownNow()
  }

  @Synchronized
  private fun fail(reason: String) {
    transitionToError(reason)
    emit()
  }

  @Synchronized
  private fun transitionToError(reason: String) {
    failureStage = connectionStage()
    handle?.pause()
    poller?.cancel(false); poller = null
    server?.stop(); server = null
    state = "error"; message = reason; error = reason
  }

  @Synchronized
  private fun failForSession(runGeneration: Long, reason: String) {
    if (runGeneration != sessionGeneration) return
    fail(reason)
  }

  @Synchronized
  private fun isCurrentSession(runGeneration: Long, expected: SessionManager): Boolean =
    runGeneration == sessionGeneration && session === expected

  private fun persistentHandle(alertHandle: TorrentHandle, expectedSession: SessionManager): TorrentHandle? {
    val infoHash = runCatching { alertHandle.infoHash() }.getOrNull() ?: return null
    return runCatching { expectedSession.find(infoHash) }.getOrNull()
  }

  private fun prioritizePlaybackEdges(torrentHandle: TorrentHandle, fileName: String) {
    if (selectedFirstPiece < 0 || selectedLastPiece < selectedFirstPiece) return
    val leadEnd = minOf(selectedLastPiece, selectedFirstPiece + LEAD_DEADLINE_PIECES - 1)
    for (piece in selectedFirstPiece..leadEnd) {
      runCatching { torrentHandle.setPieceDeadline(piece, (piece - selectedFirstPiece) * 75) }
    }
    if (fileName.endsWith(".mp4", true) || fileName.endsWith(".m4v", true) || fileName.endsWith(".mov", true)) {
      val tailStart = maxOf(selectedFirstPiece, selectedLastPiece - TAIL_DEADLINE_PIECES + 1)
      for (piece in tailStart..selectedLastPiece) {
        runCatching { torrentHandle.setPieceDeadline(piece, 1_200 + (piece - tailStart) * 75) }
      }
    }
  }

  @Synchronized
  private fun prioritizeReadOffset(fileOffset: Long) {
    val current = handle ?: return
    val info = current.torrentFile() ?: return
    if (selectedFileIndex < 0 || fileOffset !in 0L until selectedFileSize) return
    val piece = runCatching { info.mapFile(selectedFileIndex, fileOffset, 1).piece() }.getOrNull() ?: return
    val deadlineEnd = minOf(selectedLastPiece, piece + LEAD_DEADLINE_PIECES - 1)
    runCatching { current.setSequentialRange(piece, selectedLastPiece) }
    for (nextPiece in piece..deadlineEnd) {
      runCatching { current.setPieceDeadline(nextPiece, (nextPiece - piece) * 60) }
    }
    reinforcePeerDiscovery(current)
  }

  private fun reinforcePeerDiscovery(torrentHandle: TorrentHandle) {
    val existing = runCatching { torrentHandle.trackers().map { it.url() }.toSet() }.getOrDefault(emptySet())
    FALLBACK_TRACKERS.filterNot(existing::contains).forEach { tracker ->
      runCatching { torrentHandle.addTracker(AnnounceEntry(tracker)) }
    }
    runCatching { torrentHandle.forceReannounce() }
    runCatching { torrentHandle.forceDHTAnnounce() }
    runCatching { torrentHandle.forceLSDAnnounce() }
    lastPeerDiscoveryAtMs = System.currentTimeMillis()
  }

  private fun fetchTorrentMetadata(torrentUrl: String?, expectedInfoHash: String): TorrentInfo? {
    val url = torrentUrl?.takeIf { it.startsWith("https://", ignoreCase = true) && it.length <= 2_048 } ?: return null
    return runCatching {
      val connection = URL(url).openConnection() as HttpURLConnection
      try {
        connection.instanceFollowRedirects = true
        connection.connectTimeout = TORRENT_METADATA_CONNECT_TIMEOUT_MS
        connection.readTimeout = TORRENT_METADATA_READ_TIMEOUT_MS
        connection.setRequestProperty("Accept", "application/x-bittorrent, application/octet-stream")
        connection.setRequestProperty("User-Agent", "StreamNyaa Android/0.9.1")
        val responseCode = connection.responseCode
        require(responseCode in 200..299) { "Torrent metadata request failed ($responseCode)." }
        val declaredLength = connection.contentLengthLong
        require(declaredLength <= MAX_TORRENT_METADATA_BYTES || declaredLength < 0L) { "Torrent metadata is unexpectedly large." }
        val output = ByteArrayOutputStream()
        connection.inputStream.use { input ->
          val buffer = ByteArray(16 * 1024)
          var total = 0
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            require(total <= MAX_TORRENT_METADATA_BYTES) { "Torrent metadata is unexpectedly large." }
            output.write(buffer, 0, read)
          }
        }
        val info = TorrentInfo(output.toByteArray())
        require(info.isValid) { "Torrent metadata is invalid." }
        if (expectedInfoHash.matches(Regex("[a-f0-9]{40}", RegexOption.IGNORE_CASE))) {
          require(info.infoHash().toHex().equals(expectedInfoHash, ignoreCase = true)) { "Torrent metadata hash does not match the selected release." }
        }
        info
      } finally {
        connection.disconnect()
      }
    }.getOrNull()
  }

  @Synchronized
  fun cacheEntries(): List<Map<String, Any?>> {
    cacheRoot.mkdirs()
    return cacheRoot.listFiles()
      ?.filter(File::isDirectory)
      ?.map { directory ->
        val metadata = readCacheMetadata(directory)
        val infoHash = metadata?.optString("infoHash")?.takeIf(String::isNotBlank) ?: directory.name
        mapOf(
          "infoHash" to infoHash,
          "animeId" to metadata?.optString("animeId")?.takeIf(String::isNotBlank),
          "animeTitle" to metadata?.optString("animeTitle")?.takeIf(String::isNotBlank),
          "episode" to metadata?.optInt("episode", 0)?.takeIf { it > 0 },
          "sourceTitle" to metadata?.optString("sourceTitle")?.takeIf(String::isNotBlank),
          "fileName" to metadata?.optString("fileName")?.takeIf(String::isNotBlank),
          "bytes" to cachedDirectoryBytes(directory),
          "totalBytes" to (metadata?.optLong("totalBytes", 0L) ?: 0L),
          "lastAccessedAt" to maxOf(metadata?.optLong("lastAccessedAt", 0L) ?: 0L, directory.lastModified()),
          "active" to (directory == sessionDir && handle != null),
        )
      }
      ?.sortedByDescending { (it["lastAccessedAt"] as? Number)?.toLong() ?: 0L }
      ?: emptyList()
  }

  @Synchronized
  fun removeCacheEntry(infoHash: String): Long {
    val safeHash = infoHash.lowercase().takeIf { it.matches(Regex("[a-z0-9]{6,64}")) } ?: return 0L
    val target = File(cacheRoot, safeHash)
    if (!target.exists() || target.canonicalFile.parentFile != cacheRoot.canonicalFile || (target == sessionDir && handle != null)) return 0L
    val bytes = cachedDirectoryBytes(target)
    return if (target.deleteRecursively()) bytes else 0L
  }

  private fun connectionStage(): String = when {
    state == "error" -> "failed"
    state == "ready" || state == "playing" -> "ready"
    state == "paused" -> "paused"
    selectedFileIndex >= 0 -> "buffering"
    handle != null -> "peer-discovery"
    session != null -> "engine-start"
    else -> "idle"
  }

  private fun safeMessage(throwable: Throwable): String =
    throwable.message?.takeIf { it.isNotBlank() }?.take(180) ?: throwable.javaClass.simpleName

  private fun episodeFileScore(fileName: String, episode: Int): Int {
    val normalized = fileName.substringBeforeLast('.').lowercase()
    if (Regex("(?:^|[\\W_])(ncop|nced|opening|ending|preview|trailer|creditless)(?:[\\W_]|$)").containsMatchIn(normalized)) return -100
    val seasonEpisode = Regex("s\\d{1,2}[ ._-]*e(\\d{1,4})", RegexOption.IGNORE_CASE).find(normalized)
    if (seasonEpisode != null) return if (seasonEpisode.groupValues[1].toIntOrNull() == episode) 100 else -10
    val labeled = Regex("(?:^|[^a-z0-9])(?:ep|episode)[ ._-]*0*${episode}(?:[^0-9]|$)", RegexOption.IGNORE_CASE)
    if (labeled.containsMatchIn(normalized)) return 90
    val standalone = Regex("(?:^|[^0-9])0*${episode}(?:[^0-9]|$)")
    return if (standalone.containsMatchIn(normalized)) 60 else 0
  }

  private fun directorySize(file: File): Long = if (!file.exists()) 0 else if (file.isFile) file.length() else file.listFiles()?.sumOf(::directorySize) ?: 0

  private fun prepareForNextSource() {
    writeCacheMetadata(force = true)
    sessionGeneration += 1L
    poller?.cancel(true); poller = null
    server?.stop(); server = null
    alertListener?.let { listener -> runCatching { session?.removeListener(listener) } }
    alertListener = null
    val previousHandle = handle
    handle = null
    previousHandle?.let { torrentHandle -> runCatching { session?.remove(torrentHandle) } }
    selectedFileIndex = -1; selectedFile = null; selectedFileSize = 0
    selectedFirstPiece = -1; selectedLastPiece = -1; selectedFirstPieceOffset = 0L
    contiguousPieceCursor = -1; contiguousBytes = 0L
    startedAtMs = 0L; lastBufferAdvanceAtMs = 0L; lastObservedContiguousBytes = 0L; lastObservedDownloadedBytes = 0L
    lastPeerDiscoveryAtMs = 0L; lastCacheMetadataWriteAtMs = 0L
    pausedForNetwork = false
    sessionDir.setLastModified(System.currentTimeMillis())
    state = "idle"; message = "Choose a source to begin."; error = null; failureStage = null; metadataFailure = null
  }

  private fun readCacheMetadata(directory: File): JSONObject? = runCatching {
    val target = File(directory, CACHE_METADATA_FILE)
    if (!target.exists() && !File(directory, "$CACHE_METADATA_FILE.bak").exists()) return@runCatching null
    AtomicFile(target).openRead().bufferedReader(Charsets.UTF_8).use { reader -> JSONObject(reader.readText()) }
  }.getOrNull()

  private fun writeCacheMetadata(force: Boolean = false) {
    if (sessionDir == cacheRoot || !sessionDir.exists()) return
    val now = System.currentTimeMillis()
    if (!force && now - lastCacheMetadataWriteAtMs < CACHE_METADATA_WRITE_INTERVAL_MS) return
    lastCacheMetadataWriteAtMs = now
    val previous = readCacheMetadata(sessionDir)
    val downloaded = if (selectedFileSize > 0L) {
      val contiguous = contiguousAvailableBytes()
      (runCatching { handle?.status(false)?.totalWantedDone() }.getOrNull() ?: contiguous).coerceIn(0L, selectedFileSize)
    } else previous?.optLong("downloadedBytes", 0L) ?: 0L
    val json = JSONObject().apply {
      put("infoHash", currentInfoHash.ifBlank { sessionDir.name })
      put("animeId", currentMetadata["animeId"] as? String ?: previous?.optString("animeId").orEmpty())
      put("animeTitle", currentMetadata["animeTitle"] as? String ?: previous?.optString("animeTitle").orEmpty())
      put("episode", (currentMetadata["episode"] as? Number)?.toInt() ?: previous?.optInt("episode", 0) ?: 0)
      put("sourceTitle", currentMetadata["sourceTitle"] as? String ?: previous?.optString("sourceTitle").orEmpty())
      put("fileName", selectedFile?.name ?: previous?.optString("fileName").orEmpty())
      put("downloadedBytes", downloaded)
      put("totalBytes", selectedFileSize.takeIf { it > 0L } ?: previous?.optLong("totalBytes", 0L) ?: 0L)
      put("lastAccessedAt", now)
    }
    val atomicFile = AtomicFile(File(sessionDir, CACHE_METADATA_FILE))
    var output: java.io.FileOutputStream? = null
    try {
      output = atomicFile.startWrite()
      output.write(json.toString().toByteArray(Charsets.UTF_8))
      atomicFile.finishWrite(output)
      sessionDir.setLastModified(now)
    } catch (_: Throwable) {
      output?.let(atomicFile::failWrite)
    }
  }

  private fun torrentKey(magnet: String): String {
    val hash = Regex("(?i)(?:xt=urn:btih:)([a-z0-9]+)").find(magnet)?.groupValues?.getOrNull(1)
    return hash?.lowercase()?.take(64) ?: magnet.hashCode().toUInt().toString(16)
  }

  private fun cachedDirectoryBytes(directory: File): Long {
    if (!directory.exists()) return 0L
    if (!directory.isDirectory) return directory.length()
    val metadataBytes = readCacheMetadata(directory)?.optLong("downloadedBytes", -1L) ?: -1L
    return metadataBytes.takeIf { it >= 0L } ?: directorySize(directory)
  }

  private fun roundedMiB(bytes: Long): Long = (bytes + 1024 * 1024 - 1) / (1024 * 1024)

  private fun isUnmeteredNetwork(): Boolean {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
    val network = manager.activeNetwork ?: return false
    val capabilities = manager.getNetworkCapabilities(network) ?: return false
    return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
      || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
  }

  private fun isNetworkAvailable(): Boolean {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
    val network = manager.activeNetwork ?: return false
    val capabilities = manager.getNetworkCapabilities(network) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
  }

  private fun trimCache(limit: Long) {
    val entries = cacheRoot.listFiles()?.filter { it != sessionDir } ?: return
    var total = entries.sumOf(::cachedDirectoryBytes)
    if (total <= limit) return
    entries.sortedBy { readCacheMetadata(it)?.optLong("lastAccessedAt", 0L)?.takeIf { value -> value > 0L } ?: it.lastModified() }
      .forEach { entry ->
        if (total <= limit) return@forEach
        val size = cachedDirectoryBytes(entry)
        if (entry.deleteRecursively()) total -= size
      }
  }

  private fun mimeFor(name: String) = when (name.substringAfterLast('.', "").lowercase()) {
    "mp4", "m4v", "mov" -> "video/mp4"
    "webm" -> "video/webm"
    "avi" -> "video/x-msvideo"
    else -> "video/x-matroska"
  }

  companion object {
    private const val MINIMUM_FREE_BYTES = 256L * 1024 * 1024
    private const val STORAGE_HEADROOM_BYTES = 128L * 1024 * 1024
    private const val CRITICAL_FREE_BYTES = 64L * 1024 * 1024
    private const val LEAD_DEADLINE_PIECES = 48
    private const val TAIL_DEADLINE_PIECES = 6
    private const val MAX_READABLE_PIECE_SCAN = 64
    private const val METADATA_TIMEOUT_MS = 18_000L
    private const val NO_PEER_TIMEOUT_MS = 15_000L
    private const val BUFFER_STALL_TIMEOUT_MS = 20_000L
    private const val PLAYBACK_READY_TIMEOUT_MS = 35_000L
    private const val DISCOVERY_REANNOUNCE_MS = 4_500L
    private const val CACHE_METADATA_FILE = "entry.json"
    private const val CACHE_METADATA_WRITE_INTERVAL_MS = 5_000L
    private const val TORRENT_METADATA_CONNECT_TIMEOUT_MS = 5_000
    private const val TORRENT_METADATA_READ_TIMEOUT_MS = 7_000
    private const val MAX_TORRENT_METADATA_BYTES = 2 * 1024 * 1024
    private const val DHT_BOOTSTRAP_NODES = "dht.libtorrent.org:25401,router.bittorrent.com:6881,router.utorrent.com:6881,dht.transmissionbt.com:6881"
    private val FALLBACK_TRACKERS = listOf(
      "https://tracker.opentrackr.org:443/announce",
      "https://tracker.opentrackr.org/announce",
      "udp://open.stealth.si:80/announce",
      "udp://tracker.opentrackr.org:1337/announce",
      "udp://exodus.desync.com:6969/announce",
      "udp://tracker.torrent.eu.org:451/announce",
    )
  }
}
