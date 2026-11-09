// "Finish with test data": App.tsx renders it only when import.meta.env.DEV
// is true, and loads it lazily, so `vite build` drops it from the bundle.
import { useState } from "react";
import { finishWithTestData, type Verdict } from "./server";

export default function FinishWithTestData(props: { sessionId: string; onVerdict: (verdict: Verdict) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="toolbar">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setProblem(null);
          finishWithTestData(props.sessionId)
            .then(props.onVerdict)
            .catch((err: unknown) => setProblem(String(err)))
            .finally(() => setBusy(false));
        }}
      >
        Finish with test data
      </button>
      {problem && <span role="alert">{problem}</span>}
    </div>
  );
}
