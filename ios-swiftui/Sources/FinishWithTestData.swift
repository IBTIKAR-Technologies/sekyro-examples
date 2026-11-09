#if DEBUG
import SwiftUI

extension ExampleServer {
    /// `POST /demo/finish/:id`: the server ends the Sandbox session `verified` with test data (it refuses with a
    /// Live key).
    func finishWithTestData(_ id: String) async throws -> SessionView {
        try JSONDecoder().decode(SessionView.self, from: await request("POST", "demo/finish/\(Self.escape(id))"))
    }
}

/// Debug builds only (the whole file is `#if DEBUG`): finishes the session with test data, so the round trip (verdict
/// and webhook) works on a simulator without a document or a face.
struct FinishWithTestData: View {
    let server: ExampleServer
    let sessionId: String
    let onFinished: (SessionView) -> Void
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button("Finish with test data") {
                busy = true
                error = nil
                Task {
                    do { onFinished(try await server.finishWithTestData(sessionId)) } catch { self.error = error.localizedDescription }
                    busy = false
                }
            }
            .buttonStyle(.bordered)
            .disabled(busy)
            .accessibilityIdentifier("finish")
            if let error { Text(error).font(.footnote).foregroundColor(.red) }
        }
    }
}
#endif
