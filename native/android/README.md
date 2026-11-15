# ONE Android 原生模块说明（WireGuard VPN + FCM 来电 + ForegroundService）

本目录提供 **ONE 系统级 VPN（Mode B）** 与 **ONE Communication 后台来电唤醒** 的 Android 原生 Kotlin 模块骨架，基于官方 `wireguard-android`（Apache-2.0）、Android `VpnService`、Firebase Cloud Messaging (FCM) 及 Android 14 Foreground Service API。

## 1. 模块清单
- `app/src/main/java/com/earthone/network/OneKeyStoreManager.kt`：使用 Android Keystore (`MasterKey AES256_GCM`) + `EncryptedSharedPreferences` 本地生成并保护 Curve25519 私钥；私钥永不上传 ONE 服务器。
- `app/src/main/java/com/earthone/network/OneVpnBackend.kt`：封装 `com.wireguard.android.backend.GoBackend`，负责 `VpnService.prepare()` 授权检测、解析 `/api/network/devices/:id/config` 配置模板启动全机 L3 VPN 隧道，以及可选应用分流（Split-Tunnel）。
- `app/src/main/java/com/earthone/calls/OneCallMessagingService.kt`：高优先级 FCM Data Push 接收器（Android 12+ `Notification.CallStyle` 锁屏来电全屏唤醒）与 `OneActiveCallForegroundService`（Android 14 `microphone|camera|phoneCall` 前台保活服务）。

## 2. Gradle 关键依赖示例（`app/build.gradle.kts`）
```kotlin
android {
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.0.4")
    implementation("com.wireguard.android:tunnel:1.0.20230706")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("com.google.firebase:firebase-messaging-ktx:24.0.0")
    implementation("io.livekit:livekit-android:2.8.0")
}
```

## 3. `AndroidManifest.xml` 权限与组件声明
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CAMERA" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />

<application ...>
    <service
        android:name="com.wireguard.android.backend.GoBackend$VpnService"
        android:permission="android.permission.BIND_VPN_SERVICE"
        android:exported="false">
        <intent-filter>
            <action android:name="android.net.VpnService" />
        </intent-filter>
    </service>

    <service
        android:name="com.earthone.calls.OneActiveCallForegroundService"
        android:exported="false"
        android:foregroundServiceType="microphone|camera|phoneCall" />

    <service
        android:name="com.earthone.calls.OneCallMessagingService"
        android:exported="false">
        <intent-filter>
            <action android:name="com.google.firebase.MESSAGING_EVENT" />
        </intent-filter>
    </service>
</application>
```

## 4. 编译与真机边界声明
- 当前开发环境为 Linux/Node.js 容器，**未安装 Android SDK / NDK，无法直接编译 `.apk/.aab` 或真机测试 Android `VpnService` 与 FCM 后台推送**。
- 在 Android Studio 中集成上述模块并配置 `google-services.json`（FCM）后，即可真机打包验证系统级 WireGuard VPN 与息屏高优先级来电提醒。
