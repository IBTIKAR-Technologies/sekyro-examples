// Debug builds only: main.dart builds this widget under `kDebugMode`, a constant that is false in profile and
// release builds, so the compiler drops the widget and its route from them.
import 'package:flutter/material.dart';

import 'example_server.dart';

/// Asks the server to end the Sandbox session `verified` with test data, so the whole round trip (verdict and
/// webhook) works on an emulator without a document or a face. The server refuses it with a Live key.
class FinishWithTestData extends StatefulWidget {
  const FinishWithTestData({super.key, required this.server, required this.sessionId, required this.onFinished});

  final ExampleServer server;
  final String sessionId;
  final ValueChanged<SessionView> onFinished;

  @override
  State<FinishWithTestData> createState() => _FinishWithTestDataState();
}

class _FinishWithTestDataState extends State<FinishWithTestData> {
  bool _busy = false;
  String? _error;

  Future<void> _finish() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final json = await widget.server.request('POST', 'demo/finish/${Uri.encodeComponent(widget.sessionId)}');
      widget.onFinished(SessionView.fromJson(json));
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 8,
        children: [
          OutlinedButton(
            key: const Key('finish'),
            onPressed: _busy ? null : _finish,
            child: const Text('Finish with test data'),
          ),
          if (_error != null) Text(_error!, key: const Key('finish-error')),
        ],
      );
}
