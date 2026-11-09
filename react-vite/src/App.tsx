// <SekyroVerification> runs every step of the session's flow. The page gets
// the one-time client token from the sample server, shows the SDK's result
// for display, and reads the verdict that counts from the server.
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { createVerification, type Verification, type VerificationResult, type VerificationStep } from "@sekyro/web";
import { SekyroVerification } from "@sekyro/react/verification";
import { readVerdict, startSession, type Verdict } from "./server";

const FinishWithTestData = import.meta.env.DEV ? lazy(() => import("./FinishWithTestData")) : null;

const LOCALES = ["en", "fr", "ar"] as const;
type Locale = (typeof LOCALES)[number];

export function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const [session, setSession] = useState<{ sessionId: string; clientToken: string } | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [lastStep, setLastStep] = useState<string>("");
  const [sdkResult, setSdkResult] = useState<VerificationResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const dir = locale === "ar" ? "rtl" : "ltr";

  // One Verification per session token, destroyed when the session goes away.
  // The locale is chosen before starting (the picker is disabled during a session).
  const [verification, setVerification] = useState<Verification | null>(null);
  useEffect(() => {
    if (!session) return;
    const v = createVerification({ clientToken: session.clientToken, locale });
    setVerification(v);
    return () => {
      v.destroy();
      setVerification(null);
    };
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const final = verdict?.status === "verified" || verdict?.status === "not_verified";
  useEffect(() => {
    if (!session || final) return;
    const timer = window.setInterval(() => {
      readVerdict(session.sessionId).then(setVerdict).catch((err: unknown) => console.warn("verdict", err));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [session, final]);

  // Stable callback: <SekyroVerification> calls onStep from an effect keyed on it.
  const onStep = useCallback((step: VerificationStep) => setLastStep(step.kind), []);

  const start = () => {
    setProblem(null);
    setVerdict(null);
    setSdkResult(null);
    startSession(locale)
      .then((s) => setSession({ sessionId: s.sessionId, clientToken: s.clientToken }))
      .catch((err: unknown) => setProblem(String(err)));
  };

  return (
    <main dir={dir} lang={locale}>
      <h1>Sekyro AI React sample</h1>
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
        {problem && <span role="alert">{problem}</span>}
      </div>

      {session && verification && !final && (
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

      {session && FinishWithTestData && !final && (
        <Suspense fallback={null}>
          <FinishWithTestData sessionId={session.sessionId} onVerdict={setVerdict} />
        </Suspense>
      )}

      <section>
        <h2>What happened</h2>
        <pre>
          {JSON.stringify({ lastStep: lastStep || null, sdkResult: sdkResult?.status ?? null, serverVerdict: verdict }, null, 2)}
        </pre>
      </section>
    </main>
  );
}
