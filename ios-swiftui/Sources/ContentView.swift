import SekyroKit
import SwiftUI

/// Fetch a client token from examples/node-express, run the SekyroKit drop-in, show the step events and the
/// display-only result, then poll the server for the verdict.
@MainActor
final class ExampleModel: ObservableObject {
    @Published var sessionId: String?
    @Published var events: [String] = []
    @Published var result: String?
    @Published var verdict: SessionView?
    @Published var error: String?
    @Published var busy = false
    /// The running flow, presented full screen.
    @Published var flow: Flow?

    struct Flow: Identifiable {
        let id: String
        let config: SekyroConfig
    }

    let server = ExampleServer.configured()
    private var polling: Task<Void, Never>?

    /// Every action creates its session on the tap, never on render. SekyroKit calls onResult with the finished
    /// result only after the person presses the result screen's button.
    func start(_ create: @escaping () async throws -> CreatedSession) {
        busy = true
        error = nil
        events = []
        result = nil
        verdict = nil
        polling?.cancel()
        Task {
            defer { busy = false }
            do {
                // The client token is a one-time credential: it is handed to the SDK and never shown or logged.
                let session = try await create()
                sessionId = session.sessionId
                flow = Flow(id: session.sessionId, config: SekyroConfig(clientToken: session.clientToken))
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    func onEvent(_ event: SekyroEvent) {
        switch event {
        case let .step(step, retryReason): events.append(retryReason.map { "\(step.rawValue) (\($0))" } ?? step.rawValue)
        case .waitingForNetwork: events.append("waiting for network")
        @unknown default: events.append("event")
        }
    }

    /// What the person was shown: display only, never the decision.
    func onResult(_ sdkResult: SekyroResult) {
        flow = nil
        switch sdkResult {
        case let .finished(_, displayStatus, reason, _, _, _, _):
            result = "finished: \(displayStatus.rawValue)" + (reason.map { " (\($0.rawValue))" } ?? "")
        case .cancelled: result = "cancelled"
        case let .failed(code): result = "failed: \(code)"
        @unknown default: result = "unknown result"
        }
        if let sessionId { pollVerdict(sessionId) }
    }

    /// The decision is the server's: poll GET /sessions/:id until it is final (the webhook reaches the server too).
    func pollVerdict(_ id: String) {
        polling?.cancel()
        polling = Task {
            for _ in 0..<30 where !Task.isCancelled {
                do {
                    let view = try await server.getSession(id)
                    guard !Task.isCancelled else { return }
                    verdict = view
                    if view.isTerminal { return }
                } catch {
                    self.error = error.localizedDescription
                }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }

    func finished(_ view: SessionView) {
        verdict = view
        if !view.isTerminal { pollVerdict(view.sessionId) }
    }
}

struct ContentView: View {
    @StateObject private var model = ExampleModel()

    var body: some View {
        NavigationView {
            List {
                Section {
                    Text(model.server.baseURL.absoluteString).font(.footnote).foregroundColor(.secondary)
                    Text("Signed in as Demo user 1")
                    Button("Verify") { model.start { try await model.server.createSession() } }
                        .disabled(model.busy)
                        .accessibilityIdentifier("start")
                    Button("Confirm it is you") { model.start { try await model.server.createRecheck() } }
                        .disabled(model.busy)
                        .accessibilityIdentifier("recheck")
                    if let error = model.error { Text(error).foregroundColor(.red).accessibilityIdentifier("error") }
                }
                if let sessionId = model.sessionId {
                    Section("Session") {
                        Text(sessionId).font(.system(.footnote, design: .monospaced)).textSelection(.enabled)
                        if let result = model.result { Text("SDK result: \(result)").accessibilityIdentifier("result") }
                        if let verdict = model.verdict { Text("Server verdict: \(verdict.summary)").accessibilityIdentifier("verdict") }
                        #if DEBUG
                        if model.verdict?.isTerminal != true {
                            FinishWithTestData(server: model.server, sessionId: sessionId) { model.finished($0) }
                        }
                        #endif
                    }
                }
                if !model.events.isEmpty {
                    Section("Step events") { ForEach(Array(model.events.enumerated()), id: \.offset) { Text($0.element) } }
                }
            }
            .navigationTitle("Sekyro iOS example")
        }
        .navigationViewStyle(.stack)
        .fullScreenCover(item: $model.flow) { flow in
            SekyroFlowView(config: flow.config, onEvent: model.onEvent, onResult: model.onResult)
        }
    }
}
