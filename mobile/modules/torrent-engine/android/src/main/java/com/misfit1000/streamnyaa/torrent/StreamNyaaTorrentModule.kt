package com.misfit1000.streamnyaa.torrent

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StreamNyaaTorrentModule : Module() {
  private val engine by lazy {
    TorrentStreamEngine(requireNotNull(appContext.reactContext)) { status ->
      sendEvent("onStatus", status)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("StreamNyaaTorrent")
    Events("onStatus")

    Function("isSupported") { true }

    AsyncFunction("startStream") { magnet: String, preferredFile: String?, options: Map<String, Any?> ->
      engine.start(magnet, preferredFile, options)
      engine.status()
    }

    AsyncFunction("getStatus") { engine.status() }
    AsyncFunction("pause") { engine.pause() }
    AsyncFunction("resume") { engine.resume() }
    AsyncFunction("stop") { removeFiles: Boolean -> engine.stop(removeFiles) }
    AsyncFunction("clearCache") { engine.clearCache() }
    AsyncFunction("getCacheStats") { engine.cacheStats() }

    OnDestroy { engine.destroy() }
  }
}
