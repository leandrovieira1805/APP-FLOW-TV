package com.flowtv.player

import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebSettings
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        applyCutoutMode()
        super.onCreate(savedInstanceState)
        setupZeroInsets()
        applyFullscreenEdgeToEdge()
    }

    override fun onResume() {
        super.onResume()
        applyFullscreenEdgeToEdge()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            applyFullscreenEdgeToEdge()
        }
    }

    private fun setupZeroInsets() {
        // Prevent CoordinatorLayout and WebView from receiving insets and adding top/bottom padding
        try {
            bridge?.webView?.fitsSystemWindows = false
            findViewById<View>(android.R.id.content)?.fitsSystemWindows = false
            window.decorView.fitsSystemWindows = false

            ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, _ ->
                WindowInsetsCompat.CONSUMED
            }

            val webView = bridge?.webView
            if (webView != null) {
                ViewCompat.setOnApplyWindowInsetsListener(webView) { _, _ ->
                    WindowInsetsCompat.CONSUMED
                }
            }
        } catch (_: Exception) {}
    }

    private fun applyCutoutMode() {
        try {
            val lp = window.attributes
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
            window.attributes = lp
        } catch (_: Exception) {}
    }

    private fun applyFullscreenEdgeToEdge() {
        applyCutoutMode()

        // Allow window to lay out beyond screen limits into status/navigation/cutout areas
        window.setFlags(
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
        )

        // Don't let system windows fit decor (allows 100% full screen coverage)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // Hide status and navigation bars with swipe-to-show transient behavior
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())

        // Ensure flags are also active for full immersive sticky mode
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_FULLSCREEN
        )
    }

    override fun onStart() {
        super.onStart()
        // Allow HTTP images inside the HTTPS WebView (Xtream IPTV panels serve
        // cover art over plain HTTP; without this the WebView blocks them as
        // mixed content and all thumbnails show blank).
        bridge?.webView?.settings?.mixedContentMode =
            WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        bridge?.webView?.settings?.userAgentString =
            "IPTVSmartersPlayer/1.0.0 (Linux; Android 10)"
    }
}
