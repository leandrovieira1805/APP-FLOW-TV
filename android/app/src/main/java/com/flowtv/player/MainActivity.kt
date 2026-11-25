package com.flowtv.player

import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
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

        try {
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS)
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION)
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
            window.statusBarColor = android.graphics.Color.TRANSPARENT
            window.navigationBarColor = android.graphics.Color.TRANSPARENT
        } catch (_: Exception) {}

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

        @Suppress("DEPRECATION")
        window.decorView.setOnSystemUiVisibilityChangeListener { visibility ->
            if ((visibility and View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) {
                controller.hide(WindowInsetsCompat.Type.systemBars())
            }
        }
    }

    override fun onStart() {
        super.onStart()
        // Allow HTTP images inside the HTTPS WebView (Xtream IPTV panels serve
        // cover art over plain HTTP; without this the WebView blocks them as
        // mixed content and all thumbnails show blank).
        bridge?.webView?.settings?.apply {
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            userAgentString = "IPTVSmartersPlayer/1.0.0 (Linux; Android 10)"
            domStorageEnabled = true
            databaseEnabled = true
            useWideViewPort = true
            loadWithOverviewMode = true
        }
    }

    /**
     * Intercepta os comandos de controles remotos de Android TV, Google TV e Amazon Fire TV / Fire Stick.
     * Trata botão de voltar (Back), reproduzir/pausar, avançar, retroceder e menu.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val keyCode = event.keyCode
        val action = event.action

        if (action == KeyEvent.ACTION_DOWN) {
            when (keyCode) {
                KeyEvent.KEYCODE_BACK -> {
                    // Envia evento Escape/Back para a WebView para fechar modais, sair do player ou navegar
                    bridge?.webView?.evaluateJavascript(
                        """
                        (function() {
                            const escEvent = new KeyboardEvent('keydown', {
                                key: 'Escape',
                                code: 'Escape',
                                keyCode: 27,
                                which: 27,
                                bubbles: true,
                                cancelable: true
                            });
                            document.dispatchEvent(escEvent);
                            window.dispatchEvent(escEvent);
                        })();
                        """.trimIndent(), null
                    )
                }
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
                KeyEvent.KEYCODE_MEDIA_PLAY,
                KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                    bridge?.webView?.evaluateJavascript(
                        """
                        (function() {
                            const v = document.querySelector('video');
                            if (v) {
                                if (v.paused) { v.play().catch(function(){}); }
                                else { v.pause(); }
                            }
                        })();
                        """.trimIndent(), null
                    )
                }
                KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                    bridge?.webView?.evaluateJavascript(
                        """
                        (function() {
                            const v = document.querySelector('video');
                            if (v && v.duration) {
                                v.currentTime = Math.min(v.duration, v.currentTime + 10);
                            }
                        })();
                        """.trimIndent(), null
                    )
                }
                KeyEvent.KEYCODE_MEDIA_REWIND -> {
                    bridge?.webView?.evaluateJavascript(
                        """
                        (function() {
                            const v = document.querySelector('video');
                            if (v) {
                                v.currentTime = Math.max(0, v.currentTime - 10);
                            }
                        })();
                        """.trimIndent(), null
                    )
                }
                KeyEvent.KEYCODE_MENU -> {
                    bridge?.webView?.evaluateJavascript(
                        """
                        (function() {
                            const mEvent = new KeyboardEvent('keydown', {
                                key: 'm',
                                code: 'KeyM',
                                keyCode: 77,
                                which: 77,
                                bubbles: true,
                                cancelable: true
                            });
                            document.dispatchEvent(mEvent);
                        })();
                        """.trimIndent(), null
                    )
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }
}
