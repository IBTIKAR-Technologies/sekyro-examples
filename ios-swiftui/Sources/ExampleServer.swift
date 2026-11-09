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

    /// True once the server has a final verdict (the session will not change any more).
    var isTerminal: Bool { status == "verified" || status == "not_verified" }

    var summary: String {
        [status, reason, closedBy.map { "closed by \($0)" }, personId.map { "person \($0)" }].compactMap { $0 }.joined(separator: " · ")
    }
}

enum ExampleServerError: Error, LocalizedError, Equatable {
    case status(method: String, path: String, code: Int)
    var errorDescription: String? {
        switch self { case let .status(method, path, code): "\(method) /\(path) answered \(code)" }
    }
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

    func createSession(locale: String? = nil) async throws -> CreatedSession {
        try JSONDecoder().decode(CreatedSession.self, from: await request("POST", "sessions", body: locale.map { ["locale": $0] } ?? [:]))
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
        guard (200..<300).contains(code) else { throw ExampleServerError.status(method: method, path: path, code: code) }
        return data
    }

    static func escape(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? id
    }
}
