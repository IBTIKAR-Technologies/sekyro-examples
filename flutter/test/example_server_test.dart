import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sekyro_example/example_server.dart';

void main() {
  test('parses a created session', () {
    final s = CreatedSession.fromJson({'sessionId': 's1', 'clientToken': 't1', 'expiresAt': '2030-01-01T00:00:00Z'});
    expect(s.sessionId, 's1');
    expect(s.clientToken, 't1');
  });

  test('refuses a created session without a client token', () {
    expect(() => CreatedSession.fromJson({'sessionId': 's1', 'expiresAt': 'x'}), throwsA(isA<ExampleServerException>()));
  });

  test('keeps the verdict fields', () {
    final v = SessionView.fromJson({'sessionId': 's1', 'status': 'not_verified', 'reason': 'rejected', 'closedBy': 'system'});
    expect(v.reason, 'rejected');
    expect(v.personId, isNull);
    expect(v.isTerminal, isTrue);
    expect(SessionView.fromJson({'sessionId': 's1', 'status': 'in_progress'}).isTerminal, isFalse);
  });

  test('posts the locale to /sessions', () async {
    late http.Request seen;
    final client = MockClient((req) async {
      seen = req;
      return http.Response(jsonEncode({'sessionId': 's1', 'clientToken': 't1', 'expiresAt': 'x'}), 200);
    });
    await ExampleServer('http://server.test', client: client).createSession(locale: 'fr');
    expect(seen.method, 'POST');
    expect(seen.url.toString(), 'http://server.test/sessions');
    expect(jsonDecode(seen.body), {'locale': 'fr'});
  });

  test('fails on an error status', () async {
    final client = MockClient((_) async => http.Response('{}', 403));
    expect(ExampleServer('http://server.test', client: client).getSession('s1'), throwsA(isA<ExampleServerException>()));
  });
}
