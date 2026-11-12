// <sekyro-verification> runs every step of the session's flow. The page gets the one-time client token from the
// sample server, keeps the SDK's result screen until the person presses its button, and reads the verdict that
// counts from the server.
import { NgComponentOutlet } from "@angular/common";
import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, type OnDestroy, signal, type Type } from "@angular/core";
import type { SekyroCloseEvent, VerificationResult, VerificationStep } from "@sekyro/elements";
import { FallbackError, MESSAGES, type StartedSession, type UserView, type Verdict, VerificationService } from "./verification.service";

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
          Signed in as
          <select [value]="userId()" [disabled]="running()" (change)="setUser($event)">
            @for (u of users(); track u.id) {
              <option [value]="u.id">{{ u.label }}</option>
            }
          </select>
        </label>
        <label>
          Language
          <select [value]="locale()" [disabled]="running()" (change)="setLocale($event)">
            @for (l of locales; track l) {
              <option [value]="l">{{ l }}</option>
            }
          </select>
        </label>
        <button type="button" [disabled]="running() || !userId()" (click)="start()">Start verification</button>
        @if (user()?.returningReady) {
          <button type="button" [disabled]="running()" (click)="confirmItIsYou()">Confirm it is you</button>
        }
        @if (problem(); as message) {
          <span role="alert">{{ message }}</span>
        }
      </div>

      @if (!closed() && session(); as s) {
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
          <ng-container *ngComponentOutlet="component; inputs: { sessionId: s.sessionId, onVerdict: finishedWithTestData }" />
        }
      }

      @if (notice(); as n) {
        <p role="status">{{ n }} Use Start verification to run a full verification.</p>
      }
      @if (closed() && verdict(); as v) {
        <p role="status">{{ messages[v.decision.show] ?? messages["not_verified"] }}{{ v.decision.canRetry ? " You can start a new verification." : "" }}</p>
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
  readonly notice = signal<string | null>(null);
  readonly messages = MESSAGES;
  // "Signed in as": fixed demo users, so every session carries a stable externalRef.
  readonly users = signal<{ id: string; label: string }[]>([]);
  readonly userId = signal("");
  readonly user = signal<UserView | null>(null);
  readonly finish = signal<Type<unknown> | null>(null);
  readonly final = computed(() => this.verdict()?.status === "verified" || this.verdict()?.status === "not_verified");
  // The person pressed the result screen's button (sekyro-close "finished"). Never remove the flow on the server's
  // verdict alone: the person would lose the result screen.
  readonly closed = signal(false);
  readonly running = computed(() => this.session() !== null && !this.closed());
  readonly summary = computed(() =>
    JSON.stringify({ lastStep: this.lastStep(), sdkResult: this.sdkResult()?.status ?? null, serverVerdict: this.verdict() }, null, 2),
  );
  readonly setVerdict = (verdict: Verdict) => this.verdict.set(verdict);
  // Test data ends the session on the server, outside the flow: leave the flow at once.
  readonly finishedWithTestData = (verdict: Verdict) => {
    this.verdict.set(verdict);
    this.closed.set(true);
    this.refreshUser();
  };
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    void loadFinish?.().then((component) => this.finish.set(component));
    this.server
      .users()
      .then(({ users }) => {
        this.users.set(users);
        this.userId.set(users[0]?.id ?? "");
        this.refreshUser();
      })
      .catch((err: unknown) => this.problem.set(String(err)));
  }

  setLocale(event: Event): void {
    this.locale.set((event.target as HTMLSelectElement).value as Locale);
  }

  setUser(event: Event): void {
    this.userId.set((event.target as HTMLSelectElement).value);
    this.refreshUser();
  }

  refreshUser(): void {
    const id = this.userId();
    if (id) this.server.user(id).then((u) => this.user.set(u)).catch((err: unknown) => console.warn("user", err));
  }

  start(): void {
    this.run(() => this.server.start(this.userId(), this.locale(), crypto.randomUUID()));
  }

  confirmItIsYou(): void {
    this.run(() => this.server.recheck(this.userId(), crypto.randomUUID()));
  }

  // Every action creates its session on the click, never on render; one attemptId per click.
  private run(create: () => Promise<StartedSession>): void {
    this.problem.set(null);
    this.notice.set(null);
    this.closed.set(false);
    this.verdict.set(null);
    this.sdkResult.set(null);
    create()
      .then((s) => {
        this.session.set({ sessionId: s.sessionId, clientToken: s.clientToken });
        this.poll(s.sessionId);
      })
      .catch((err: unknown) => {
        // Not re-checkable (not returningReady, revoked, stale): offer a full verification instead.
        if (err instanceof FallbackError) this.notice.set(err.message);
        else this.problem.set(String(err));
      });
  }

  // The element's events: `detail` is what the matching @sekyro/react callback receives.
  onStep(event: Event): void {
    this.lastStep.set((event as CustomEvent<VerificationStep>).detail.kind);
  }
  // A verdict exists: refresh it from the server. The result screen stays on view.
  onResult(event: Event): void {
    this.sdkResult.set((event as CustomEvent<VerificationResult>).detail);
    const id = this.session()?.sessionId;
    if (id) this.server.verdict(id).then(this.setVerdict).catch((err: unknown) => console.warn("verdict", err));
  }
  // "finished": the person read the result and pressed its button. "cancelled": they left before it.
  onClose(event: Event): void {
    this.closed.set(true);
    this.refreshUser();
    if ((event as CustomEvent<SekyroCloseEvent>).detail.reason === "cancelled") {
      this.session.set(null);
      clearInterval(this.timer);
    }
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
