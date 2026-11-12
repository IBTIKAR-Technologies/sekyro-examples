// Every step of the session's flow with @sekyro/web and plain DOM. The SDK
// runs the flow (`verification.run()`), hands over one typed step at a time
// (`on("step")`), and submits what the person answers. The verdict that
// counts is read on the server (`GET /sessions/:id` on the sample server).
import {
  acceptedIssuers,
  acceptedTypesFor,
  createVerification,
  InvalidInputError,
  OtpInputError,
  type Verification,
  type VerificationLocale,
  type VerificationStep,
} from "@sekyro/web";
import { FallbackError, listUsers, MESSAGES, readUser, readVerdict, startRecheck, type StartedSession, startSession, type Verdict } from "./server";
import { askChoice, askText, show, text, video } from "./ui";

const ASSET_BASE_URL = "/models-v3"; // npm run models copies the detector assets there
const locale: VerificationLocale = "en";
const startButton = document.querySelector<HTMLButtonElement>("#start")!;
const recheckButton = document.querySelector<HTMLButtonElement>("#recheck")!;
const userSelect = document.querySelector<HTMLSelectElement>("#user")!;
const verdictView = document.querySelector<HTMLElement>("#verdict")!;
const dev = document.querySelector<HTMLElement>("#dev")!;
const regionName = new Intl.DisplayNames([locale], { type: "region" });

let verification: Verification | undefined;
let polling: number | undefined;
let current: string | undefined;
let lastVerdict: Verdict | undefined;

// "Signed in as": fixed demo users, so every session carries a stable externalRef.
listUsers()
  .then(({ users }) => {
    userSelect.replaceChildren(...users.map((u) => Object.assign(document.createElement("option"), { value: u.id, textContent: u.label })));
    refreshUser();
  })
  .catch((err: unknown) => show(text("p", String(err), "problem")));
userSelect.addEventListener("change", refreshUser);

/** "Confirm it is you" shows only when the server says a re-check is possible now. */
function refreshUser(): void {
  readUser(userSelect.value)
    .then((u) => (recheckButton.hidden = !u.returningReady))
    .catch((err: unknown) => console.warn("user", err));
}

// Every action creates its session on the click, never on render; one attemptId per click.
startButton.addEventListener("click", () => run(() => startSession(userSelect.value, locale, crypto.randomUUID())));
recheckButton.addEventListener("click", () => run(() => startRecheck(userSelect.value, crypto.randomUUID())));

function run(create: () => Promise<StartedSession>): void {
  startButton.disabled = recheckButton.disabled = userSelect.disabled = true;
  start(create).catch((err: unknown) => {
    // Not re-checkable (not returningReady, revoked, stale): offer a full verification instead.
    if (err instanceof FallbackError) show(text("p", `${err.message} Use Start verification to run a full verification.`));
    else show(text("p", `Could not start: ${String(err)}`, "problem"));
    startButton.disabled = recheckButton.disabled = userSelect.disabled = false;
  });
}

async function start(create: () => Promise<StartedSession>): Promise<void> {
  const session = await create();
  current = session.sessionId;
  showVerdict({
    sessionId: session.sessionId,
    status: "created",
    reason: null,
    closedBy: null,
    personId: null,
    verified: null,
    decision: { access: false, show: "continue", canRetry: false },
  });
  pollVerdict(session.sessionId);
  if (import.meta.env.DEV) {
    const { mountFinishButton } = await import("./finish");
    // Test data ends the session on the server, outside the flow: leave the flow at once.
    mountFinishButton(dev, session.sessionId, (v) => {
      showVerdict(v);
      finish();
    });
  }

  verification = createVerification({ clientToken: session.clientToken, locale, rearm: "manual" });
  verification.on("step", (step) => void act(step));
  // A verdict exists: refresh it from the server, the one to act on. The result screen stays.
  verification.on("result", (result) => {
    console.log("SDK result", result.status, result.reason ?? "");
    if (current) readVerdict(current).then(showVerdict).catch((err: unknown) => console.warn("verdict", err));
  });
  const first = await verification.run?.(); // optional in the type, present since 0.1.0-rc.8
  if (first !== undefined) await act(first);
}

async function act(step: VerificationStep): Promise<void> {
  try {
    switch (step.kind) {
      case "phone_otp":
        if (step.phase === "send") {
          const phone = step.needsPhone ? { phone: await askText("Phone number, international format", "tel", "tel") } : {};
          const channel = step.channels.length > 1 ? { channel: await askChoice("Send the code by", step.channels) } : {};
          await step.send({ ...phone, ...channel });
        } else {
          await step.verify(await askText(`Code sent to ${step.sentToMasked ?? "your phone"}`));
        }
        break;
      case "email_otp":
        if (step.phase === "send") await step.send(step.needsEmail ? { email: await askText("Email address", "email", "email") } : {});
        else await step.verify(await askText(`Code sent to ${step.sentToMasked ?? "your email"}`));
        break;
      case "contact_choice":
        await step.select(await askChoice("Verify with", step.options));
        break;
      case "method":
        await step.select(await askChoice("Verify your identity with", step.options));
        break;
      case "registry":
        if (step.source === "typed") await step.submitIdNumber(await askText(step.recheck ? "Check your ID number" : "ID number"));
        else if (step.source === "bound") await step.confirm();
        break; // "document": the SDK reads the number from the document and submits it
      case "document":
        if (step.documentType === null) {
          const issuer = await askChoice("Country of your document", acceptedIssuers(step.documents), (c) => regionName.of(c) ?? c);
          step.selectDocument(issuer, await askChoice("Document", acceptedTypesFor(step.documents, issuer)));
        } else {
          await step.capture({ video: video("Hold your document inside the frame") }).start();
        }
        break;
      case "liveness":
        await step.capture({ video: video("Look at the camera"), assetBaseUrl: ASSET_BASE_URL }).start();
        break;
      case "portrait":
        if (step.uploadFailed) await step.resubmit();
        else if (step.phase === "capture") await step.capture({ video: video("Look at the camera"), assetBaseUrl: ASSET_BASE_URL }).start();
        break;
      case "identity_summary": {
        const answer = await askChoice("Are the details read from your document right?", step.retakeAvailable ? (["confirm", "retake"] as const) : (["confirm"] as const));
        await (answer === "retake" ? step.retake() : step.confirm());
        break;
      }
      case "mobile_required":
        show(text("p", "This step needs a phone. Open the session on a phone, or finish it with test data."));
        break;
      case "processing":
        show(text("p", step.stalled ? "Still checking. This can take a minute." : "Checking."));
        break;
      case "result": {
        // Keep the result on screen until the person presses the button, then leave the flow.
        const done = Object.assign(document.createElement("button"), { type: "button", textContent: "Done" });
        done.addEventListener("click", finish);
        show(text("p", `The flow ended (${step.display}).`), done);
        break;
      }
      default:
        // eid, choice, unsupported: see the web SDK guide; @sekyro/react renders them all.
        show(text("p", `This sample does not render the "${step.kind}" step. Use the React sample, or finish with test data.`));
    }
  } catch (err) {
    // Rejected locally: nothing was submitted, the same step asks again.
    if (err instanceof InvalidInputError || err instanceof OtpInputError) show(text("p", `Check the ${err.field} (${err.kind}).`, "problem"));
    else show(text("p", String(err), "problem"));
  }
}

function pollVerdict(sessionId: string): void {
  window.clearInterval(polling);
  polling = window.setInterval(() => {
    readVerdict(sessionId)
      .then(showVerdict)
      .catch((err: unknown) => console.warn("verdict", err));
  }, 3000);
}

function showVerdict(v: Verdict): void {
  lastVerdict = v;
  verdictView.textContent = JSON.stringify(v, null, 2);
  // Final on the server: stop polling, but never remove the flow here, the person may be reading the result.
  if (v.status === "verified" || v.status === "not_verified") {
    window.clearInterval(polling);
    dev.replaceChildren();
  }
}

/** The person pressed Done on the result: show what the server decided and allow a new session. */
function finish(): void {
  verification?.destroy();
  verification = undefined;
  const d = lastVerdict?.decision;
  show(text("p", d ? `${MESSAGES[d.show] ?? MESSAGES.not_verified}${d.canRetry ? " You can start a new verification." : ""}` : "Done."));
  startButton.disabled = recheckButton.disabled = userSelect.disabled = false;
  refreshUser();
}
