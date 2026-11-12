import Foundation

/// A new session from `POST /sessions`. `clientToken` is a one-time bearer credential: hand it to the SDK, never show
/// or log it.
struct CreatedSession: Decodable, Equatable {
    let sessionId: String
    let clientToken: String
    let expiresAt: String
}

/// The server's view of a session (`GET /sessions/:id`): `created`, `in_progress`, `review_pending`, `verified` or
/// `not_verified`, with the reason and who closed it once it is final.
struct SessionView: Decodable, Equatable {
    let sessionId: String
    let status: String
    var reason: String?
    var closedBy: String?
    var personId: String?
    /// What the server decided (`decision.show`, for example `in_review` or `try_again`).
    var decision: Decision?

    struct Decision: Decodable, Equatable {
        let show: String
        let canRetry: Bool
    }

    /// True once the server has a final verdict (the session will not change any more).
    var isTerminal: Bool { status == "verified" || status == "not_verified" }

    var summary: String {
        [decision?.show, status, reason, closedBy.map { "closed by \($0)" }, personId.map { "person \($0)" }].compactMap { $0 }.joined(separator: " · ")
    }
}

enum ExampleServerError: Error, LocalizedError, Equatable {
    case status(method: String, path: String, code: Int)
    /// A refused re-check: the person needs a full verification first. The message says why.
    case fullVerificationNeeded(String)
    var errorDescription: String? {
        switch self {
        case let .status(method, path, code): "\(method) /\(path) answered \(code)"
        case let .fullVerificationNeeded(message): "\(message) Tap Verify to run a full verification."
        }
    }
}

private struct Refusal: Decodable {
    let next: String?
    let message: String?
}

/// The calls this app makes to examples/node-express. The server holds the API key; the app only ever sees a
/// one-time client token and the session's status.
struct ExampleServer {
    let baseURL: URL
    var session: URLSession = .shared

    /// `EXAMPLE_SERVER_URL` (build setting, Info.plist key `ExampleServerURL`). Default: the Mac, as the simulator
    /// sees it.
    static func configured(bundle: Bundle = .main) -> ExampleServer {
        let raw = (bundle.object(forInfoDictionaryKey: "ExampleServerURL") as? String)?.trimmingCharacters(in: .whitespaces)
        return ExampleServer(baseURL: raw.flatMap { $0.isEmpty ? nil : URL(string: $0) } ?? URL(string: "http://localhost:4000")!)
    }

    /// The demo user this app is signed in as: a fixed id, no personal data. It is the person's externalRef.
    static let demoUserId = "demo-user-1"

    /// A full verification for the demo user, created when the person taps Verify. One idempotency key per tap.
    func createSession(locale: String? = nil) async throws -> CreatedSession {
        var body = ["userId": Self.demoUserId, "attemptId": UUID().uuidString]
        if let locale { body["locale"] = locale }
        return try JSONDecoder().decode(CreatedSession.self, from: await request("POST", "sessions", body: body))
    }

    /// "Confirm it is you" for a returning person, on any device. Throws `fullVerificationNeeded` when the person
    /// needs a full verification first.
    func createRecheck() async throws -> CreatedSession {
        try JSONDecoder().decode(
            CreatedSession.self,
            from: await request("POST", "sessions/recheck", body: ["userId": Self.demoUserId, "attemptId": UUID().uuidString]))
    }

    func getSession(_ id: String) async throws -> SessionView {
        try JSONDecoder().decode(SessionView.self, from: await request("GET", "sessions/\(Self.escape(id))"))
    }

    /// A JSON call to the server; FinishWithTestData.swift (Debug builds only) uses it for its one route.
    func request(_ method: String, _ path: String, body: [String: String]? = nil) async throws -> Data {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await session.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        if code == 409, let refusal = try? JSONDecoder().decode(Refusal.self, from: data), refusal.next == "full_verification" {
            throw ExampleServerError.fullVerificationNeeded(refusal.message ?? "Please verify in full.")
        }
        guard (200..<300).contains(code) else { throw ExampleServerError.status(method: method, path: path, code: code) }
        return data
    }

    static func escape(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? id
    }
}
