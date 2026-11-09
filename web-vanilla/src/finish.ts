// "Finish with test data": development builds only. `import.meta.env.DEV` is
// false in `vite build`, so main.ts never loads this module there and the
// production bundle carries no test route.
import { finishWithTestData, type Verdict } from "./server";

export function mountFinishButton(container: HTMLElement, sessionId: string, onVerdict: (v: Verdict) => void): void {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Finish with test data";
  button.addEventListener("click", () => {
    button.disabled = true;
    finishWithTestData(sessionId)
      .then(onVerdict)
      .catch((err: unknown) => {
        button.disabled = false;
        container.append(Object.assign(document.createElement("p"), { className: "problem", textContent: String(err) }));
      });
  });
  container.replaceChildren(button);
}
