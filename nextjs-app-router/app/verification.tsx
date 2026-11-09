"use client";
// The client part: <SekyroVerification> from @sekyro/react runs the flow in
// the browser with the one-time client token the Server Action returned.
import { useCallback, useEffect, useState } from "react";
import { createVerification, type Verification as SdkVerification, type VerificationResult, type VerificationStep } from "@sekyro/web";
import { SekyroVerification } from "@sekyro/react/verification";
import type { StartedSession, Verdict } from "./actions";

const LOCALES = ["en", "fr", "ar"] as const;
type Locale = (typeof LOCALES)[number];

interface ReceivedEvent {
  id: string | null;
  event: string | null;
  sessionId: string | null;
  signature: string;
}

export interface VerificationProps {
  startVerification: (locale: string) => Promise<StartedSession>;
  readVerdict: (sessionId: string) => Promise<Verdict>;
  finishWithTestData?: (sessionId: string) => Promise<Verdict>;
}

export function Verification(props: VerificationProps) {
  const [locale, setLocale] = useState<Locale>("en");
  const [session, setSession] = useState<StartedSession | null>(null);
  const [verification, setVerification] = useState<SdkVerification | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [events, setEvents] = useState<ReceivedEvent[]>([]);
  const [lastStep, setLastStep] = useState("");
  const [sdkResult, setSdkResult] = useState<VerificationResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const final = verdict?.status === "verified" || verdict?.status === "not_verified";

  // One SDK Verification per session, created in the browser only.
  useEffect(() => {
    if (!session) return;
    const v = createVerification({ clientToken: session.clientToken, locale });
    setVerification(v);
    return () => {
      v.destroy();
      setVerification(null);
    };
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // The server's verdict and the webhooks this app received, until the session ends.
  const { readVerdict } = props;
  useEffect(() => {
    if (!session) return;
    const refresh = () => {
      readVerdict(session.sessionId).then(setVerdict).catch((err: unknown) => console.warn("verdict", err));
      fetch("/api/events")
        .then((res) => res.json() as Promise<{ events: ReceivedEvent[] }>)
        .then((body) => setEvents(body.events.filter((e) => e.sessionId === session.sessionId)))
        .catch((err: unknown) => console.warn("events", err));
    };
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [session, readVerdict]);

  const onStep = useCallback((step: VerificationStep) => setLastStep(step.kind), []);

  const start = () => {
    setProblem(null);
    setVerdict(null);
    setEvents([]);
    setSdkResult(null);
    props.startVerification(locale).then(setSession).catch((err: unknown) => setProblem(String(err)));
  };

  const finish = props.finishWithTestData;
  return (
    <div dir={dir} lang={locale}>
      <div className="toolbar">
        <label>
          Language{" "}
          <select value={locale} disabled={session !== null && !final} onChange={(e) => setLocale(e.target.value as Locale)}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={start} disabled={session !== null && !final}>
          Start verification
        </button>
        {process.env.NODE_ENV === "development" && finish && session && !final && (
          <button
            type="button"
            onClick={() => finish(session.sessionId).then(setVerdict).catch((err: unknown) => setProblem(String(err)))}
          >
            Finish with test data
          </button>
        )}
        {problem && <span role="alert">{problem}</span>}
      </div>

      {verification && !final && (
        <SekyroVerification
          verification={verification}
          locale={locale}
          dir={dir}
          colorScheme="system"
          assetBaseUrl="/models-v3"
          onStep={onStep}
          onResult={setSdkResult}
          onClose={() => setSession(null)}
        />
      )}

      <section>
        <h2>What happened</h2>
        <pre>
          {JSON.stringify({ lastStep: lastStep || null, sdkResult: sdkResult?.status ?? null, serverVerdict: verdict, webhooks: events }, null, 2)}
        </pre>
      </section>
    </div>
  );
}
