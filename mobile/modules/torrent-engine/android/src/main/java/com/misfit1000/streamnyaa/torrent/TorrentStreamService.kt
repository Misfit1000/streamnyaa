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
          message.replyTo?.let { if (!clients.contains(it)) clients.add(it) }
          executor.execute { runCatching { message.replyTo?.send(statusEvent(engine.status())) } }
        }
        TorrentServiceProtocol.UNREGISTER -> message.replyTo?.let(clients::remove)
        else -> executor.execute { processRequest(message) }
      }
    }
  }

  private fun processRequest(message: Message) {
    val request = message.data ?: Bundle.EMPTY
    val requestId = request.getLong(TorrentServiceProtocol.REQUEST_ID)
    try {
      val response = Bundle().apply { putLong(TorrentServiceProtocol.REQUEST_ID, requestId) }
      when (message.what) {
        TorrentServiceProtocol.START -> {
          val options = mapOf(
            "wifiOnly" to request.getBoolean("wifiOnly"),
            "maxCacheMiB" to request.getLong("maxCacheMiB"),
            "batterySaver" to request.getBoolean("batterySaver"),
          )
          engine.start(checkNotNull(request.getString("magnet")), request.getString("preferredFile"), options)
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
        else -> error("Unknown streaming request ${message.what}")
      }
      message.replyTo?.send(Message.obtain(null, TorrentServiceProtocol.RESPONSE).apply { data = response })
    } catch (throwable: Throwable) {
      val error = throwable.message?.takeIf(String::isNotBlank)?.take(240) ?: throwable.javaClass.simpleName
      runCatching {
        message.replyTo?.send(Message.obtain(null, TorrentServiceProtocol.RESPONSE).apply {
          data = Bundle().apply {
            putLong(TorrentServiceProtocol.REQUEST_ID, requestId)
            putString(TorrentServiceProtocol.ERROR, error)
          }
        })
      }
    }
  }

  private fun statusEvent(status: Map<String, Any?>) = Message.obtain(null, TorrentServiceProtocol.STATUS_EVENT).apply {
    data = Bundle().apply { putBundle(TorrentServiceProtocol.RESULT, TorrentServiceProtocol.mapToBundle(status)) }
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
    val notification = Notification.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle("StreamNyaa is preparing playback")
      .setContentText("Buffering the selected source securely on this device")
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  companion object {
    private const val CHANNEL_ID = "streamnyaa-playback"
    private const val NOTIFICATION_ID = 4205
  }
}
