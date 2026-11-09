import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { SekyroError, startSekyro, type SekyroEvent, type SekyroResult } from '@sekyro/react-native';
import { EXAMPLE_SERVER_URL } from './config';
import { createExampleServer, isTerminal, type SessionView } from './exampleServer';

// Development builds only: Metro drops this require (and the module) from release bundles.
const FinishWithTestData: typeof import('./FinishWithTestData').FinishWithTestData | null = __DEV__
  ? require('./FinishWithTestData').FinishWithTestData
  : null;

const server = createExampleServer(EXAMPLE_SERVER_URL);
const POLL_MS = 2000;
const POLL_TRIES = 30;

function describeEvent(e: SekyroEvent): string {
  return e.type === 'step' ? `${e.step}${e.retryReason ? ` (${e.retryReason})` : ''}` : 'waiting for network';
}

// What the person was shown: display only, never the decision.
function describeResult(r: SekyroResult): string {
  switch (r.status) {
    case 'finished':
      return `finished: ${r.displayStatus}${r.reason ? ` (${r.reason})` : ''}`;
    case 'failed':
      return `failed: ${r.code}`;
    default:
      return 'cancelled';
  }
}

function describeVerdict(v: SessionView): string {
  const parts = [v.status, v.reason, v.closedBy ? `closed by ${v.closedBy}` : undefined, v.personId ? `person ${v.personId}` : undefined];
  return parts.filter(Boolean).join(' · ');
}

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<SekyroEvent[]>([]);
  const [result, setResult] = useState<SekyroResult | null>(null);
  const [verdict, setVerdict] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const polling = useRef(0);

  useEffect(() => () => void (polling.current += 1), []);

  // The decision is the server's: poll GET /sessions/:id until it is final (the webhook reaches the server too).
  const pollVerdict = useCallback(async (id: string) => {
    const run = ++polling.current;
    for (let i = 0; i < POLL_TRIES && run === polling.current; i++) {
      try {
        const view = await server.getSession(id);
        if (run !== polling.current) return;
        setVerdict(view);
        if (isTerminal(view)) return;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      await new Promise<void>((r) => setTimeout(r, POLL_MS));
    }
  }, []);

  const start = async () => {
    setBusy(true);
    setError(null);
    setEvents([]);
    setResult(null);
    setVerdict(null);
    polling.current += 1;
    try {
      // The client token is a one-time credential: it is handed to the SDK and never shown or logged.
      const session = await server.createSession();
      setSessionId(session.sessionId);
      const r = await startSekyro({ clientToken: session.clientToken, onEvent: (e) => setEvents((l) => [...l, e]) });
      setResult(r);
      void pollVerdict(session.sessionId);
    } catch (e) {
      setError(e instanceof SekyroError ? `Could not start: ${e.code}` : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>Sekyro React Native example</Text>
      <Text testID="server">{EXAMPLE_SERVER_URL}</Text>
      <Button testID="start" title="Start verification" onPress={start} disabled={busy} />
      {error ? <Text testID="error" style={styles.error}>{error}</Text> : null}
      {sessionId ? <Text testID="session" selectable>Session {sessionId}</Text> : null}
      {result ? <Text testID="result">SDK result: {describeResult(result)}</Text> : null}
      {verdict ? <Text testID="verdict">Server verdict: {describeVerdict(verdict)}</Text> : null}
      {FinishWithTestData && sessionId && !(verdict && isTerminal(verdict)) ? (
        <FinishWithTestData
          server={server}
          sessionId={sessionId}
          onFinished={(view) => {
            setVerdict(view);
            if (!isTerminal(view)) void pollVerdict(view.sessionId);
          }}
        />
      ) : null}
      <Text style={styles.subtitle}>Step events</Text>
      <FlatList
        data={events}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View>
            <Text>{describeEvent(item)}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  subtitle: { fontWeight: '600' },
  error: { color: '#B42318' },
});
