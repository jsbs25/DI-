package com.earthone.network

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.wireguard.crypto.Key
import com.wireguard.crypto.KeyPair

/**
 * Generates and stores the device's WireGuard Curve25519 private key exclusively inside
 * Android Keystore-encrypted SharedPreferences. Private keys NEVER leave the device.
 */
object OneKeyStoreManager {
    private const val PREF_FILE = "one_wireguard_vault"
    private const val KEY_PRIVATE_BASE64 = "wg_private_key_base64"

    private fun vault(context: Context) = EncryptedSharedPreferences.create(
        context,
        PREF_FILE,
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    @Synchronized
    fun ensureKeyPair(context: Context): KeyPair {
        val prefs = vault(context)
        val existing = prefs.getString(KEY_PRIVATE_BASE64, null)
        if (!existing.isNullOrBlank()) {
            runCatching {
                val priv = Key.fromBase64(existing)
                return KeyPair(priv)
            }
        }
        val fresh = KeyPair()
        prefs.edit().putString(KEY_PRIVATE_BASE64, fresh.privateKey.toBase64()).apply()
        return fresh
    }

    fun getPublicKeyBase64(context: Context): String {
        return ensureKeyPair(context).publicKey.toBase64()
    }

    fun getPrivateKeyBase64(context: Context): String {
        return ensureKeyPair(context).privateKey.toBase64()
    }

    @Synchronized
    fun rotateKeyPair(context: Context): String {
        val fresh = KeyPair()
        vault(context).edit().putString(KEY_PRIVATE_BASE64, fresh.privateKey.toBase64()).apply()
        return fresh.publicKey.toBase64()
    }
}
