package com.flowtv.player

import android.os.Bundle
import android.webkit.WebSettings
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
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

