import Foundation
import Security
import WireGuardKit

/// Shared Keychain storage used by both `OneApp` and `OnePacketTunnel` via App Group Keychain Sharing.
/// Generates WireGuard Curve25519 keypairs locally; ONLY public keys leave the device.
enum OneKeychainStore {
    static let serviceName = "com.earthone.app.wireguard.keys"
    // Replace with your Apple Developer Team prefix + bundle/keychain-group if required by Xcode signing
    static let accessGroup: String? = "group.com.earthone.app"

    struct KeyPairPublicSummary {
        let account: String
        let publicKeyBase64: String
    }

    static func ensureOrCreateKeyPair(account: String = "default-device") throws -> KeyPairPublicSummary {
        if let existingPriv = loadPrivateKeyBase64(account: account),
           let privKey = PrivateKey(base64Key: existingPriv) {
            return KeyPairPublicSummary(account: account, publicKeyBase64: privKey.publicKey.base64Key)
        }

        let newPrivateKey = PrivateKey()
        try savePrivateKeyBase64(newPrivateKey.base64Key, account: account)
        return KeyPairPublicSummary(account: account, publicKeyBase64: newPrivateKey.publicKey.base64Key)
    }

    static func savePrivateKeyBase64(_ base64Key: String, account: String) throws {
        guard let data = base64Key.data(using: .utf8) else {
            throw NSError(domain: serviceName, code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid key encoding"])
        }

        var query = baseQuery(account: account)
        SecItemDelete(query as CFDictionary)

        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: [
                NSLocalizedDescriptionKey: "Failed saving WireGuard private key to Keychain (\(status))"
            ])
        }
    }

    static func loadPrivateKeyBase64(account: String) -> String? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = kCFBooleanTrue
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let str = String(data: data, encoding: .utf8) else {
            return nil
        }
        return str
    }

    static func deletePrivateKey(account: String) {
        let query = baseQuery(account: account)
        SecItemDelete(query as CFDictionary)
    }

    private static func baseQuery(account: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: account,
        ]
        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        return query
    }
}
