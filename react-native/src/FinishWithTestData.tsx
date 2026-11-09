import { useState } from 'react';
import { Button, Text } from 'react-native';
import { parseSessionView, type ExampleServer, type SessionView } from './exampleServer';

interface Props {
  server: ExampleServer;
  sessionId: string;
  onFinished: (view: SessionView) => void;
}

/**
 * Development builds only (App.tsx requires this module under `__DEV__`, so a release bundle does not contain it):
 * asks the server to end the Sandbox session `verified` with test data, so the whole round trip (verdict and
 * webhook) works on an emulator without a document or a face. The server refuses it with a Live key.
 */
export function FinishWithTestData({ server, sessionId, onFinished }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      onFinished(parseSessionView(await server.request('POST', `/demo/finish/${encodeURIComponent(sessionId)}`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button testID="finish" title="Finish with test data" onPress={finish} disabled={busy} />
      {error ? <Text testID="finish-error">{error}</Text> : null}
    </>
  );
}
