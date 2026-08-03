package com.misfit1000.streamnyaa.torrent

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.libtorrent4j.LibTorrent

class StreamNyaaTorrentModule : Module() {
  private var engineInstance: TorrentStreamEngine? = null

  @Synchronized
  private fun engine(): TorrentStreamEngine {
    engineInstance?.let { return it }
    val context = checkNotNull(appContext.reactContext?.applicationContext) {
      "Android streaming is not available until the app runtime is ready."
    }
    return TorrentStreamEngine(context) { status ->
      runCatching { sendEvent("onStatus", status) }
    }.also { engineInstance = it }
  }

  override fun definition() = ModuleDefinition {
    Name("StreamNyaaTorrent")
    Events("onStatus")

    Function("isSupported") { runCatching { LibTorrent.version().isNotBlank() }.getOrDefault(false) }

    AsyncFunction("startStream") { magnet: String, preferredFile: String?, options: Map<String, Any?> ->
      engine().start(magnet, preferredFile, options)
      engine().status()
    }

    AsyncFunction("getStatus") { engine().status() }
    AsyncFunction("pause") { engineInstance?.pause() }
    AsyncFunction("resume") { engineInstance?.resume() }
    AsyncFunction("stop") { removeFiles: Boolean -> engineInstance?.stop(removeFiles) }
    AsyncFunction("clearCache") { engine().clearCache() }
    AsyncFunction("getCacheStats") { engine().cacheStats() }

    OnDestroy {
      engineInstance?.destroy()
      engineInstance = null
    }
  }
}
