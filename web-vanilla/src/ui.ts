// Tiny DOM helpers: each `ask*` renders one question into the screen and
// resolves with the person's answer.
const screen = document.querySelector<HTMLElement>("#screen")!;

export function show(...nodes: (Node | string)[]): void {
  screen.replaceChildren(...nodes);
}

export function text(tag: string, content: string, className?: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = content;
  if (className) el.className = className;
  return el;
}

/** One text field and a submit button. */
export function askText(label: string, type: "text" | "tel" | "email" = "text", autocomplete = "off"): Promise<string> {
  return new Promise((resolve) => {
    const form = document.createElement("form");
    const input = Object.assign(document.createElement("input"), { type, required: true, autocomplete });
    const field = document.createElement("label");
    field.append(label, " ", input);
    const submit = Object.assign(document.createElement("button"), { type: "submit", textContent: "Continue" });
    form.append(field, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      resolve(input.value.trim());
    });
    show(form);
    input.focus();
  });
}

/** One button per option. */
export function askChoice<T extends string>(label: string, options: readonly T[], name: (option: T) => string = (o) => o): Promise<T> {
  return new Promise((resolve) => {
    const row = document.createElement("div");
    row.className = "choices";
    for (const option of options) {
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: name(option) });
      button.addEventListener("click", () => resolve(option));
      row.append(button);
    }
    show(text("p", label), row);
  });
}

/** A fresh <video> for a camera step, already on screen. */
export function video(label: string): HTMLVideoElement {
  const el = Object.assign(document.createElement("video"), { autoplay: true, muted: true, playsInline: true });
  show(text("p", label), el);
  return el;
}
