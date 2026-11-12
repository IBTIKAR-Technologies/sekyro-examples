"use client";
// The client part: <SekyroVerification> from @sekyro/react runs the flow in
// the browser with the one-time client token the Server Action returned.
import { useCallback, useEffect, useState } from "react";
import { createVerification, type Verification as SdkVerification, type VerificationResult, type VerificationStep } from "@sekyro/web";
import { SekyroVerification } from "@sekyro/react/verification";
import type { Fallback, StartedSession, UserView, Verdict } from "./actions";

/** What to tell the person for each decision of the server (`decision.show`). */
const MESSAGES: Record<string, string> = {
  verified: "You are verified.",
  needs_stronger_proof: "This verification does not prove enough for this action.",
  in_review: "We are checking your verification and will let you know.",
  continue: "Your verification is not finished. You can continue it.",
  expired: "Your verification link expired. You can start again.",
  rejected: "We could not verify you. Contact us if you think this is wrong.",
  try_again: "We could not complete the check. Try again in good light.",
  try_later: "Verification is unavailable right now. Try again later.",
  policy: "Your verification does not meet a rule of this service.",
  cancelled: "This verification was cancelled.",
  follow_newer: "A newer verification replaced this one.",
  not_verified: "You are not verified.",
};

const LOCALES = ["en", "fr", "ar"] as const;
type Locale = (typeof LOCALES)[number];

interface ReceivedEvent {
  id: string | null;
  event: string | null;
  sessionId: string | null;
  signature: string;
}

export interface VerificationProps {
  listUsers: () => Promise<{ id: string; label: string }[]>;
  readUser: (userId: string) => Promise<UserView>;
  startVerification: (userId: string, locale: string, attemptId: string) => Promise<StartedSession>;
  startRecheck: (userId: string, attemptId: string) => Promise<StartedSession | Fallback>;
  startStepUp: (userId: string, attemptId: string) => Promise<StartedSession | Fallback>;
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
  const [notice, setNotice] = useState<string | null>(null);
  // "Signed in as": fixed demo users, so every session carries a stable externalRef.
  const [users, setUsers] = useState<{ id: string; label: string }[]>([]);
  const [userId, setUserId] = useState("");
  const [user, setUser] = useState<UserView | null>(null);
  const { listUsers, readUser: readUserAction } = props;
  useEffect(() => {
    listUsers()
      .then((list) => {
        setUsers(list);
        setUserId((current) => current || (list[0]?.id ?? ""));
      })
      .catch((err: unknown) => setProblem(String(err)));
  }, [listUsers]);
  const refreshUser = useCallback(() => {
    if (userId) readUserAction(userId).then(setUser).catch((err: unknown) => console.warn("user", err));
  }, [userId, readUserAction]);
  useEffect(refreshUser, [refreshUser]);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const final = verdict?.status === "verified" || verdict?.status === "not_verified";
  // The person pressed the result screen's button: the flow is done on this page.
  const [closed, setClosed] = useState(false);
  const busy = session !== null && !closed;

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

  // A verdict exists: refresh it from the server. The SDK's result screen stays on view.
  const onResult = useCallback(
    (result: VerificationResult) => {
      setSdkResult(result);
      if (session) readVerdict(session.sessionId).then(setVerdict).catch((err: unknown) => console.warn("verdict", err));
    },
    [session, readVerdict],
  );

  // Every action creates its session on the click, never on render; one attemptId per click.
  const run = (create: (attemptId: string) => Promise<StartedSession | Fallback>) => {
    setProblem(null);
    setNotice(null);
    setClosed(false);
    setVerdict(null);
    setEvents([]);
    setSdkResult(null);
    create(crypto.randomUUID())
      .then((s) => {
        // Not re-checkable (not returningReady, revoked, stale): offer a full verification instead.
        if ("fallback" in s) setNotice(s.message);
        else setSession(s);
      })
      .catch((err: unknown) => setProblem(String(err)));
  };

  const finish = props.finishWithTestData;
  return (
    <div dir={dir} lang={locale}>
      <div className="toolbar">
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
        <button type="button" onClick={() => run((a) => props.startVerification(userId, locale, a))} disabled={busy || !userId}>
          Verify
        </button>
        {user?.returningReady && (
          <button type="button" onClick={() => run((a) => props.startRecheck(userId, a))} disabled={busy}>
            Confirm it is you
          </button>
        )}
        {user?.personId && user.level !== 3 && (
          <button type="button" onClick={() => run((a) => props.startStepUp(userId, a))} disabled={busy}>
            Raise to Identity
          </button>
        )}
        {process.env.NODE_ENV === "development" && finish && session && !final && (
          <button
            type="button"
            onClick={() =>
              finish(session.sessionId)
                .then((v) => {
                  // Test data ends the session on the server, outside the flow: leave the flow at once.
                  setVerdict(v);
                  setClosed(true);
                  refreshUser();
                })
                .catch((err: unknown) => setProblem(String(err)))}
          >
            Finish with test data
          </button>
        )}
        {problem && <span role="alert">{problem}</span>}
      </div>

      {verification && !closed && (
        <SekyroVerification
          verification={verification}
          locale={locale}
          dir={dir}
          colorScheme="system"
          assetBaseUrl="/models-v3"
          onStep={onStep}
          onResult={onResult}
          onClose={(event) => {
            // "finished": the person read the result and pressed its button. "cancelled": they left before it.
            setClosed(true);
            if (event.reason === "cancelled") setSession(null);
            refreshUser();
          }}
        />
      )}

      {notice && <p role="status">{notice} Use Verify to run a full verification.</p>}
      {closed && verdict && (
        <p role="status">
          {MESSAGES[verdict.decision.show] ?? MESSAGES.not_verified}
          {verdict.decision.canRetry ? " You can start a new verification." : ""}
        </p>
      )}

      <section>
        <h2>What happened</h2>
        <pre>
          {JSON.stringify({ lastStep: lastStep || null, sdkResult: sdkResult?.status ?? null, serverVerdict: verdict, user, webhooks: events }, null, 2)}
        </pre>
      </section>
    </div>
  );
}
