package com.misfit1000.streamnyaa.torrent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors

class TorrentStreamService : Service() {
  private val clients = CopyOnWriteArrayList<Messenger>()
  private val executor = Executors.newSingleThreadExecutor()
  private val messenger = Messenger(IncomingHandler(Looper.getMainLooper()))
  private lateinit var engine: TorrentStreamEngine

  override fun onCreate() {
    super.onCreate()
    engine = TorrentStreamEngine(applicationContext) { status -> broadcastStatus(status) }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    showForegroundNotification()
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder = messenger.binder

  override fun onTaskRemoved(rootIntent: Intent?) {
    runCatching { engine.stop(false) }
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    runCatching { engine.destroy() }
    clients.clear()
    executor.shutdownNow()
    super.onDestroy()
  }

  private inner class IncomingHandler(looper: Looper) : Handler(looper) {
    override fun handleMessage(message: Message) {
      when (message.what) {
        TorrentServiceProtocol.REGISTER -> {
          val client = message.replyTo
          client?.let { if (!clients.contains(it)) clients.add(it) }
          executor.execute { runCatching { client?.send(statusEvent(engine.status())) } }
        }
        TorrentServiceProtocol.UNREGISTER -> message.replyTo?.let(clients::remove)
        else -> {
          // Handler recycles an incoming Message as soon as handleMessage returns.
          // Snapshot every IPC value before handing work to the executor or the
          // command, Bundle and reply Messenger will be reset to 0/null.
          val messageType = message.what
          val request = Bundle(message.data)
          val replyTo = message.replyTo
          executor.execute { processRequest(messageType, request, replyTo) }
        }
      }
    }
  }

  private fun processRequest(messageWhat: Int, request: Bundle, replyTo: Messenger?) {
    val requestId = request.getLong(TorrentServiceProtocol.REQUEST_ID)
    val messageType = request.getInt(TorrentServiceProtocol.MESSAGE_TYPE, messageWhat)
    try {
      val response = Bundle().apply {
        putLong(TorrentServiceProtocol.REQUEST_ID, requestId)
        putInt(TorrentServiceProtocol.MESSAGE_TYPE, TorrentServiceProtocol.RESPONSE)
      }
      Log.i(TAG, "Torrent worker received command $messageType as request $requestId (message.what=$messageWhat).")
      when (messageType) {
        TorrentServiceProtocol.START -> {
          val startRequest = JSONObject(checkNotNull(request.getString(TorrentServiceProtocol.JSON)) { "The stream request is missing." })
          require(startRequest.optInt("protocolVersion", 0) == 1) { "Unsupported torrent bridge protocol." }
          val requestOptions = startRequest.optJSONObject("options") ?: JSONObject()
          val metadataUrls = requestOptions.optJSONArray("metadataUrls")?.let { urls ->
            (0 until urls.length()).mapNotNull { index -> urls.optString(index).takeIf(String::isNotBlank) }
          } ?: emptyList()
          val options = mapOf(
            "wifiOnly" to requestOptions.optBoolean("wifiOnly", false),
            "maxCacheMiB" to requestOptions.optLong("maxCacheMiB", 2048L),
            "batterySaver" to requestOptions.optBoolean("batterySaver", true),
            "performanceProfile" to requestOptions.optString("performanceProfile", "standard"),
            "animeId" to requestOptions.optString("animeId").takeIf(String::isNotBlank),
            "animeTitle" to requestOptions.optString("animeTitle").takeIf(String::isNotBlank),
            "episode" to requestOptions.optInt("episode", 0),
            "sourceTitle" to requestOptions.optString("sourceTitle").takeIf(String::isNotBlank),
            "infoHash" to requestOptions.optString("infoHash").takeIf(String::isNotBlank),
            "torrentUrl" to requestOptions.optString("torrentUrl").takeIf(String::isNotBlank),
            "metadataUrls" to metadataUrls,
          )
          engine.start(
            checkNotNull(startRequest.optString("magnet").takeIf(String::isNotBlank)) { "A magnet URI is required." },
            startRequest.optString("preferredFile").takeIf(String::isNotBlank),
            options,
          )
          response.putBundle(TorrentServiceProtocol.RESULT, TorrentServiceProtocol.mapToBundle(engine.status()))
        }
        TorrentServiceProtocol.STATUS -> response.putBundle(TorrentServiceProtocol.RESULT, TorrentServiceProtocol.mapToBundle(engine.status()))
        TorrentServiceProtocol.PAUSE -> engine.pause()
        TorrentServiceProtocol.RESUME -> engine.resume()
        TorrentServiceProtocol.STOP -> {
          engine.stop(request.getBoolean("removeFiles"))
          stopForeground(STOP_FOREGROUND_REMOVE)
          stopSelf()
        }
        TorrentServiceProtocol.CLEAR_CACHE -> response.putLong(TorrentServiceProtocol.VALUE, engine.clearCache())
        TorrentServiceProtocol.CACHE_STATS -> response.putBundle(TorrentServiceProtocol.RESULT, TorrentServiceProtocol.mapToBundle(engine.cacheStats()))
        TorrentServiceProtocol.CACHE_ENTRIES -> {
          val entries = JSONArray()
          engine.cacheEntries().forEach { entry -> entries.put(JSONObject(entry)) }
          response.putString(TorrentServiceProtocol.JSON, entries.toString())
        }
        TorrentServiceProtocol.REMOVE_CACHE_ENTRY -> response.putLong(
          TorrentServiceProtocol.VALUE,
          engine.removeCacheEntry(request.getString("infoHash").orEmpty()),
        )
        else -> error("Unknown streaming request $messageType")
      }
      replyTo?.send(Message.obtain().apply {
        what = TorrentServiceProtocol.RESPONSE
        data = response
      })
    } catch (throwable: Throwable) {
      val error = throwable.message?.takeIf(String::isNotBlank)?.take(240) ?: throwable.javaClass.simpleName
      Log.e(TAG, "Torrent worker request $messageType failed: $error", throwable)
      runCatching {
        replyTo?.send(Message.obtain().apply {
          what = TorrentServiceProtocol.RESPONSE
          data = Bundle().apply {
            putLong(TorrentServiceProtocol.REQUEST_ID, requestId)
            putInt(TorrentServiceProtocol.MESSAGE_TYPE, TorrentServiceProtocol.RESPONSE)
            putString(TorrentServiceProtocol.ERROR, error)
          }
        })
      }
    }
  }

  private fun statusEvent(status: Map<String, Any?>) = Message.obtain().apply {
    what = TorrentServiceProtocol.STATUS_EVENT
    data = Bundle().apply {
      putInt(TorrentServiceProtocol.MESSAGE_TYPE, TorrentServiceProtocol.STATUS_EVENT)
      putBundle(TorrentServiceProtocol.RESULT, TorrentServiceProtocol.mapToBundle(status))
    }
  }

  private fun broadcastStatus(status: Map<String, Any?>) {
    clients.forEach { client ->
      try {
        client.send(statusEvent(status))
      } catch (_: Throwable) {
        clients.remove(client)
      }
    }
  }

  private fun showForegroundNotification() {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Anime streaming", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Keeps the selected anime source connected while it buffers."
        setShowBadge(false)
      })
    }
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle("StreamNyaa is preparing playback")
      .setContentText("Buffering the selected source securely on this device")
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  companion object {
    private const val TAG = "StreamNyaaTorrent"
    private const val CHANNEL_ID = "streamnyaa-playback"
    private const val NOTIFICATION_ID = 4205
  }
}
