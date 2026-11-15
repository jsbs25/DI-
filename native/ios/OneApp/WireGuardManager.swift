import Combine
import Foundation
import NetworkExtension

/// Controls ONE System-Level VPN (`NEPacketTunnelProvider`) on iOS via `NETunnelProviderManager`.
@MainActor
final class WireGuardManager: ObservableObject {
    static let tunnelBundleIdentifier = "com.earthone.app.PacketTunnel"
    static let keychainAccount = "one-primary-ios-key"

    enum TunnelStatus: String {
        case disconnected
        case connecting
        case connected
        case disconnecting
        case invalid
    }

    @Published private(set) var status: TunnelStatus = .disconnected
    @Published private(set) var lastError: String?
    @Published private(set) var activeNodeId: String?

    private var manager: NETunnelProviderManager?
    private var statusObserver: NSObjectProtocol?

    init() {
        statusObserver = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let connection = notification.object as? NEVPNConnection else { return }
            Task { @MainActor in
                self?.syncStatus(connection.status)
            }
        }
    }

    deinit {
        if let statusObserver {
            NotificationCenter.default.removeObserver(statusObserver)
        }
    }

    func loadPreferences() async {
        do {
            let managers = try await NETunnelProviderManager.loadAllFromPreferences()
            if let existing = managers.first(where: {
                ($0.protocolConfiguration as? NETunnelProviderProtocol)?.providerBundleIdentifier == Self.tunnelBundleIdentifier
            }) {
                self.manager = existing
                self.syncStatus(existing.connection.status)
                if let cfg = (existing.protocolConfiguration as? NETunnelProviderProtocol)?.providerConfiguration,
                   let nid = cfg["nodeId"] as? String {
                    self.activeNodeId = nid
                }
            }
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    /// Generates local keypair if needed, registers ONLY the publicKey with ONE `/api/network/devices`,
    /// stores the returned wg-quick template, and starts the iOS system WireGuard tunnel.
    func connect(
        apiBaseUrl: URL,
        sessionBearerToken: String,
        nodeId: String,
        deviceName: String
    ) async {
        lastError = nil
        do {
            let keySummary = try OneKeychainStore.ensureOrCreateKeyPair(account: Self.keychainAccount)
            let wgTemplate = try await registerAndFetchTemplate(
                apiBaseUrl: apiBaseUrl,
                token: sessionBearerToken,
                nodeId: nodeId,
                deviceName: deviceName,
                publicKeyBase64: keySummary.publicKeyBase64
            )

            let targetManager = manager ?? NETunnelProviderManager()
            let proto = NETunnelProviderProtocol()
            proto.providerBundleIdentifier = Self.tunnelBundleIdentifier
            proto.serverAddress = "ONE WireGuard Gateway"
            proto.providerConfiguration = [
                "wgQuickTemplate": wgTemplate,
                "keychainAccount": Self.keychainAccount,
                "nodeId": nodeId,
            ]

            targetManager.protocolConfiguration = proto
            targetManager.localizedDescription = "ONE System VPN"
            targetManager.isEnabled = true

            try await targetManager.saveToPreferences()
            try await targetManager.loadFromPreferences()

            self.manager = targetManager
            self.activeNodeId = nodeId
            try targetManager.connection.startVPNTunnel()
            syncStatus(targetManager.connection.status)
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    func disconnect() {
        manager?.connection.stopVPNTunnel()
    }

    private func syncStatus(_ neStatus: NEVPNStatus) {
        switch neStatus {
        case .connected:
            status = .connected
        case .connecting, .reasserting:
            status = .connecting
        case .disconnecting:
            status = .disconnecting
        case .disconnected:
            status = .disconnected
        case .invalid:
            status = .invalid
        @unknown default:
            status = .disconnected
        }
    }

    private func registerAndFetchTemplate(
        apiBaseUrl: URL,
        token: String,
        nodeId: String,
        deviceName: String,
        publicKeyBase64: String
    ) async throws -> String {
        let url = apiBaseUrl.appendingPathComponent("/api/network/devices")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "nodeId": nodeId,
            "deviceName": deviceName,
            "platform": "ios",
            "publicKey": publicKeyBase64,
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let httpResp = response as? HTTPURLResponse, (200...299).contains(httpResp.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "HTTP error"
            throw NSError(domain: "OneNetwork", code: 1, userInfo: [NSLocalizedDescriptionKey: msg])
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let profile = json["profile"] as? [String: Any],
              let template = profile["configTemplate"] as? String else {
            throw NSError(domain: "OneNetwork", code: 2, userInfo: [NSLocalizedDescriptionKey: "Missing configTemplate in server response"])
        }
        return template
    }
}
