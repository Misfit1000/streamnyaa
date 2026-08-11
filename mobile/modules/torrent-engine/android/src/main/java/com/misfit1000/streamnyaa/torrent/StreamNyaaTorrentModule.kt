package com.misfit1000.streamnyaa.torrent

import android.app.ActivityManager
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
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.util.ArrayDeque
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicLong
import org.json.JSONArray
import org.json.JSONObject

class StreamNyaaTorrentModule : Module() {
  @Volatile private var service: Messenger? = null
  @Volatile private var connectionFuture = CompletableFuture<Messenger>()
  @Volatile private var bound = false
  private val requestIds = AtomicLong(1L)
  private val pending = ConcurrentHashMap<Long, CompletableFuture<Bundle>>()
  private val callbackMessenger = Messenger(IncomingHandler(Looper.getMainLooper()))
  private val diagnostics = ArrayDeque<JSONObject>()

  private val connection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
      val next = Messenger(checkNotNull(binder))
      service = next
      bound = true
      connectionFuture.complete(next)
      diagnostic("info", "service", "SERVICE_CONNECTED", "Torrent worker connected.")
      runCatching {
        next.send(Message.obtain().apply {
          what = TorrentServiceProtocol.REGISTER
          replyTo = callbackMessenger
        })
      }
    }

    override fun onServiceDisconnected(name: ComponentName?) = handleWorkerExit("The streaming worker stopped unexpectedly. Try another source.")
    override fun onBindingDied(name: ComponentName?) = handleWorkerExit("Android restarted the streaming worker. Try playback again.")
    override fun onNullBinding(name: ComponentName?) = handleWorkerExit("The streaming worker is unavailable in this build.")
  }

  override fun definition() = ModuleDefinition {
    Name("StreamNyaaTorrent")
    Events("onStatus")

    OnCreate { connect() }

    Function("isSupported") { supportedAbi() }

    Function("getRuntimeProfile") {
      val context = appContext.reactContext?.applicationContext
      val manager = context?.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      val lowRam = manager?.isLowRamDevice ?: false
      val memoryClassMiB = manager?.memoryClass ?: 256
      mapOf(
        "resolvedProfile" to if (lowRam || memoryClassMiB <= 192) "constrained" else "standard",
        "lowRam" to lowRam,
        "memoryClassMiB" to memoryClassMiB,
      )
    }

    AsyncFunction("startStream") { requestJson: String ->
      try {
        val request = JSONObject(requestJson)
        require(request.optInt("protocolVersion", 0) == PROTOCOL_VERSION) { "Unsupported torrent bridge protocol." }
        require(request.optString("magnet").startsWith("magnet:?")) { "A valid magnet URI is required." }
        startWorker()
        val response = rpc(TorrentServiceProtocol.START, Bundle().apply {
          putString(TorrentServiceProtocol.JSON, request.toString())
        }, START_TIMEOUT_SECONDS, retryConnection = true)
        val status = statusFrom(response)
        diagnostic("info", status["connectionStage"]?.toString() ?: "engine-start", "START_ACCEPTED", status["message"]?.toString() ?: "Stream request accepted.")
        successJson(status)
      } catch (throwable: Throwable) {
        failureJson(throwable, "engine-start")
      }
    }

    AsyncFunction("getEngineHealth") { engineHealth().toString() }
    AsyncFunction("getDiagnostics") { synchronized(diagnostics) { JSONArray(diagnostics.toList()).toString() } }
    Function("clearDiagnostics") { synchronized(diagnostics) { diagnostics.clear() } }
    AsyncFunction("getStatus") { statusFrom(rpc(TorrentServiceProtocol.STATUS)) }
    AsyncFunction("pause") { rpc(TorrentServiceProtocol.PAUSE); Unit }
    AsyncFunction("resume") { rpc(TorrentServiceProtocol.RESUME); Unit }
    AsyncFunction("stop") { removeFiles: Boolean -> rpc(TorrentServiceProtocol.STOP, Bundle().apply { putBoolean("removeFiles", removeFiles) }); Unit }
    AsyncFunction("clearCache") { rpc(TorrentServiceProtocol.CLEAR_CACHE).getLong(TorrentServiceProtocol.VALUE) }
    AsyncFunction("getCacheStats") { statusFrom(rpc(TorrentServiceProtocol.CACHE_STATS)) }
    AsyncFunction("listCacheEntries") {
      val response = rpc(TorrentServiceProtocol.CACHE_ENTRIES)
      val array = JSONArray(response.getString(TorrentServiceProtocol.JSON) ?: "[]")
      (0 until array.length()).map { index ->
        val item = array.getJSONObject(index)
        item.keys().asSequence().associateWith { key -> item.opt(key).takeUnless { it === JSONObject.NULL } }
      }
    }
    AsyncFunction("removeCacheEntry") { infoHash: String ->
      rpc(TorrentServiceProtocol.REMOVE_CACHE_ENTRY, Bundle().apply { putString("infoHash", infoHash) })
        .getLong(TorrentServiceProtocol.VALUE)
    }

    OnDestroy { disconnect() }
  }

  @Synchronized
  private fun connect() {
    if (service != null || (bound && !connectionFuture.isCompletedExceptionally)) return
    if (connectionFuture.isDone) connectionFuture = CompletableFuture()
    val context = appContext.reactContext?.applicationContext ?: return
    val intent = Intent(context, TorrentStreamService::class.java)
    bound = context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
    if (!bound) {
      val failure = IllegalStateException("Android could not bind the streaming worker.")
      connectionFuture.completeExceptionally(failure)
      diagnostic("error", "service", "SERVICE_BIND_FAILED", failure.message.orEmpty())
    }
  }

  private fun startWorker() {
    val context = checkNotNull(appContext.reactContext?.applicationContext) { "The Android app runtime is not ready." }
    val intent = Intent(context, TorrentStreamService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    connect()
  }

  private fun rpc(
    action: Int,
    payload: Bundle = Bundle(),
    timeoutSeconds: Long = DEFAULT_TIMEOUT_SECONDS,
    retryConnection: Boolean = false,
  ): Bundle {
    var lastFailure: Throwable? = null
    val attempts = if (retryConnection) 2 else 1
    repeat(attempts) { attempt ->
      try {
        return rpcOnce(action, Bundle(payload), timeoutSeconds)
      } catch (throwable: Throwable) {
        lastFailure = throwable
        if (attempt + 1 >= attempts) return@repeat
        diagnostic("warning", "service", "SERVICE_RECONNECT", "Reconnecting to the torrent worker once.")
        resetConnection()
        startWorker()
      }
    }
    throw lastFailure ?: IllegalStateException("The streaming worker did not respond.")
  }

  private fun rpcOnce(action: Int, payload: Bundle, timeoutSeconds: Long): Bundle {
    val worker = service ?: run {
      connect()
      connectionFuture.get(CONNECTION_TIMEOUT_SECONDS, TimeUnit.SECONDS)
    }
    val requestId = requestIds.getAndIncrement()
    val future = CompletableFuture<Bundle>()
    pending[requestId] = future
    payload.putLong(TorrentServiceProtocol.REQUEST_ID, requestId)
    payload.putInt(TorrentServiceProtocol.MESSAGE_TYPE, action)
    try {
      diagnostic("info", "service", "RPC_SEND", "Sending command $action as request $requestId.")
      worker.send(Message.obtain().apply {
        what = action
        data = payload
        replyTo = callbackMessenger
      })
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
      val messageType = message.data.getInt(TorrentServiceProtocol.MESSAGE_TYPE, message.what)
      when (messageType) {
        TorrentServiceProtocol.RESPONSE -> {
          val requestId = message.data.getLong(TorrentServiceProtocol.REQUEST_ID)
          pending.remove(requestId)?.complete(message.data)
        }
        TorrentServiceProtocol.STATUS_EVENT -> {
          val status = TorrentServiceProtocol.bundleToMap(message.data.getBundle(TorrentServiceProtocol.RESULT) ?: Bundle.EMPTY)
          if (status["state"] == "error") diagnostic(
            "error",
            status["failureStage"]?.toString() ?: "torrent",
            "ENGINE_STATUS_ERROR",
            status["error"]?.toString() ?: status["message"]?.toString().orEmpty(),
          )
          runCatching { sendEvent("onStatus", status) }
        }
      }
    }
  }

  @Synchronized
  private fun handleWorkerExit(reason: String) {
    diagnostic("error", "service", "SERVICE_DISCONNECTED", reason)
    service = null
    bound = false
    connectionFuture = CompletableFuture()
    pending.values.forEach { it.completeExceptionally(IllegalStateException(reason)) }
    pending.clear()
    runCatching {
      sendEvent("onStatus", mapOf(
        "state" to "error", "message" to reason, "error" to reason,
        "progress" to 0.0, "bufferedPercent" to 0.0, "peers" to 0, "downloadRate" to 0.0,
        "connectionStage" to "failed", "failureStage" to "service",
      ))
    }
  }

  @Synchronized
  private fun resetConnection() {
    val context = appContext.reactContext?.applicationContext
    if (bound && context != null) runCatching { context.unbindService(connection) }
    service = null
    bound = false
    connectionFuture = CompletableFuture()
  }

  @Synchronized
  private fun disconnect() {
    val context = appContext.reactContext?.applicationContext ?: return
    runCatching {
      service?.send(Message.obtain().apply {
        what = TorrentServiceProtocol.UNREGISTER
        replyTo = callbackMessenger
      })
    }
    if (bound) runCatching { context.unbindService(connection) }
    runCatching { context.stopService(Intent(context, TorrentStreamService::class.java)) }
    service = null
    bound = false
    pending.values.forEach { it.cancel(true) }
    pending.clear()
  }

  private fun engineHealth(): JSONObject {
    val context = appContext.reactContext?.applicationContext
    val cacheWritable = runCatching {
      val marker = File(checkNotNull(context).cacheDir, ".streamnyaa-health")
      marker.writeText("ok")
      marker.delete()
    }.getOrDefault(false)
    val nativeLoaded = runCatching { Class.forName("org.libtorrent4j.swig.libtorrent_jni"); true }.getOrDefault(false)
    val loopback = runCatching {
      ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort > 0 }
    }.getOrDefault(false)
    return JSONObject().apply {
      put("protocolVersion", PROTOCOL_VERSION)
      put("supported", supportedAbi())
      put("serviceConnected", service != null)
      put("nativeLibraryLoaded", nativeLoaded)
      put("abi", Build.SUPPORTED_ABIS.firstOrNull().orEmpty())
      put("androidApi", Build.VERSION.SDK_INT)
      put("cacheWritable", cacheWritable)
      put("loopbackReachable", loopback)
      if (!nativeLoaded) put("details", "libtorrent4j JNI could not be loaded.")
    }
  }

  private fun successJson(status: Map<String, Any?>) = JSONObject().apply {
    put("ok", true)
    put("value", JSONObject(status))
  }.toString()

  private fun failureJson(throwable: Throwable, stage: String): String {
    val root = generateSequence(throwable) { it.cause }.last()
    val code = when (root) {
      is TimeoutException -> "ENGINE_TIMEOUT"
      is IllegalArgumentException -> "INVALID_START_REQUEST"
      else -> "ENGINE_START_FAILED"
    }
    val message = root.message?.takeIf(String::isNotBlank)?.take(240) ?: root.javaClass.simpleName
    diagnostic("error", stage, code, message)
    return JSONObject().apply {
      put("ok", false)
      put("error", JSONObject().apply {
        put("errorCode", code)
        put("message", message)
        put("stage", stage)
        put("retryable", root !is IllegalArgumentException)
      })
    }.toString()
  }

  private fun diagnostic(level: String, stage: String, code: String, message: String) {
    val safeMessage = message.replace(Regex("magnet:\\?[^\\s]+", RegexOption.IGNORE_CASE), "[magnet redacted]").take(240)
    Log.println(if (level == "error") Log.ERROR else if (level == "warning") Log.WARN else Log.INFO, TAG, "$stage/$code: $safeMessage")
    synchronized(diagnostics) {
      diagnostics.addLast(JSONObject().apply {
        put("at", System.currentTimeMillis())
        put("level", level)
        put("stage", stage)
        put("code", code)
        put("message", safeMessage)
      })
      while (diagnostics.size > MAX_DIAGNOSTICS) diagnostics.removeFirst()
    }
  }

  private fun supportedAbi() = Build.SUPPORTED_ABIS.any { it == "arm64-v8a" || it == "armeabi-v7a" || it == "x86_64" || it == "x86" }

  companion object {
    private const val TAG = "StreamNyaaTorrent"
    private const val PROTOCOL_VERSION = 1
    private const val MAX_DIAGNOSTICS = 80
    private const val CONNECTION_TIMEOUT_SECONDS = 8L
    private const val DEFAULT_TIMEOUT_SECONDS = 15L
    private const val START_TIMEOUT_SECONDS = 45L
  }
}
