package com.misfit1000.streamnyaa.torrent

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.StatFs
import org.libtorrent4j.AlertListener
import org.libtorrent4j.Priority
import org.libtorrent4j.SessionManager
import org.libtorrent4j.TorrentFlags
import org.libtorrent4j.TorrentHandle
import org.libtorrent4j.alerts.AddTorrentAlert
import org.libtorrent4j.alerts.Alert
import org.libtorrent4j.alerts.AlertType
import org.libtorrent4j.alerts.MetadataReceivedAlert
import org.libtorrent4j.alerts.TorrentErrorAlert
import java.io.File
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
  private var server: LocalTorrentHttpServer? = null
  private var poller: ScheduledFuture<*>? = null
  private var state = "idle"
  private var message = "Choose a source to begin."
  private var error: String? = null
  private var preferredFile: String? = null
  private var maxCacheBytes = 2L * 1024 * 1024 * 1024
  private var batterySaver = true

  @Synchronized
  fun start(magnet: String, preferredFile: String?, options: Map<String, Any?>) {
    require(magnet.startsWith("magnet:?")) { "A valid magnet URI is required." }
    stop(false)
    cacheRoot.mkdirs()
    maxCacheBytes = ((options["maxCacheMiB"] as? Number)?.toLong() ?: 2048L).coerceIn(512L, 8192L) * 1024 * 1024
    batterySaver = options["batterySaver"] as? Boolean ?: true
    if (options["wifiOnly"] == true && !isUnmeteredNetwork()) {
      return fail("Wi-Fi-only streaming is enabled. Connect to Wi-Fi or change the setting.")
    }
    if (StatFs(cacheRoot.absolutePath).availableBytes < MINIMUM_FREE_BYTES) {
      return fail("Not enough free storage to buffer safely. Clear the streaming cache and try again.")
    }
    sessionDir = cacheRoot
    trimCache(maxCacheBytes)
    sessionDir = File(cacheRoot, torrentKey(magnet)).apply { mkdirs(); setLastModified(System.currentTimeMillis()) }
    this.preferredFile = preferredFile
    state = "metadata"
    message = "Connecting to peers and loading metadata…"
    error = null
    emit()

    val nextSession = SessionManager(false)
    nextSession.addListener(object : AlertListener {
      override fun types(): IntArray? = null
      override fun alert(alert: Alert<*>) {
        when (alert.type()) {
          AlertType.ADD_TORRENT -> {
            handle = (alert as AddTorrentAlert).handle().also { it.resume() }
            if (handle?.torrentFile() != null) configureSelectedFile(requireNotNull(handle))
          }
          AlertType.METADATA_RECEIVED -> configureSelectedFile((alert as MetadataReceivedAlert).handle())
          AlertType.TORRENT_ERROR -> fail((alert as TorrentErrorAlert).error().message)
          else -> Unit
        }
      }
    })
    nextSession.start()
    session = nextSession
    nextSession.download(magnet, sessionDir, TorrentFlags.SEQUENTIAL_DOWNLOAD)
    val pollSeconds = if (batterySaver) 3L else 1L
    poller = scheduler.scheduleAtFixedRate({ emit() }, pollSeconds, pollSeconds, TimeUnit.SECONDS)
  }

  @Synchronized
  private fun configureSelectedFile(torrentHandle: TorrentHandle) {
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
    selectedFileIndex = candidates.firstOrNull { preferred != null && files.fileName(it).lowercase().contains(preferred) }
      ?: candidates.maxBy { files.fileSize(it) }
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

    val priorities = Priority.array(Priority.IGNORE, info.numFiles())
    priorities[selectedFileIndex] = Priority.TOP_PRIORITY
    torrentHandle.prioritizeFiles(priorities)
    torrentHandle.resume()
    handle = torrentHandle
    state = "buffering"
    message = "Buffering ${files.fileName(selectedFileIndex)}…"

    val nextServer = LocalTorrentHttpServer(
      fileProvider = { selectedFile },
      sizeProvider = { selectedFileSize },
      availableProvider = { availableBytes() },
      mimeProvider = { mimeFor(files.fileName(selectedFileIndex)) },
    )
    nextServer.start(5_000, false)
    server = nextServer
    emit()
  }

  @Synchronized
  fun status(): Map<String, Any?> {
    val torrentStatus = runCatching { handle?.status(true) }.getOrNull()
    val downloaded = availableBytes()
    val buffered = if (selectedFileSize > 0) ((downloaded.toDouble() / selectedFileSize) * 100).coerceIn(0.0, 100.0) else 0.0
    if (state == "buffering" && downloaded >= minimumBufferBytes()) {
      state = "ready"
      message = "Buffered and ready to play."
    }
    return mapOf(
      "state" to state,
      "message" to message,
      "progress" to ((torrentStatus?.progress() ?: 0f) * 100).roundToInt(),
      "bufferedPercent" to buffered,
      "peers" to (torrentStatus?.numPeers() ?: 0),
      "downloadRate" to (torrentStatus?.downloadPayloadRate() ?: 0),
      "fileName" to selectedFile?.name,
      "streamUrl" to if (downloaded >= minimumBufferBytes()) "http://127.0.0.1:${server?.listeningPort}/video" else null,
      "error" to error,
    )
  }

  @Synchronized
  private fun emit() { onStatus(status()) }

  private fun availableBytes(): Long {
    val current = handle ?: return 0
    if (selectedFileIndex < 0) return 0
    return runCatching { current.fileProgress(TorrentHandle.PIECE_GRANULARITY).getOrElse(selectedFileIndex) { 0L } }.getOrDefault(0L)
  }

  private fun minimumBufferBytes(): Long = minOf(selectedFileSize, maxOf(12L * 1024 * 1024, selectedFileSize / 100))

  @Synchronized
  fun pause() {
    if (handle == null) return
    handle?.pause(); state = "paused"; message = "Download paused."; emit()
  }

  @Synchronized
  fun resume() {
    if (handle == null) return
    handle?.resume(); state = if (availableBytes() >= minimumBufferBytes()) "ready" else "buffering"; message = "Download resumed."; emit()
  }

  @Synchronized
  fun stop(removeFiles: Boolean) {
    poller?.cancel(true); poller = null
    server?.stop(); server = null
    runCatching { session?.stop() }; session = null; handle = null
    selectedFileIndex = -1; selectedFile = null; selectedFileSize = 0
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
    handle?.pause()
    poller?.cancel(false); poller = null
    server?.stop(); server = null
    state = "error"; message = reason; error = reason; emit()
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
  }
}
