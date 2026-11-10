// "Finish with test data": AppComponent imports it only in a development build (`npm start`); a production build
// (`npm run build`) leaves this file and its test route out.
import { Component, Input, signal } from "@angular/core";
import { finishWithTestData, type Verdict } from "./verification.service";

@Component({
  selector: "app-finish-with-test-data",
  standalone: true,
  template: `
    <div class="toolbar">
      <button type="button" [disabled]="busy()" (click)="finish()">Finish with test data</button>
      @if (problem(); as message) {
        <span role="alert">{{ message }}</span>
      }
    </div>
  `,
})
export class FinishWithTestDataComponent {
  @Input({ required: true }) sessionId!: string;
  @Input({ required: true }) onVerdict!: (verdict: Verdict) => void;
  readonly busy = signal(false);
  readonly problem = signal<string | null>(null);

  finish(): void {
    this.busy.set(true);
    this.problem.set(null);
    finishWithTestData(this.sessionId)
      .then((v) => this.onVerdict(v))
      .catch((err: unknown) => this.problem.set(String(err)))
      .finally(() => this.busy.set(false));
  }
}
