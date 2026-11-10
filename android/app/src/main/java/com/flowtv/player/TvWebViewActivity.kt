package com.flowtv.player

import android.annotation.SuppressLint
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class TvWebViewActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var errorLayout: View
    private lateinit var btnTryAgain: Button
    private lateinit var devicePreference: DevicePreference
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var webViewState: Bundle? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_tv_webview)
        devicePreference = DevicePreference(this)
        initViews()
        configureWebView()
        enableFullscreen()
        setupListeners()
        loadUrl()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (customView != null) {
                    hideCustomView()
                } else if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })
    }

    private fun initViews() {
        webView = findViewById(R.id.webView)
        errorLayout = findViewById(R.id.errorLayout)
        btnTryAgain = errorLayout.findViewById(R.id.btnTryAgain)
    }

    private fun configureWebView() {
        WebViewManager.configureWebView(webView, this, true)
        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                // O erro só deve mostrar a tela de erro se for no frame principal (a página inteira)
                // Se não checar isso, qualquer imagem, iframe ou script bloqueado vai disparar a tela de "Sem conexão"
                if (request?.isForMainFrame == true) {
                    showErrorScreen()
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                hideErrorScreen()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (view == null) return
                showCustomView(view, callback)
            }

            override fun onHideCustomView() {
                hideCustomView()
            }
        }
    }

    private fun setupListeners() {
        btnTryAgain.setOnClickListener {
            hideErrorScreen()
            loadUrl()
        }
    }

    private fun loadUrl() {
        if (isNetworkAvailable()) {
            hideErrorScreen()
            webView.loadUrl(Constants.REMOTE_APP_URL)
        } else {
            showErrorScreen()
        }
    }

    private fun isNetworkAvailable(): Boolean {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val capabilities = connectivityManager.getNetworkCapabilities(connectivityManager.activeNetwork)
        return capabilities != null && (
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
        )
    }

    private fun showErrorScreen() {
        errorLayout.visibility = View.VISIBLE
        webView.visibility = View.GONE
    }

    private fun hideErrorScreen() {
        errorLayout.visibility = View.GONE
        webView.visibility = View.VISIBLE
    }

    private fun enableFullscreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).let { controller ->
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun showCustomView(view: View, callback: WebChromeClient.CustomViewCallback?) {
        val decor = window.decorView as FrameLayout
        if (customView != null) {
            callback?.onCustomViewHidden()
            return
        }

        customView = view
        customViewCallback = callback
        
        // Deixar VISIBLE! Se mudar para INVISIBLE ou GONE, o motor do WebView pausa 
        // a reprodução do vídeo e o áudio para!
        webView.visibility = View.VISIBLE
        view.setBackgroundColor(android.graphics.Color.BLACK)

        decor.addView(
            view,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        
        view.bringToFront()
        view.requestFocus()
        
        enableFullscreen()
    }

    private fun hideCustomView() {
        val decor = window.decorView as FrameLayout
        customView?.let { decor.removeView(it) }
        customView = null
        
        webView.visibility = View.VISIBLE
        customViewCallback?.onCustomViewHidden()
        customViewCallback = null
        
        enableFullscreen()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        webView.restoreState(savedInstanceState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webViewState?.let {
            webView.restoreState(it)
        }
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        val state = Bundle()
        webView.saveState(state)
        webViewState = state
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_change_device -> {
                showChangeDeviceDialog()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun showChangeDeviceDialog() {
        AlertDialog.Builder(this)
            .setTitle(R.string.change_device_title)
            .setMessage(R.string.change_device_message)
            .setPositiveButton(R.string.yes) { _, _ ->
                devicePreference.clearDeviceType()
                NavigationManager.restartApp(this)
                finish()
            }
            .setNegativeButton(R.string.no, null)
            .show()
    }
}
