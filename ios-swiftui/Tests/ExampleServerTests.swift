@testable import Example
import XCTest

/// Answers every request with a canned response and records the request.
final class StubProtocol: URLProtocol {
    nonisolated(unsafe) static var status = 200
    nonisolated(unsafe) static var body = Data()
    nonisolated(unsafe) static var lastRequest: URLRequest?
    nonisolated(unsafe) static var lastBody: Data?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lastRequest = request
        Self.lastBody = request.httpBody ?? request.httpBodyStream.map { stream in
            stream.open()
            defer { stream.close() }
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 1024)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                data.append(buffer, count: n)
            }
            return data
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

final class ExampleServerTests: XCTestCase {
    private func server() -> ExampleServer {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return ExampleServer(baseURL: URL(string: "http://server.test")!, session: URLSession(configuration: config))
    }

    func testDecodesTheVerdictFields() throws {
        let json = #"{"sessionId":"s1","status":"not_verified","reason":"rejected","closedBy":"system","extra":1}"#
        let view = try JSONDecoder().decode(SessionView.self, from: Data(json.utf8))
        XCTAssertEqual(view, SessionView(sessionId: "s1", status: "not_verified", reason: "rejected", closedBy: "system"))
        XCTAssertTrue(view.isTerminal)
        XCTAssertFalse(SessionView(sessionId: "s1", status: "in_progress").isTerminal)
    }

    func testCreatesASessionWithTheLocale() async throws {
        StubProtocol.status = 200
        StubProtocol.body = Data(#"{"sessionId":"s1","clientToken":"t1","expiresAt":"2030-01-01T00:00:00Z"}"#.utf8)
        let created = try await server().createSession(locale: "fr")
        XCTAssertEqual(created.sessionId, "s1")
        XCTAssertEqual(StubProtocol.lastRequest?.httpMethod, "POST")
        XCTAssertEqual(StubProtocol.lastRequest?.url?.absoluteString, "http://server.test/sessions")
        let sent = try JSONDecoder().decode([String: String].self, from: StubProtocol.lastBody ?? Data())
        XCTAssertEqual(sent["locale"], "fr")
        XCTAssertEqual(sent["userId"], "demo-user-1")
        XCTAssertNotNil(sent["attemptId"])
    }

    func testRefusesASessionWithoutAClientToken() async {
        StubProtocol.status = 200
        StubProtocol.body = Data(#"{"sessionId":"s1","expiresAt":"x"}"#.utf8)
        do {
            _ = try await server().createSession()
            XCTFail("expected a decoding error")
        } catch is DecodingError {}
        catch { XCTFail("unexpected \(error)") }
    }

    func testFailsOnAnErrorStatus() async {
        StubProtocol.status = 403
        StubProtocol.body = Data("{}".utf8)
        do {
            _ = try await server().getSession("s1")
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error as? ExampleServerError, .status(method: "GET", path: "sessions/s1", code: 403))
        }
    }

    func testReadsTheServerURLFromTheBuildSetting() {
        XCTAssertFalse(ExampleServer.configured().baseURL.absoluteString.isEmpty)
    }
}
