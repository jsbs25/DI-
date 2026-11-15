import Foundation
import NetworkExtension
import WireGuardKit
import os.log

/// Runs inside the iOS Network Extension target (`OnePacketTunnel`).
/// Requires `com.apple.developer.networking.networkextension` (`packet-tunnel-provider`) entitlement
/// and shared App Group (`group.com.earthone.app`) for reading the device-local Keychain private key.
final class PacketTunnelProvider: NEPacketTunnelProvider {
    private let logger = Logger(subsystem: "com.earthone.app.PacketTunnel", category: "WireGuard")

    private lazy var adapter: WireGuardAdapter = {
        WireGuardAdapter(with: self) { [weak self] logLevel, message in
            guard let self else { return }
            switch logLevel {
            case .error:
                self.logger.error("\(message, privacy: .public)")
            default:
                self.logger.info("\(message, privacy: .public)")
            }
        }
    }()

    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        guard let protocolConfig = protocolConfiguration as? NETunnelProviderProtocol,
              let providerConfig = protocolConfig.providerConfiguration,
              let rawTemplate = providerConfig["wgQuickTemplate"] as? String,
              let keyAccount = providerConfig["keychainAccount"] as? String else {
            completionHandler(PacketTunnelError.missingConfiguration)
            return
        }

        // Load device-local private key from shared App Group Keychain.
        // Private keys NEVER travel over HTTP or get stored on ONE backend servers.
        guard let privateKeyBase64 = OneKeychainStore.loadPrivateKeyBase64(account: keyAccount) else {
            completionHandler(PacketTunnelError.missingPrivateKey)
            return
        }

        let resolvedWgQuick = rawTemplate.replacingOccurrences(
            of: "<YOUR_LOCAL_PRIVATE_KEY>",
            with: privateKeyBase64
        )

        let tunnelConfiguration: TunnelConfiguration
        do {
            tunnelConfiguration = try TunnelConfiguration(fromWgQuickConfig: resolvedWgQuick, called: "ONE VPN")
        } catch {
            logger.error("Failed to parse WireGuard config template: \(error.localizedDescription, privacy: .public)")
            completionHandler(PacketTunnelError.invalidConfiguration)
            return
        }

        adapter.start(tunnelConfiguration: tunnelConfiguration) { [weak self] adapterError in
            if let adapterError {
                self?.logger.error("WireGuardAdapter start failed: \(adapterError.localizedDescription, privacy: .public)")
                completionHandler(adapterError)
                return
            }
            self?.logger.info("ONE WireGuard system tunnel started cleanly.")
            completionHandler(nil)
        }
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        logger.info("Stopping ONE WireGuard tunnel (reason: \(reason.rawValue))")
        adapter.stop { [weak self] error in
            if let error {
                self?.logger.error("WireGuardAdapter stop error: \(error.localizedDescription, privacy: .public)")
            }
            completionHandler()
        }
    }

    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        // Return runtime WireGuard handshake & rx/tx stats to the host app on request.
        adapter.getRuntimeConfiguration { configString in
            guard let configString, let data = configString.data(using: .utf8) else {
                completionHandler?(nil)
                return
            }
            completionHandler?(data)
        }
    }

    override func sleep(completionHandler: @escaping () -> Void) {
        completionHandler()
    }

    override func wake() {}
}

enum PacketTunnelError: LocalizedError {
    case missingConfiguration
    case missingPrivateKey
    case invalidConfiguration

    var errorDescription: String? {
        switch self {
        case .missingConfiguration:
            return "Missing WireGuard tunnel template in NETunnelProviderProtocol."
        case .missingPrivateKey:
            return "Device private key not found in shared Keychain."
        case .invalidConfiguration:
            return "WireGuard configuration template is invalid."
        }
    }
}
