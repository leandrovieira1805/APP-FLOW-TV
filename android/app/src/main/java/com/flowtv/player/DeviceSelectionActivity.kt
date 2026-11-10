package com.flowtv.player

import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView

class DeviceSelectionActivity : AppCompatActivity() {

    private lateinit var devicePreference: DevicePreference
    private lateinit var ivLogo: ImageView
    private lateinit var tvTitle: TextView
    private lateinit var tvSubtitle: TextView
    private lateinit var cardMobile: MaterialCardView
    private lateinit var cardTv: MaterialCardView
    private lateinit var btnContinue: MaterialButton

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_device_selection)

        initViews()
        devicePreference = DevicePreference(this)

        // Hide continue button - we navigate immediately on card click
        btnContinue.visibility = View.GONE

        setupListeners()
        startAnimations()
    }

    private fun initViews() {
        ivLogo = findViewById(R.id.ivLogo)
        tvTitle = findViewById(R.id.tvTitle)
        tvSubtitle = findViewById(R.id.tvSubtitle)
        cardMobile = findViewById(R.id.cardMobile)
        cardTv = findViewById(R.id.cardTv)
        btnContinue = findViewById(R.id.btnContinue)
    }

    private fun setupListeners() {
        cardMobile.setOnClickListener {
            saveAndNavigate(Constants.DEVICE_TYPE_MOBILE)
        }

        cardTv.setOnClickListener {
            saveAndNavigate(Constants.DEVICE_TYPE_TV)
        }

        val focusedColor = Color.parseColor("#00E5FF")
        val defaultBorderColor = Color.parseColor("#2A3859")
        val focusedBg = Color.parseColor("#1D2C52")
        val defaultBg = Color.parseColor("#131D38")

        cardMobile.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                cardMobile.strokeColor = focusedColor
                cardMobile.strokeWidth = 6
                cardMobile.setCardBackgroundColor(focusedBg)
                cardMobile.cardElevation = 16f
                ViewCompat.animate(cardMobile)
                    .scaleX(1.06f)
                    .scaleY(1.06f)
                    .setDuration(200)
                    .setInterpolator(AccelerateDecelerateInterpolator())
                    .start()
            } else {
                cardMobile.strokeColor = defaultBorderColor
                cardMobile.strokeWidth = 2
                cardMobile.setCardBackgroundColor(defaultBg)
                cardMobile.cardElevation = 4f
                ViewCompat.animate(cardMobile)
                    .scaleX(1f)
                    .scaleY(1f)
                    .setDuration(200)
                    .setInterpolator(AccelerateDecelerateInterpolator())
                    .start()
            }
        }

        cardTv.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                cardTv.strokeColor = focusedColor
                cardTv.strokeWidth = 6
                cardTv.setCardBackgroundColor(focusedBg)
                cardTv.cardElevation = 16f
                ViewCompat.animate(cardTv)
                    .scaleX(1.06f)
                    .scaleY(1.06f)
                    .setDuration(200)
                    .setInterpolator(AccelerateDecelerateInterpolator())
                    .start()
            } else {
                cardTv.strokeColor = defaultBorderColor
                cardTv.strokeWidth = 2
                cardTv.setCardBackgroundColor(defaultBg)
                cardTv.cardElevation = 4f
                ViewCompat.animate(cardTv)
                    .scaleX(1f)
                    .scaleY(1f)
                    .setDuration(200)
                    .setInterpolator(AccelerateDecelerateInterpolator())
                    .start()
            }
        }
    }

    private fun saveAndNavigate(type: String) {
        devicePreference.setDeviceType(type)
        if (type == Constants.DEVICE_TYPE_MOBILE) {
            NavigationManager.navigateToMainActivity(this)
        } else {
            NavigationManager.navigateToTvWebViewActivity(this)
        }
        finish()
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
    }

    private fun startAnimations() {
        val handler = Handler(Looper.getMainLooper())
        
        handler.postDelayed({
            ViewCompat.animate(ivLogo)
                .alpha(1f)
                .translationY(0f)
                .setDuration(400)
                .setInterpolator(AccelerateDecelerateInterpolator())
                .start()
        }, 100)

        handler.postDelayed({
            ViewCompat.animate(tvTitle)
                .alpha(1f)
                .translationY(0f)
                .setDuration(400)
                .setInterpolator(AccelerateDecelerateInterpolator())
                .start()
        }, 200)

        handler.postDelayed({
            ViewCompat.animate(tvSubtitle)
                .alpha(1f)
                .translationY(0f)
                .setDuration(400)
                .setInterpolator(AccelerateDecelerateInterpolator())
                .start()
        }, 300)

        handler.postDelayed({
            ViewCompat.animate(cardMobile)
                .alpha(1f)
                .translationX(0f)
                .setDuration(500)
                .setInterpolator(AccelerateDecelerateInterpolator())
                .start()

            ViewCompat.animate(cardTv)
                .alpha(1f)
                .translationX(0f)
                .setDuration(500)
                .setInterpolator(AccelerateDecelerateInterpolator())
                .start()
        }, 400)
    }
}
