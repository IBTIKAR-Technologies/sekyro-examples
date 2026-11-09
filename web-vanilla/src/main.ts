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
import { readVerdict, startSession, type Verdict } from "./server";
import { askChoice, askText, show, text, video } from "./ui";

const ASSET_BASE_URL = "/models-v3"; // npm run models copies the detector assets there
const locale: VerificationLocale = "en";
const startButton = document.querySelector<HTMLButtonElement>("#start")!;
const verdictView = document.querySelector<HTMLElement>("#verdict")!;
const dev = document.querySelector<HTMLElement>("#dev")!;
const regionName = new Intl.DisplayNames([locale], { type: "region" });

let verification: Verification | undefined;
let polling: number | undefined;

startButton.addEventListener("click", () => {
  startButton.disabled = true;
  start().catch((err: unknown) => {
    show(text("p", `Could not start: ${String(err)}`, "problem"));
    startButton.disabled = false;
  });
});

async function start(): Promise<void> {
  const session = await startSession(locale);
  showVerdict({ sessionId: session.sessionId, status: "created", reason: null, closedBy: null, personId: null, verified: null });
  pollVerdict(session.sessionId);
  if (import.meta.env.DEV) {
    const { mountFinishButton } = await import("./finish");
    mountFinishButton(dev, session.sessionId, showVerdict);
  }

  verification = createVerification({ clientToken: session.clientToken, locale, rearm: "manual" });
  verification.on("step", (step) => void act(step));
  // Display only: the server's verdict below is the one to act on.
  verification.on("result", (result) => console.log("SDK result", result.status, result.reason ?? ""));
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
      case "result":
        show(text("p", `The flow ended (${step.display}). The server verdict is below.`));
        break;
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
  verdictView.textContent = JSON.stringify(v, null, 2);
  if (v.status === "verified" || v.status === "not_verified") {
    window.clearInterval(polling);
    verification?.destroy();
    dev.replaceChildren();
  }
}
