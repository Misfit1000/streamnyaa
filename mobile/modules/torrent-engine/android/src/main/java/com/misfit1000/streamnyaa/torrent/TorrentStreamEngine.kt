package com.misfit1000.streamnyaa.torrent

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.StatFs
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
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt

class TorrentStreamEngine(
  private val context: Context,
  private val onStatus: (Map<String, Any?>) -> Unit,
) {
  private val scheduler = Executors.newSingleThreadScheduledExecutor()
  private val cacheRoot = File(context.cacheDir, "torrent-streams")
  private var sessionDir = cacheRoot
  private var session: SessionManager? = null
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
  private var pausedForNetwork = false
  private var sessionGeneration = 0L
  private var startedAtMs = 0L
  private var lastBufferAdvanceAtMs = 0L
  private var lastObservedContiguousBytes = 0L

  @Synchronized
  fun start(magnet: String, preferredFile: String?, options: Map<String, Any?>) {
    require(magnet.startsWith("magnet:?")) { "A valid magnet URI is required." }
    stop(false)
    val runGeneration = sessionGeneration
    cacheRoot.mkdirs()
    maxCacheBytes = ((options["maxCacheMiB"] as? Number)?.toLong() ?: 2048L).coerceIn(512L, 8192L) * 1024 * 1024
    batterySaver = options["batterySaver"] as? Boolean ?: true
    wifiOnly = options["wifiOnly"] as? Boolean ?: false
    pausedForNetwork = false
    if (wifiOnly && !isUnmeteredNetwork()) {
      return fail("Wi-Fi-only streaming is enabled. Connect to Wi-Fi or change the setting.")
    }
    if (StatFs(cacheRoot.absolutePath).availableBytes < MINIMUM_FREE_BYTES) {
      return fail("Not enough free storage to buffer safely. Clear the streaming cache and try again.")
    }
    sessionDir = cacheRoot
    trimCache(maxCacheBytes)
    sessionDir = File(cacheRoot, torrentKey(magnet)).apply { mkdirs(); setLastModified(System.currentTimeMillis()) }
    this.preferredFile = preferredFile
    startedAtMs = System.currentTimeMillis()
    lastBufferAdvanceAtMs = startedAtMs
    lastObservedContiguousBytes = 0L
    state = "metadata"
    message = "Connecting to peers and loading metadata…"
    error = null
    emit()

    val metadataUrls = (options["metadataUrls"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
    val torrentInfo = fetchTorrentInfo(metadataUrls)
    val nextSession = try {
      SessionManager(false)
    } catch (throwable: Throwable) {
      return fail("The native streaming engine could not start: ${safeMessage(throwable)}")
    }
    session = nextSession
    nextSession.addListener(object : AlertListener {
      override fun types(): IntArray? = null
      override fun alert(alert: Alert<*>) {
        if (!isCurrentSession(runGeneration, nextSession)) return
        try {
          when (alert.type()) {
            AlertType.ADD_TORRENT -> {
              val nextHandle = (alert as AddTorrentAlert).handle().also { it.resume() }
              handle = nextHandle
              reinforcePeerDiscovery(nextHandle)
              if (nextHandle.torrentFile() != null) configureSelectedFile(nextHandle, runGeneration)
            }
            AlertType.METADATA_RECEIVED -> configureSelectedFile((alert as MetadataReceivedAlert).handle(), runGeneration)
            AlertType.TORRENT_ERROR -> failForSession(runGeneration, (alert as TorrentErrorAlert).error().message)
            else -> Unit
          }
        } catch (throwable: Throwable) {
          failForSession(runGeneration, "The selected source failed safely: ${safeMessage(throwable)}")
        }
      }
    })
    try {
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
      nextSession.maxActiveDownloads(1)
      nextSession.maxActiveSeeds(0)
      nextSession.maxConnections(if (batterySaver) 48 else 80)
      nextSession.maxPeers(if (batterySaver) 40 else 70)
      if (torrentInfo != null) nextSession.download(torrentInfo, sessionDir)
      else nextSession.download(magnet, sessionDir, TorrentFlags.SEQUENTIAL_DOWNLOAD)
    } catch (throwable: Throwable) {
      runCatching { nextSession.stop() }
      if (isCurrentSession(runGeneration, nextSession)) session = null
      return fail("The source could not be opened: ${safeMessage(throwable)}")
    }
    val pollSeconds = if (batterySaver) 3L else 1L
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
      return fail("The selected video is larger than the ${maxCacheBytes / 1024 / 1024} MB cache limit.")
    }
    val candidateFile = File(sessionDir, files.filePath(selectedFileIndex)).canonicalFile
    val safeRoot = sessionDir.canonicalFile.path + File.separator
    if (!candidateFile.path.startsWith(safeRoot)) return fail("This source contains an unsafe file path.")
    val remainingBytes = (selectedFileSize - candidateFile.length()).coerceAtLeast(0L)
    if (StatFs(cacheRoot.absolutePath).availableBytes < remainingBytes + STORAGE_HEADROOM_BYTES) {
      return fail("Not enough free storage for this video. Clear the streaming cache or choose a smaller source.")
    }
    trimCache((maxCacheBytes - selectedFileSize).coerceAtLeast(0L))
    selectedFile = candidateFile
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
    val downloaded = contiguousAvailableBytes()
    val now = System.currentTimeMillis()
    if (downloaded > lastObservedContiguousBytes) {
      lastObservedContiguousBytes = downloaded
      lastBufferAdvanceAtMs = now
    }
    val buffered = if (selectedFileSize > 0) ((downloaded.toDouble() / selectedFileSize) * 100).coerceIn(0.0, 100.0) else 0.0
    if (state == "buffering" && downloaded >= minimumBufferBytes()) {
      state = "ready"
      message = "Buffered and ready to play."
    }
    val peers = torrentStatus?.numPeers() ?: 0
    if ((state == "metadata" || state == "buffering") && peers <= 0 && now - startedAtMs >= NO_PEER_TIMEOUT_MS) {
      transitionToError("No active peers responded for this release. StreamNyaa will try a healthier source.")
    } else if (state == "metadata" && now - startedAtMs >= METADATA_TIMEOUT_MS) {
      transitionToError("This source did not return video metadata. Trying another source is recommended.")
    } else if (state == "buffering" && now - lastBufferAdvanceAtMs >= BUFFER_STALL_TIMEOUT_MS) {
      transitionToError("This source stopped sending video data. StreamNyaa will try another source.")
    } else if (state == "buffering" && now - startedAtMs >= PLAYBACK_READY_TIMEOUT_MS) {
      transitionToError("This source is too slow to start reliably. StreamNyaa will try another source.")
    }
    return mapOf(
      "state" to state,
      "message" to message,
      "progress" to ((torrentStatus?.progress() ?: 0f) * 100).roundToInt(),
      "bufferedPercent" to buffered,
      "peers" to peers,
      "downloadRate" to (torrentStatus?.downloadPayloadRate() ?: 0),
      "waitSeconds" to if (startedAtMs > 0L) ((now - startedAtMs) / 1000L).coerceAtLeast(0L) else 0L,
      "fileName" to selectedFile?.name,
      "streamUrl" to if (downloaded >= minimumBufferBytes()) "http://127.0.0.1:${server?.listeningPort}/video" else null,
      "error" to error,
    )
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
    if (wifiOnly) {
      val unmetered = isUnmeteredNetwork()
      if (!unmetered && !pausedForNetwork) {
        current.pause()
        pausedForNetwork = true
        state = "paused"
        message = "Wi-Fi connection lost. Streaming will resume automatically on Wi-Fi."
      } else if (unmetered && pausedForNetwork) {
        current.resume()
        pausedForNetwork = false
        state = if (contiguousAvailableBytes() >= minimumBufferBytes()) "ready" else "buffering"
        message = "Wi-Fi restored. Download resumed."
      }
    }
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

  private fun minimumBufferBytes(): Long = minOf(selectedFileSize, maxOf(12L * 1024 * 1024, selectedFileSize / 100))

  @Synchronized
  fun pause() {
    if (handle == null) return
    pausedForNetwork = false
    handle?.pause(); state = "paused"; message = "Download paused."; emit()
  }

  @Synchronized
  fun resume() {
    if (handle == null) return
    if (wifiOnly && !isUnmeteredNetwork()) {
      pausedForNetwork = true
      state = "paused"; message = "Waiting for Wi-Fi before resuming."; emit(); return
    }
    pausedForNetwork = false
    handle?.resume(); state = if (contiguousAvailableBytes() >= minimumBufferBytes()) "ready" else "buffering"; message = "Download resumed."; emit()
  }

  @Synchronized
  fun stop(removeFiles: Boolean) {
    sessionGeneration += 1L
    poller?.cancel(true); poller = null
    server?.stop(); server = null
    runCatching { session?.stop() }; session = null; handle = null
    selectedFileIndex = -1; selectedFile = null; selectedFileSize = 0
    selectedFirstPiece = -1; selectedLastPiece = -1; selectedFirstPieceOffset = 0L
    contiguousPieceCursor = -1; contiguousBytes = 0L
    startedAtMs = 0L; lastBufferAdvanceAtMs = 0L; lastObservedContiguousBytes = 0L
    pausedForNetwork = false
    state = "idle"; message = "Choose a source to begin."; error = null
    sessionDir.setLastModified(System.currentTimeMillis())
    if (removeFiles) clearCache()
  }

  @Synchronized
  fun clearCache(): Long {
    if (handle != null || session != null) stop(false)
    val bytes = directorySize(cacheRoot)
    cacheRoot.deleteRecursively(); cacheRoot.mkdirs()
    return bytes
  }

  @Synchronized
  fun cacheStats(): Map<String, Long> {
    cacheRoot.mkdirs()
    return mapOf(
      "bytes" to directorySize(cacheRoot),
      "freeBytes" to StatFs(cacheRoot.absolutePath).availableBytes,
      "maxBytes" to maxCacheBytes,
    )
  }

  @Synchronized
  fun destroy() {
    stop(false)
    scheduler.shutdownNow()
  }

  @Synchronized
  private fun fail(reason: String) {
    transitionToError(reason)
    emit()
  }

  @Synchronized
  private fun transitionToError(reason: String) {
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

  private fun reinforcePeerDiscovery(torrentHandle: TorrentHandle) {
    val existing = runCatching { torrentHandle.trackers().map { it.url() }.toSet() }.getOrDefault(emptySet())
    FALLBACK_TRACKERS.filterNot(existing::contains).forEach { tracker ->
      runCatching { torrentHandle.addTracker(AnnounceEntry(tracker)) }
    }
    runCatching { torrentHandle.forceReannounce() }
    runCatching { torrentHandle.forceDHTAnnounce() }
    runCatching { torrentHandle.forceLSDAnnounce() }
  }

  private fun fetchTorrentInfo(urls: List<String>): TorrentInfo? {
    for (value in urls.distinct().take(2)) {
      val uri = runCatching { URI(value) }.getOrNull() ?: continue
      if (uri.scheme != "https" || !isAllowedMetadataHost(uri.host)) continue
      val bytes = runCatching {
        val connection = uri.toURL().openConnection() as HttpURLConnection
        try {
          connection.instanceFollowRedirects = true
          connection.connectTimeout = METADATA_HTTP_TIMEOUT_MS
          connection.readTimeout = METADATA_HTTP_TIMEOUT_MS
          connection.setRequestProperty("Accept", "application/x-bittorrent, application/octet-stream;q=0.9, */*;q=0.5")
          connection.setRequestProperty("User-Agent", "StreamNyaa Android/1.0")
          connection.connect()
          if (connection.responseCode !in 200..299) error("HTTP ${connection.responseCode}")
          if (connection.url.protocol != "https" || !isAllowedMetadataHost(connection.url.host)) error("Unsafe metadata redirect")
          val declared = connection.contentLengthLong
          if (declared > MAX_TORRENT_METADATA_BYTES) error("Torrent metadata is too large")
          connection.inputStream.use { input ->
            val output = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(16 * 1024)
            while (true) {
              val count = input.read(buffer)
              if (count < 0) break
              output.write(buffer, 0, count)
              if (output.size() > MAX_TORRENT_METADATA_BYTES) error("Torrent metadata is too large")
            }
            output.toByteArray()
          }
        } finally {
          connection.disconnect()
        }
      }.getOrNull() ?: continue
      if (bytes.isEmpty() || bytes.first() != 'd'.code.toByte()) continue
      val info = runCatching { TorrentInfo(bytes) }.getOrNull()
      if (info != null && info.isValid) return info
    }
    return null
  }

  private fun isAllowedMetadataHost(host: String?): Boolean {
    val normalized = host?.lowercase() ?: return false
    return normalized == "www.streamnyaa.xyz" || normalized == "streamnyaa.xyz" || normalized == "nyaa.si" || normalized.endsWith(".nyaa.si")
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
  private fun torrentKey(magnet: String): String {
    val hash = Regex("(?i)(?:xt=urn:btih:)([a-z0-9]+)").find(magnet)?.groupValues?.getOrNull(1)
    return hash?.lowercase()?.take(64) ?: magnet.hashCode().toUInt().toString(16)
  }

  private fun isUnmeteredNetwork(): Boolean {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
    val network = manager.activeNetwork ?: return false
    val capabilities = manager.getNetworkCapabilities(network) ?: return false
    return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
      || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
  }

  private fun trimCache(limit: Long) {
    var total = directorySize(cacheRoot)
    if (total <= limit) return
    cacheRoot.listFiles()
      ?.filter { it != sessionDir }
      ?.sortedBy { it.lastModified() }
      ?.forEach { entry ->
        if (total <= limit) return@forEach
        val size = directorySize(entry)
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
    private const val METADATA_TIMEOUT_MS = 30_000L
    private const val NO_PEER_TIMEOUT_MS = 20_000L
    private const val BUFFER_STALL_TIMEOUT_MS = 28_000L
    private const val PLAYBACK_READY_TIMEOUT_MS = 48_000L
    private const val METADATA_HTTP_TIMEOUT_MS = 8_000
    private const val MAX_TORRENT_METADATA_BYTES = 5 * 1024 * 1024
    private const val DHT_BOOTSTRAP_NODES = "dht.libtorrent.org:25401,router.bittorrent.com:6881,router.utorrent.com:6881,dht.transmissionbt.com:6881"
    private val FALLBACK_TRACKERS = listOf(
      "http://nyaa.tracker.wf:7777/announce",
      "udp://open.stealth.si:80/announce",
      "udp://tracker.opentrackr.org:1337/announce",
      "udp://exodus.desync.com:6969/announce",
      "udp://tracker.torrent.eu.org:451/announce",
    )
  }
}
