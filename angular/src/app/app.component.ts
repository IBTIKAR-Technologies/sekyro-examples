// <sekyro-verification> runs every step of the session's flow. The page gets the one-time client token from the
// sample server, shows the SDK's result for display, and reads the verdict that counts from the server.
import { NgComponentOutlet } from "@angular/common";
import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, type OnDestroy, signal, type Type } from "@angular/core";
import type { SekyroCloseEvent, VerificationResult, VerificationStep } from "@sekyro/elements";
import { type Verdict, VerificationService } from "./verification.service";

// `ngDevMode` is false in a production build: the import below is then removed with "Finish with test data".
declare const ngDevMode: unknown;
const loadFinish =
  typeof ngDevMode === "undefined" || ngDevMode
    ? () => import("./finish-with-test-data.component").then((m) => m.FinishWithTestDataComponent)
    : null;

const LOCALES = ["en", "fr", "ar"] as const;
type Locale = (typeof LOCALES)[number];

@Component({
  selector: "app-root",
  standalone: true,
  imports: [NgComponentOutlet],
  // <sekyro-verification> is a custom element: Angular leaves unknown tags and their bindings to the browser.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <main [attr.dir]="locale() === 'ar' ? 'rtl' : 'ltr'" [attr.lang]="locale()">
      <h1>Sekyro AI Angular sample</h1>
      <div class="toolbar">
        <label>
          Language
          <select [value]="locale()" [disabled]="running()" (change)="setLocale($event)">
            @for (l of locales; track l) {
              <option [value]="l">{{ l }}</option>
            }
          </select>
        </label>
        <button type="button" [disabled]="running()" (click)="start()">Start verification</button>
        @if (problem(); as message) {
          <span role="alert">{{ message }}</span>
        }
      </div>

      @if (running() && session(); as s) {
        <sekyro-verification
          [clientToken]="s.clientToken"
          [locale]="locale()"
          color-scheme="system"
          asset-base-url="/models-v3"
          closable
          (sekyro-step)="onStep($event)"
          (sekyro-result)="onResult($event)"
          (sekyro-close)="onClose($event)"
        ></sekyro-verification>
        @if (finish(); as component) {
          <ng-container *ngComponentOutlet="component; inputs: { sessionId: s.sessionId, onVerdict: setVerdict }" />
        }
      }

      <section>
        <h2>What happened</h2>
        <pre>{{ summary() }}</pre>
      </section>
    </main>
  `,
})
export class AppComponent implements OnDestroy {
  private readonly server = inject(VerificationService);
  readonly locales = LOCALES;
  readonly locale = signal<Locale>("en");
  readonly session = signal<{ sessionId: string; clientToken: string } | null>(null);
  readonly verdict = signal<Verdict | null>(null);
  readonly lastStep = signal<string | null>(null);
  readonly sdkResult = signal<VerificationResult | null>(null);
  readonly problem = signal<string | null>(null);
  readonly finish = signal<Type<unknown> | null>(null);
  readonly final = computed(() => this.verdict()?.status === "verified" || this.verdict()?.status === "not_verified");
  readonly running = computed(() => this.session() !== null && !this.final());
  readonly summary = computed(() =>
    JSON.stringify({ lastStep: this.lastStep(), sdkResult: this.sdkResult()?.status ?? null, serverVerdict: this.verdict() }, null, 2),
  );
  readonly setVerdict = (verdict: Verdict) => this.verdict.set(verdict);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    void loadFinish?.().then((component) => this.finish.set(component));
  }

  setLocale(event: Event): void {
    this.locale.set((event.target as HTMLSelectElement).value as Locale);
  }

  start(): void {
    this.problem.set(null);
    this.verdict.set(null);
    this.sdkResult.set(null);
    this.server
      .start(this.locale())
      .then((s) => {
        this.session.set({ sessionId: s.sessionId, clientToken: s.clientToken });
        this.poll(s.sessionId);
      })
      .catch((err: unknown) => this.problem.set(String(err)));
  }

  // The element's events: `detail` is what the matching @sekyro/react callback receives.
  onStep(event: Event): void {
    this.lastStep.set((event as CustomEvent<VerificationStep>).detail.kind);
  }
  onResult(event: Event): void {
    this.sdkResult.set((event as CustomEvent<VerificationResult>).detail);
  }
  onClose(event: Event): void {
    // "finished" (with the result) or "cancelled": back to the page either way.
    console.info("sekyro-close", (event as CustomEvent<SekyroCloseEvent>).detail.reason);
    this.session.set(null);
    clearInterval(this.timer);
  }

  /** The verdict that counts, from the server, until it is final. */
  private poll(sessionId: string): void {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.server
        .verdict(sessionId)
        .then((v) => {
          this.verdict.set(v);
          if (this.final()) clearInterval(this.timer);
        })
        .catch((err: unknown) => console.warn("verdict", err));
    }, 3000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
