// Sekyro AI Flutter example: fetch a client token from examples/node-express, run the sekyro_flutter drop-in, show
// the step events and the display-only result, then poll the server for the verdict.
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:sekyro_flutter/sekyro_flutter.dart';

import 'example_server.dart';
import 'finish_with_test_data.dart';

/// `flutter run --dart-define=EXAMPLE_SERVER_URL=http://<host>:<port>`. Without it: the host machine as the Android
/// emulator and the iOS simulator see it.
const _configuredServerUrl = String.fromEnvironment('EXAMPLE_SERVER_URL');

String exampleServerUrl() {
  if (_configuredServerUrl.isNotEmpty) return _configuredServerUrl;
  return defaultTargetPlatform == TargetPlatform.android ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

void main() => runApp(MaterialApp(title: 'Sekyro Example', home: ExampleScreen(server: ExampleServer(exampleServerUrl()))));

class ExampleScreen extends StatefulWidget {
  const ExampleScreen({super.key, required this.server});

  final ExampleServer server;

  @override
  State<ExampleScreen> createState() => _ExampleScreenState();
}

class _ExampleScreenState extends State<ExampleScreen> {
  static const _pollEvery = Duration(seconds: 2);
  static const _pollTries = 30;

  String? _sessionId;
  final _events = <String>[];
  String? _result;
  SessionView? _verdict;
  String? _error;
  bool _busy = false;
  int _poll = 0;

  @override
  void dispose() {
    _poll++;
    super.dispose();
  }

  // Every action creates its session on the tap, never on render. Sekyro.start returns the finished result only
  // after the person presses the result screen's button.
  Future<void> _start(Future<CreatedSession> Function() create) async {
    setState(() {
      _busy = true;
      _error = null;
      _events.clear();
      _result = null;
      _verdict = null;
    });
    _poll++;
    try {
      // The client token is a one-time credential: it is handed to the SDK and never shown or logged.
      final session = await create();
      setState(() => _sessionId = session.sessionId);
      final result = await Sekyro.start(SekyroConfig(
        clientToken: session.clientToken,
        onEvent: (event) => setState(() => _events.add(switch (event) {
              SekyroStepEvent(:final step, :final retryReason) => retryReason == null ? step.wire : '${step.wire} ($retryReason)',
              SekyroWaitingForNetwork() => 'waiting for network',
            })),
      ));
      // What the person was shown: display only, never the decision.
      setState(() => _result = switch (result) {
            SekyroFinished(:final displayStatus, :final reason) =>
              'finished: ${displayStatus.wire}${reason == null ? '' : ' (${reason.wire})'}',
            SekyroCancelled() => 'cancelled',
            SekyroFailed(:final code) => 'failed: $code',
          });
      unawaited(_pollVerdict(session.sessionId));
    } on FallbackException catch (e) {
      // Not re-checkable (not returningReady, revoked, stale): the person runs a full verification instead.
      setState(() => _error = '${e.message} Tap Verify to run a full verification.');
    } on PlatformException catch (e) {
      setState(() => _error = 'Could not start: ${e.code}');
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// The decision is the server's: poll GET /sessions/:id until it is final (the webhook reaches the server too).
  Future<void> _pollVerdict(String id) async {
    final run = ++_poll;
    for (var i = 0; i < _pollTries && run == _poll; i++) {
      try {
        final view = await widget.server.getSession(id);
        if (run != _poll || !mounted) return;
        setState(() => _verdict = view);
        if (view.isTerminal) return;
      } catch (e) {
        if (mounted) setState(() => _error = '$e');
      }
      await Future<void>.delayed(_pollEvery);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sessionId = _sessionId;
    final verdict = _verdict;
    return Scaffold(
      appBar: AppBar(title: const Text('Sekyro Flutter example')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(exampleServerUrl(), key: const Key('server')),
            const SizedBox(height: 12),
            const Text('Signed in as Demo user 1'),
            FilledButton(
                key: const Key('start'), onPressed: _busy ? null : () => _start(widget.server.createSession), child: const Text('Verify')),
            OutlinedButton(
                key: const Key('recheck'),
                onPressed: _busy ? null : () => _start(widget.server.createRecheck),
                child: const Text('Confirm it is you')),
            if (_error != null) Text(_error!, key: const Key('error'), style: TextStyle(color: Theme.of(context).colorScheme.error)),
            if (sessionId != null) SelectableText('Session $sessionId', key: const Key('session')),
            if (_result != null) Text('SDK result: $_result', key: const Key('result')),
            if (verdict != null) Semantics(liveRegion: true, child: Text('Server verdict: $verdict', key: const Key('verdict'))),
            if (kDebugMode && sessionId != null && !(verdict?.isTerminal ?? false))
              FinishWithTestData(
                server: widget.server,
                sessionId: sessionId,
                onFinished: (view) {
                  setState(() => _verdict = view);
                  if (!view.isTerminal) unawaited(_pollVerdict(view.sessionId));
                },
              ),
            const SizedBox(height: 12),
            Text('Step events', style: Theme.of(context).textTheme.titleSmall),
            for (final e in _events) Text(e),
          ],
        ),
      ),
    );
  }
}
