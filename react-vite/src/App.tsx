// <SekyroVerification> runs every step of the session's flow. The page is thin: the sample server
// creates sessions on click, decides every outcome and keeps each demo user's state. The page gets
// the one-time client token, keeps the SDK's result screen until the person presses its button,
// then shows what the server decided.
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { createVerification, type Verification, type VerificationResult, type VerificationStep } from "@sekyro/web";
import { SekyroVerification } from "@sekyro/react/verification";
import {
  FallbackError,
  listUsers,
  MESSAGES,
  readUser,
  readVerdict,
  startRecheck,
  type StartedSession,
  startSession,
  startStepUp,
  type UserView,
  type Verdict,
} from "./server";

const FinishWithTestData = import.meta.env.DEV ? lazy(() => import("./FinishWithTestData")) : null;

const LOCALES = ["en", "fr", "ar"] as const;
type Locale = (typeof LOCALES)[number];

export function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const [users, setUsers] = useState<{ id: string; label: string }[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [user, setUser] = useState<UserView | null>(null);
  const [session, setSession] = useState<{ sessionId: string; clientToken: string } | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [lastStep, setLastStep] = useState<string>("");
  const [sdkResult, setSdkResult] = useState<VerificationResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The person pressed the result screen's button (onClose "finished"): the flow leaves the page.
  // Never unmount on the server's verdict alone: the person would lose the result screen.
  const [closed, setClosed] = useState(false);
  const dir = locale === "ar" ? "rtl" : "ltr";

  // "Signed in as": fixed demo users, so every session carries a stable externalRef.
  useEffect(() => {
    listUsers()
      .then(({ users: list }) => {
        setUsers(list);
        setUserId((current) => current || (list[0]?.id ?? ""));
      })
      .catch((err: unknown) => setProblem(String(err)));
  }, []);
  const refreshUser = useCallback(() => {
    if (userId) readUser(userId).then(setUser).catch((err: unknown) => console.warn("user", err));
  }, [userId]);
  useEffect(refreshUser, [refreshUser]);

  // One Verification per session token, destroyed when the session goes away.
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

  // While the session runs, the server's verdict (the webhook keeps it current too).
  const final = verdict?.status === "verified" || verdict?.status === "not_verified";
  useEffect(() => {
    if (!session || final) return;
    const timer = window.setInterval(() => {
      readVerdict(session.sessionId).then(setVerdict).catch((err: unknown) => console.warn("verdict", err));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [session, final]);

  const onStep = useCallback((step: VerificationStep) => setLastStep(step.kind), []);

  // A verdict exists: refresh it from the server. The result screen stays on view.
  const onResult = useCallback(
    (result: VerificationResult) => {
      setSdkResult(result);
      if (session) readVerdict(session.sessionId).then(setVerdict).catch((err: unknown) => console.warn("verdict", err));
    },
    [session],
  );

  const busy = session !== null && !closed;

  // Every action creates its session on the click, never on render.
  const run = (create: () => Promise<StartedSession>) => {
    setProblem(null);
    setNotice(null);
    setClosed(false);
    setVerdict(null);
    setSdkResult(null);
    create()
      .then((s) => setSession({ sessionId: s.sessionId, clientToken: s.clientToken }))
      .catch((err: unknown) => {
        // Not re-checkable (not returningReady, revoked, stale): offer a full verification instead.
        if (err instanceof FallbackError) setNotice(err.message);
        else setProblem(String(err));
      });
  };

  const done = (v: Verdict | null) => {
    setClosed(true);
    if (v) setVerdict(v);
    refreshUser();
  };

  return (
    <main dir={dir} lang={locale}>
      <h1>Sekyro AI React sample</h1>
      <div className="toolbar">
        <label>
          Signed in as{" "}
          <select value={userId} disabled={busy} onChange={(e) => setUserId(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Language{" "}
          <select value={locale} disabled={busy} onChange={(e) => setLocale(e.target.value as Locale)}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy || !userId} onClick={() => run(() => startSession(userId, locale))}>
          Verify
        </button>
        {user?.returningReady && (
          <button type="button" disabled={busy} onClick={() => run(() => startRecheck(userId))}>
            Confirm it is you
          </button>
        )}
        {user?.personId && user.level !== 3 && (
          <button type="button" disabled={busy} onClick={() => run(() => startStepUp(userId))}>
            Raise to Identity
          </button>
        )}
        {problem && <span role="alert">{problem}</span>}
      </div>
      {notice && <p role="status">{notice} Use Verify to run a full verification.</p>}

      {session && verification && !closed && (
        <SekyroVerification
          verification={verification}
          locale={locale}
          dir={dir}
          colorScheme="system"
          assetBaseUrl="/models-v3"
          onStep={onStep}
          onResult={onResult}
          onClose={(event) => {
            // "finished": the person read the result. "cancelled": they left before it.
            if (event.reason === "cancelled") setSession(null);
            done(null);
          }}
        />
      )}

      {session && FinishWithTestData && !closed && (
        <Suspense fallback={null}>
          {/* Test data ends the session on the server, outside the flow: leave the flow at once. */}
          <FinishWithTestData sessionId={session.sessionId} onVerdict={done} />
        </Suspense>
      )}

      {closed && verdict && (
        <p role="status">
          {MESSAGES[verdict.decision.show] ?? MESSAGES.not_verified}
          {verdict.decision.canRetry ? " You can start a new verification." : ""}
        </p>
      )}

      <section>
        <h2>What happened</h2>
        <pre>{JSON.stringify({ lastStep: lastStep || null, sdkResult: sdkResult?.status ?? null, serverVerdict: verdict, user }, null, 2)}</pre>
      </section>
    </main>
  );
}
