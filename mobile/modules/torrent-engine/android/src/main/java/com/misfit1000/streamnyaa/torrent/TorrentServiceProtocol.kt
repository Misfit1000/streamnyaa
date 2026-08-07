package com.misfit1000.streamnyaa.torrent

import android.os.Bundle

internal object TorrentServiceProtocol {
  const val REGISTER = 1
  const val UNREGISTER = 2
  const val START = 3
  const val STATUS = 4
  const val PAUSE = 5
  const val RESUME = 6
  const val STOP = 7
  const val CLEAR_CACHE = 8
  const val CACHE_STATS = 9
  const val RESPONSE = 100
  const val STATUS_EVENT = 101

  const val REQUEST_ID = "requestId"
  const val RESULT = "result"
  const val ERROR = "error"
  const val VALUE = "value"

  fun mapToBundle(values: Map<String, Any?>): Bundle = Bundle().apply {
    values.forEach { (key, value) ->
      when (value) {
        null -> putString(key, null)
        is Boolean -> putBoolean(key, value)
        is Int -> putInt(key, value)
        is Long -> putLong(key, value)
        is Float -> putDouble(key, value.toDouble())
        is Double -> putDouble(key, value)
        is Number -> putDouble(key, value.toDouble())
        else -> putString(key, value.toString())
      }
    }
  }

  fun bundleToMap(bundle: Bundle): Map<String, Any?> = bundle.keySet().associateWith { key -> bundle.get(key) }
}
