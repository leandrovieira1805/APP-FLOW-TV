package com.flowtv.player

import android.content.Context
import android.content.Intent

object NavigationManager {
    fun navigateToMainActivity(context: Context) {
        val intent = Intent(context, MainActivity::class.java)
        context.startActivity(intent)
    }

    fun navigateToTvWebViewActivity(context: Context) {
        val intent = Intent(context, TvWebViewActivity::class.java)
        context.startActivity(intent)
    }

    fun navigateToDeviceSelectionActivity(context: Context) {
        val intent = Intent(context, DeviceSelectionActivity::class.java)
        context.startActivity(intent)
    }

    fun restartApp(context: Context) {
        val intent = Intent(context, SplashActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        context.startActivity(intent)
    }
}
