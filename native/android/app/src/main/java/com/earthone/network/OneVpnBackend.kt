package com.earthone.network

import android.content.Context
import android.content.Intent
import com.wireguard.android.backend.Backend
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Statistics
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import java.io.BufferedReader
import java.io.StringReader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

/**
 * Mode B: System-level WireGuard VPN controller backed by official `wireguard-android` `GoBackend`
 * and Android `VpnService`. Distinct from Mode A (ONE Desktop browser proxy).
 */
class OneVpnBackend(context: Context) {
    private val appContext = context.applicationContext
    private val backend: Backend = GoBackend(appContext)

    private val _stateFlow = MutableStateFlow(Tunnel.State.DOWN)
    val stateFlow: StateFlow<Tunnel.State> = _stateFlow.asStateFlow()

    private val tunnel = object : Tunnel {
        override fun getName(): String = "one_wg0"
        override fun onStateChange(newState: Tunnel.State) {
            _stateFlow.value = newState
        }
    }

    /**
     * Returns an Intent if user confirmation is required by Android OS for `VpnService`,
     * or null when VPN consent is already granted.
     */
    fun prepareVpnPermission(): Intent? {
        return GoBackend.VpnService.prepare(appContext)
    }

    /**
     * Starts system-wide WireGuard VPN from the server-provided `configTemplate`
     * (`/api/network/devices/:id/config`). Resolves `<YOUR_LOCAL_PRIVATE_KEY>` solely in memory.
     */
    suspend fun connectFromTemplate(
        wgConfigTemplate: String,
        excludedPackageNames: Set<String> = emptySet()
    ): Tunnel.State = withContext(Dispatchers.IO) {
        val localPrivBase64 = OneKeyStoreManager.getPrivateKeyBase64(appContext)
        val resolvedText = injectSplitTunnelPackages(
            wgConfigTemplate.replace("<YOUR_LOCAL_PRIVATE_KEY>", localPrivBase64),
            excludedPackageNames
        )

        val config = Config.parse(BufferedReader(StringReader(resolvedText)))
        backend.setState(tunnel, Tunnel.State.UP, config)
    }

    suspend fun disconnect(): Tunnel.State = withContext(Dispatchers.IO) {
        backend.setState(tunnel, Tunnel.State.DOWN, null)
    }

    suspend fun getStatistics(): Statistics? = withContext(Dispatchers.IO) {
        runCatching { backend.getStatistics(tunnel) }.getOrNull()
    }

    private fun injectSplitTunnelPackages(
        wgConfig: String,
        excludedPackages: Set<String>
    ): String {
        if (excludedPackages.isEmpty()) return wgConfig
        val filtered = excludedPackages.map { it.trim() }.filter { it.isNotEmpty() }
        if (filtered.isEmpty()) return wgConfig

        val lines = wgConfig.lines().toMutableList()
        val peerIdx = lines.indexOfFirst { it.trim().equals("[Peer]", ignoreCase = true) }
        val exclusionLine = "ExcludedApplications = ${filtered.joinToString(", ")}"
        if (peerIdx > 0) {
            lines.add(peerIdx, exclusionLine)
        } else {
            lines.add(exclusionLine)
        }
        return lines.joinToString("\n")
    }
}
