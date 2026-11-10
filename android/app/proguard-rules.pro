# Proguard rules for FLOW TV with R8 Full Optimization

# Keep line numbers for Play Console stack traces & crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Suppress warnings for optional / third-party classes
-dontwarn org.conscrypt.**
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.bouncycastle.**
-dontwarn kotlin.**
-dontwarn com.google.android.material.**
-dontwarn com.google.android.gms.**
-dontwarn org.apache.commons.**
-dontwarn android.media.**

# Capacitor Core & Plugin Interfaces
-keep public class * extends com.getcapacitor.Plugin {
    public <methods>;
}
-keep public class * extends com.getcapacitor.BridgeActivity {
    public <methods>;
}
-keep class com.getcapacitor.** { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
    @com.getcapacitor.annotation.CapacitorPlugin public <methods>;
    @com.getcapacitor.annotation.ActivityCallback public <methods>;
    @com.getcapacitor.annotation.PermissionCallback public <methods>;
}

# WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor Video Player Plugin & Helpers
-keep class com.jeep.plugin.capacitor.capacitorvideoplayer.** { *; }

# ExoPlayer Media Player & Audio/Video decoders
-keep class com.google.android.exoplayer2.** { *; }
-keep class androidx.media3.** { *; }
-keep class com.google.android.gms.cast.** { *; }

# AndroidX & Material
-keep class androidx.appcompat.** { *; }
-keep class androidx.core.splashscreen.** { *; }
