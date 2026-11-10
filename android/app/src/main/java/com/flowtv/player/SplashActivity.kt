package com.flowtv.player

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.ImageView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat

class SplashActivity : AppCompatActivity() {

    private lateinit var devicePreference: DevicePreference
    private lateinit var ivLogo: ImageView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)

        ivLogo = findViewById(R.id.ivLogo)
        devicePreference = DevicePreference(this)

        animateLogo()

        Handler(Looper.getMainLooper()).postDelayed({
            checkDeviceConfig()
        }, Constants.SPLASH_DELAY_MS)
    }

    private fun animateLogo() {
        ViewCompat.animate(ivLogo)
            .alpha(1f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(800)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .start()
    }

    private fun checkDeviceConfig() {
        val deviceType = devicePreference.getDeviceType()
        if (deviceType != null) {
            when (deviceType) {
                Constants.DEVICE_TYPE_MOBILE -> {
                    NavigationManager.navigateToMainActivity(this)
                }
                Constants.DEVICE_TYPE_TV -> {
                    NavigationManager.navigateToTvWebViewActivity(this)
                }
            }
        } else {
            NavigationManager.navigateToDeviceSelectionActivity(this)
        }
        finish()
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
    }
}

