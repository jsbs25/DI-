package com.earthone.calls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Handles high-priority FCM push notifications for ONE Communication incoming voice/video calls,
 * displaying Android system CallStyle notifications + full-screen lockscreen wake intent.
 */
class OneCallMessagingService : FirebaseMessagingService() {
    companion object {
        const val CHANNEL_INCOMING_CALLS = "one_incoming_calls_v1"
        const val CHANNEL_ONGOING_CALL = "one_ongoing_call_v1"
        const val EXTRA_CALL_ID = "one_call_id"
        const val EXTRA_CALLER_NAME = "one_caller_name"
        const val EXTRA_CALL_KIND = "one_call_kind"
        const val ACTION_CALL_ANSWER = "com.earthone.app.ACTION_CALL_ANSWER"
        const val ACTION_CALL_DECLINE = "com.earthone.app.ACTION_CALL_DECLINE"
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Upload FCM device registration token to ONE authenticated API when session exists.
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data["type"] != "one_incoming_call") return

        val callId = data["callId"] ?: return
        val callerName = data["callerName"] ?: "ONE 联系人"
        val callKind = if (data["kind"] == "video") "video" else "audio"

        ensureCallNotificationChannels(applicationContext)
        showIncomingCallNotification(callId, callerName, callKind)
    }

    private fun showIncomingCallNotification(callId: String, callerName: String, callKind: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_CALL_ID, callId)
            putExtra(EXTRA_CALLER_NAME, callerName)
            putExtra(EXTRA_CALL_KIND, callKind)
        }
        val fullScreenPending = PendingIntent.getActivity(
            this,
            callId.hashCode(),
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val answerPending = PendingIntent.getBroadcast(
            this,
            (callId + "_ans").hashCode(),
            Intent(ACTION_CALL_ANSWER).setPackage(packageName).putExtra(EXTRA_CALL_ID, callId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val declinePending = PendingIntent.getBroadcast(
            this,
            (callId + "_dec").hashCode(),
            Intent(ACTION_CALL_DECLINE).setPackage(packageName).putExtra(EXTRA_CALL_ID, callId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = Notification.Builder(this, CHANNEL_INCOMING_CALLS)
            .setSmallIcon(android.R.drawable.stat_sys_phone_call)
            .setCategory(Notification.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPending, true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val caller = Person.Builder()
                .setName(callerName)
                .setImportant(true)
                .build()
            val style = Notification.CallStyle.forIncomingCall(caller, declinePending, answerPending)
                .setIsVideo(callKind == "video")
            builder.setStyle(style)
        } else {
            builder.setContentTitle(callerName)
                .setContentText(if (callKind == "video") "ONE 视频来电" else "ONE 语音来电")
                .addAction(Notification.Action.Builder(null, "接听", answerPending).build())
                .addAction(Notification.Action.Builder(null, "拒绝", declinePending).build())
        }

        manager.notify(callId.hashCode(), builder.build())
    }
}

/**
 * Foreground Service keeping microphone/camera & WebRTC/LiveKit media alive when app goes background.
 * Targets Android 14+ explicit `FOREGROUND_SERVICE_TYPE_MICROPHONE | CAMERA | PHONE_CALL`.
 */
class OneActiveCallForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureCallNotificationChannels(applicationContext)
        val callerName = intent?.getStringExtra(OneCallMessagingService.EXTRA_CALLER_NAME) ?: "ONE 通话中"
        val isVideo = intent?.getStringExtra(OneCallMessagingService.EXTRA_CALL_KIND) == "video"

        val notification = Notification.Builder(this, OneCallMessagingService.CHANNEL_ONGOING_CALL)
            .setSmallIcon(android.R.drawable.stat_sys_phone_call)
            .setContentTitle("ONE 通话进行中")
            .setContentText(callerName)
            .setCategory(Notification.CATEGORY_CALL)
            .setOngoing(true)
            .build()

        val fgsType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
            if (isVideo) {
                type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            }
            type
        } else {
            0
        }

        ServiceCompat.startForeground(this, 4101, notification, fgsType)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
}

private fun ensureCallNotificationChannels(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(OneCallMessagingService.CHANNEL_INCOMING_CALLS) == null) {
        val incoming = NotificationChannel(
            OneCallMessagingService.CHANNEL_INCOMING_CALLS,
            "ONE 来电通知",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "ONE 实时语音与视频来电提醒"
            enableVibration(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(incoming)
    }
    if (manager.getNotificationChannel(OneCallMessagingService.CHANNEL_ONGOING_CALL) == null) {
        val ongoing = NotificationChannel(
            OneCallMessagingService.CHANNEL_ONGOING_CALL,
            "ONE 正在通话",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "保持后台语音与视频通话连接"
        }
        manager.createNotificationChannel(ongoing)
    }
}
