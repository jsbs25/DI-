import AVFoundation
import CallKit
import Foundation
import PushKit

protocol OneCallCoordinatorDelegate: AnyObject {
    func callKitDidAnswerCall(callId: String, uuid: UUID, isVideo: Bool)
    func callKitDidEndCall(callId: String, uuid: UUID)
    func callKitDidSetMuted(callId: String, muted: Bool)
    func callKitDidReceiveVoipPushToken(_ tokenHex: String)
}

/// Integrates Apple PushKit (`PKPushRegistry`) and `CallKit` (`CXProvider`)
/// so ONE Communication can wake terminated/background iOS devices reliably for incoming calls.
final class CallKitPushManager: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
    private let provider: CXProvider
    private let callController = CXCallController()
    private var registry: PKPushRegistry?
    private var uuidToCallId: [UUID: String] = [:]
    private var callIdToUuid: [String: UUID] = [:]

    weak var delegate: OneCallCoordinatorDelegate?

    override init() {
        let config = CXProviderConfiguration(localizedName: "ONE")
        config.supportsVideo = true
        config.maximumCallGroups = 1
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = true
        self.provider = CXProvider(configuration: config)
        super.init()
        self.provider.setDelegate(self, queue: nil)
    }

    func registerForVoipPushes() {
        let reg = PKPushRegistry(queue: .main)
        reg.delegate = self
        reg.desiredPushTypes = [.voIP]
        self.registry = reg
    }

    func startOutgoingCall(callId: String, calleeName: String, isVideo: Bool) {
        let uuid = UUID()
        uuidToCallId[uuid] = callId
        callIdToUuid[callId] = uuid

        let handle = CXHandle(type: .generic, value: calleeName)
        let action = CXStartCallAction(call: uuid, handle: handle)
        action.isVideo = isVideo
        callController.request(CXTransaction(action: action)) { error in
            if let error {
                print("[CallKit] Failed starting outgoing call: \(error.localizedDescription)")
            }
        }
    }

    func endCall(callId: String) {
        guard let uuid = callIdToUuid[callId] else { return }
        let action = CXEndCallAction(call: uuid)
        callController.request(CXTransaction(action: action)) { _ in }
    }

    // MARK: - PKPushRegistryDelegate

    func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        guard type == .voIP else { return }
        let tokenHex = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        delegate?.callKitDidReceiveVoipPushToken(tokenHex)
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }

        // Apple requires reporting incoming calls synchronously inside didReceiveIncomingPushWith
        // on iOS 13+; otherwise iOS may throttle or terminate future VoIP pushes.
        let dict = payload.dictionaryPayload
        let callId = (dict["callId"] as? String) ?? UUID().uuidString
        let callerName = (dict["callerName"] as? String) ?? "ONE 联系人"
        let isVideo = (dict["isVideo"] as? Bool) ?? ((dict["kind"] as? String) == "video")

        let uuid = callIdToUuid[callId] ?? UUID()
        uuidToCallId[uuid] = callId
        callIdToUuid[callId] = uuid

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: callerName)
        update.localizedCallerName = callerName
        update.hasVideo = isVideo
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false

        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error {
                print("[CallKit] reportNewIncomingCall failed: \(error.localizedDescription)")
            }
            completion()
        }
    }

    // MARK: - CXProviderDelegate

    func providerDidReset(_ provider: CXProvider) {
        uuidToCallId.removeAll()
        callIdToUuid.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        configureAudioSessionForVoice()
        if let callId = uuidToCallId[action.callUUID] {
            delegate?.callKitDidAnswerCall(callId: callId, uuid: action.callUUID, isVideo: true)
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        if let callId = uuidToCallId[action.callUUID] {
            delegate?.callKitDidEndCall(callId: callId, uuid: action.callUUID)
            callIdToUuid.removeValue(forKey: callId)
            uuidToCallId.removeValue(forKey: action.callUUID)
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        if let callId = uuidToCallId[action.callUUID] {
            delegate?.callKitDidSetMuted(callId: callId, muted: action.isMuted)
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // LiveKit iOS SDK should start audio playback/capture once CallKit activates the audio session.
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        // Release audio resources when CallKit ends session.
    }

    private func configureAudioSessionForVoice() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.allowBluetooth, .defaultToSpeaker]
            )
            try session.setActive(true)
        } catch {
            print("[CallKit] AVAudioSession config error: \(error.localizedDescription)")
        }
    }
}
