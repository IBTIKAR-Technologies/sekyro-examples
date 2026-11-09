// The calls this app makes to examples/node-express. The server holds the API key; the app only ever sees a
// one-time client token and the session's status.
import 'dart:convert';

import 'package:http/http.dart' as http;

class CreatedSession {
  const CreatedSession({required this.sessionId, required this.clientToken, required this.expiresAt});

  factory CreatedSession.fromJson(Object? json) {
    final o = _object(json);
    return CreatedSession(sessionId: _need(o, 'sessionId'), clientToken: _need(o, 'clientToken'), expiresAt: _need(o, 'expiresAt'));
  }

  final String sessionId;

  /// One-time bearer credential for the SDK. Never show or log it.
  final String clientToken;
  final String expiresAt;
}

/// The server's view of a session: `created`, `in_progress`, `review_pending`, `verified` or `not_verified`.
class SessionView {
  const SessionView({required this.sessionId, required this.status, this.reason, this.closedBy, this.personId});

  factory SessionView.fromJson(Object? json) {
    final o = _object(json);
    return SessionView(
      sessionId: _need(o, 'sessionId'),
      status: _need(o, 'status'),
      reason: _opt(o, 'reason'),
      closedBy: _opt(o, 'closedBy'),
      personId: _opt(o, 'personId'),
    );
  }

  final String sessionId;
  final String status;
  final String? reason;
  final String? closedBy;
  final String? personId;

  /// True once the server has a final verdict (the session will not change any more).
  bool get isTerminal => status == 'verified' || status == 'not_verified';

  @override
  String toString() => [
        status,
        if (reason != null) reason,
        if (closedBy != null) 'closed by $closedBy',
        if (personId != null) 'person $personId',
      ].join(' · ');
}

class ExampleServer {
  ExampleServer(String baseUrl, {http.Client? client})
      : _base = Uri.parse(baseUrl.endsWith('/') ? baseUrl : '$baseUrl/'),
        _client = client ?? http.Client();

  final Uri _base;
  final http.Client _client;

  /// POST /sessions: a new session and its client token.
  Future<CreatedSession> createSession({String? locale}) async =>
      CreatedSession.fromJson(await request('POST', 'sessions', body: {if (locale != null) 'locale': locale}));

  /// GET /sessions/:id: the server's view of the session (the verdict once it is final).
  Future<SessionView> getSession(String id) async =>
      SessionView.fromJson(await request('GET', 'sessions/${Uri.encodeComponent(id)}'));

  /// A JSON call to the server; finish_with_test_data.dart (debug builds only) uses it for its one route.
  Future<Object?> request(String method, String path, {Map<String, Object?>? body}) async {
    final uri = _base.resolve(path);
    final headers = {'accept': 'application/json', if (body != null) 'content-type': 'application/json'};
    final res = method == 'GET'
        ? await _client.get(uri, headers: headers)
        : await _client.post(uri, headers: headers, body: body == null ? null : jsonEncode(body));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ExampleServerException('$method /$path answered ${res.statusCode}');
    }
    return jsonDecode(res.body);
  }
}

class ExampleServerException implements Exception {
  ExampleServerException(this.message);
  final String message;
  @override
  String toString() => message;
}

Map<String, Object?> _object(Object? json) {
  if (json is Map<String, Object?>) return json;
  throw ExampleServerException('The server did not answer with a JSON object');
}

String? _opt(Map<String, Object?> o, String key) {
  final v = o[key];
  return v is String && v.isNotEmpty ? v : null;
}

String _need(Map<String, Object?> o, String key) =>
    _opt(o, key) ?? (throw ExampleServerException('The server response has no "$key"'));
