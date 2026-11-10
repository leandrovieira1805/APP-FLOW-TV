package com.flowtv.player

import android.content.Context
import android.content.SharedPreferences

class DevicePreference(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)

    fun getDeviceType(): String? {
        return prefs.getString(Constants.KEY_DEVICE_TYPE, null)
    }

    fun setDeviceType(deviceType: String) {
        prefs.edit().putString(Constants.KEY_DEVICE_TYPE, deviceType).apply()
    }

    fun clearDeviceType() {
        prefs.edit().remove(Constants.KEY_DEVICE_TYPE).apply()
    }

    fun isConfigured(): Boolean {
        return getDeviceType() != null
    }
}
