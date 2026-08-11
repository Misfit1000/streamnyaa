package com.misfit1000.streamnyaa.torrent

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.SubtitleView
import org.json.JSONObject

internal object PlayerSubtitleStyler {
  fun apply(activity: Activity, request: JSONObject): Int {
    require(request.optInt("protocolVersion", 0) == 1) { "Unsupported subtitle style protocol." }
    val root = activity.window?.decorView ?: return 0
    val style = Style.from(request)
    var applied = 0
    visit(root) { subtitleView ->
      subtitleView.setApplyEmbeddedStyles(false)
      subtitleView.setApplyEmbeddedFontSizes(false)
      subtitleView.setFixedTextSize(TypedValue.COMPLEX_UNIT_SP, style.fontSizeSp)
      subtitleView.setBottomPaddingFraction(style.bottomPaddingFraction)
      subtitleView.setStyle(CaptionStyleCompat(
        style.foregroundColor,
        style.backgroundColor,
        Color.TRANSPARENT,
        style.edgeType,
        style.edgeColor,
        streamNyaaSemiboldTypeface(),
      ))
      applied += 1
    }
    return applied
  }

  private fun visit(view: View, apply: (SubtitleView) -> Unit) {
    if (view is SubtitleView) apply(view)
    if (view is ViewGroup) for (index in 0 until view.childCount) visit(view.getChildAt(index), apply)
  }

  private fun streamNyaaSemiboldTypeface(): Typeface {
    val base = Typeface.create("sans-serif", Typeface.NORMAL)
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) Typeface.create(base, 600, false)
    else Typeface.create("sans-serif-medium", Typeface.NORMAL)
  }

  private data class Style(
    val fontSizeSp: Float,
    val bottomPaddingFraction: Float,
    val foregroundColor: Int,
    val backgroundColor: Int,
    val edgeType: Int,
    val edgeColor: Int,
  ) {
    companion object {
      fun from(request: JSONObject): Style {
        val fontSize = when (request.optString("fontSize")) {
          "small" -> 14f
          "large" -> 19f
          "extra_large" -> 22f
          else -> 16f
        }
        val bottomPadding = when (request.optString("position")) {
          "low" -> 0.035f
          "high" -> 0.18f
          else -> 0.09f
        }
        val foreground = when (request.optString("textColor")) {
          "yellow" -> Color.rgb(255, 216, 107)
          "red" -> Color.rgb(255, 75, 85)
          "cyan" -> Color.rgb(77, 208, 225)
          else -> Color.rgb(255, 248, 247)
        }
        val background = when (request.optString("background")) {
          "off" -> Color.TRANSPARENT
          "dark" -> Color.argb(170, 0, 0, 0)
          else -> Color.argb(51, 0, 0, 0)
        }
        val outline = request.optString("outline", "medium")
        val shadow = request.optString("shadow", "off")
        val edgeType = when {
          outline != "none" -> CaptionStyleCompat.EDGE_TYPE_OUTLINE
          shadow != "off" -> CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW
          else -> CaptionStyleCompat.EDGE_TYPE_NONE
        }
        return Style(fontSize, bottomPadding, foreground, background, edgeType, Color.rgb(6, 7, 10))
      }
    }
  }
}
