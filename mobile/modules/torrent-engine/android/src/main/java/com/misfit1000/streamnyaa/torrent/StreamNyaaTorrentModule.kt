package com.misfit1000.streamnyaa.torrent

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

class StreamNyaaTorrentModule : Module() {
  @Volatile private var service: Messenger? = null
  @Volatile private var connectionFuture = CompletableFuture<Messenger>()
  @Volatile private var bound = false
  private val requestIds = AtomicLong(1L)
  private val pending = ConcurrentHashMap<Long, CompletableFuture<Bundle>>()
  private val callbackMessenger = Messenger(IncomingHandler(Looper.getMainLooper()))

  private val connection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
      val next = Messenger(checkNotNull(binder))
      service = next
      bound = true
      connectionFuture.complete(next)
      runCatching { next.send(Message.obtain(null, TorrentServiceProtocol.REGISTER).apply { replyTo = callbackMessenger }) }
    }

    override fun onServiceDisconnected(name: ComponentName?) = handleWorkerExit("The streaming worker stopped unexpectedly. Try another source.")
    override fun onBindingDied(name: ComponentName?) = handleWorkerExit("Android restarted the streaming worker. Try playback again.")
    override fun onNullBinding(name: ComponentName?) = handleWorkerExit("The streaming worker is unavailable in this build.")
  }

  override fun definition() = ModuleDefinition {
    Name("StreamNyaaTorrent")
    Events("onStatus")

    OnCreate { connect() }

    Function("isSupported") {
      Build.SUPPORTED_ABIS.any { it == "arm64-v8a" || it == "armeabi-v7a" || it == "x86_64" || it == "x86" }
    }

    AsyncFunction("startStream") { magnet: String, preferredFile: String?, options: Map<String, Any?> ->
      startWorker()
      statusFrom(rpc(TorrentServiceProtocol.START, Bundle().apply {
        putString("magnet", magnet)
        putString("preferredFile", preferredFile)
        putBoolean("wifiOnly", options["wifiOnly"] as? Boolean ?: false)
        putLong("maxCacheMiB", (options["maxCacheMiB"] as? Number)?.toLong() ?: 2048L)
        putBoolean("batterySaver", options["batterySaver"] as? Boolean ?: true)
      }, START_TIMEOUT_SECONDS))
    }

    AsyncFunction("getStatus") { statusFrom(rpc(TorrentServiceProtocol.STATUS)) }
    AsyncFunction("pause") { rpc(TorrentServiceProtocol.PAUSE); Unit }
    AsyncFunction("resume") { rpc(TorrentServiceProtocol.RESUME); Unit }
    AsyncFunction("stop") { removeFiles: Boolean -> rpc(TorrentServiceProtocol.STOP, Bundle().apply { putBoolean("removeFiles", removeFiles) }); Unit }
    AsyncFunction("clearCache") { rpc(TorrentServiceProtocol.CLEAR_CACHE).getLong(TorrentServiceProtocol.VALUE) }
    AsyncFunction("getCacheStats") { statusFrom(rpc(TorrentServiceProtocol.CACHE_STATS)) }

    OnDestroy { disconnect() }
  }

  @Synchronized
  private fun connect() {
    if (service != null || (bound && !connectionFuture.isCompletedExceptionally)) return
    if (connectionFuture.isDone) connectionFuture = CompletableFuture()
    val context = appContext.reactContext?.applicationContext ?: return
    val intent = Intent(context, TorrentStreamService::class.java)
    bound = context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
    if (!bound) connectionFuture.completeExceptionally(IllegalStateException("Android could not bind the streaming worker."))
  }

  private fun startWorker() {
    val context = checkNotNull(appContext.reactContext?.applicationContext) { "The Android app runtime is not ready." }
    val intent = Intent(context, TorrentStreamService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    connect()
  }

  private fun rpc(action: Int, payload: Bundle = Bundle(), timeoutSeconds: Long = DEFAULT_TIMEOUT_SECONDS): Bundle {
    val worker = service ?: run {
      connect()
      connectionFuture.get(CONNECTION_TIMEOUT_SECONDS, TimeUnit.SECONDS)
    }
    val requestId = requestIds.getAndIncrement()
    val future = CompletableFuture<Bundle>()
    pending[requestId] = future
    payload.putLong(TorrentServiceProtocol.REQUEST_ID, requestId)
    try {
      worker.send(Message.obtain(null, action).apply { data = payload; replyTo = callbackMessenger })
      val response = future.get(timeoutSeconds, TimeUnit.SECONDS)
      response.getString(TorrentServiceProtocol.ERROR)?.takeIf(String::isNotBlank)?.let { throw IllegalStateException(it) }
      return response
    } finally {
      pending.remove(requestId)
    }
  }

  private fun statusFrom(response: Bundle): Map<String, Any?> =
    TorrentServiceProtocol.bundleToMap(response.getBundle(TorrentServiceProtocol.RESULT) ?: Bundle.EMPTY)

  private inner class IncomingHandler(looper: Looper) : Handler(looper) {
    override fun handleMessage(message: Message) {
      when (message.what) {
        TorrentServiceProtocol.RESPONSE -> {
          val requestId = message.data.getLong(TorrentServiceProtocol.REQUEST_ID)
          pending.remove(requestId)?.complete(message.data)
        }
        TorrentServiceProtocol.STATUS_EVENT -> {
          val status = TorrentServiceProtocol.bundleToMap(message.data.getBundle(TorrentServiceProtocol.RESULT) ?: Bundle.EMPTY)
          runCatching { sendEvent("onStatus", status) }
        }
      }
    }
  }

  @Synchronized
  private fun handleWorkerExit(reason: String) {
    service = null
    bound = false
    connectionFuture = CompletableFuture()
    pending.values.forEach { it.completeExceptionally(IllegalStateException(reason)) }
    pending.clear()
    runCatching {
      sendEvent("onStatus", mapOf(
        "state" to "error", "message" to reason, "error" to reason,
        "progress" to 0.0, "bufferedPercent" to 0.0, "peers" to 0, "downloadRate" to 0.0,
      ))
    }
  }

  @Synchronized
  private fun disconnect() {
    val context = appContext.reactContext?.applicationContext ?: return
    runCatching { service?.send(Message.obtain(null, TorrentServiceProtocol.UNREGISTER).apply { replyTo = callbackMessenger }) }
    if (bound) runCatching { context.unbindService(connection) }
    runCatching { context.stopService(Intent(context, TorrentStreamService::class.java)) }
    service = null
    bound = false
    pending.values.forEach { it.cancel(true) }
    pending.clear()
  }

  companion object {
    private const val CONNECTION_TIMEOUT_SECONDS = 8L
    private const val DEFAULT_TIMEOUT_SECONDS = 15L
    private const val START_TIMEOUT_SECONDS = 45L
  }
}
