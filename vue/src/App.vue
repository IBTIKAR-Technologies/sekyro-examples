<script setup lang="ts">
// <sekyro-verification> runs every step of the session's flow. The page gets the one-time client token from the
// sample server, keeps the SDK's result screen until the person presses its button, and reads the verdict that
// counts from the server.
import type { SekyroCloseEvent, VerificationResult, VerificationStep } from "@sekyro/elements";
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  FallbackError,
  listUsers,
  MESSAGES,
  readUser,
  readVerdict,
  startRecheck,
  type StartedSession,
  startSession,
  type UserView,
  type Verdict,
} from "./server";

// Development builds only: `vite build` drops the component and its test route.
const FinishWithTestData = import.meta.env.DEV ? defineAsyncComponent(() => import("./FinishWithTestData.vue")) : null;

const LOCALES = ["en", "fr", "ar"] as const;
type Locale = (typeof LOCALES)[number];

const locale = ref<Locale>("en");
const session = ref<{ sessionId: string; clientToken: string } | null>(null);
const verdict = ref<Verdict | null>(null);
const lastStep = ref<string | null>(null);
const sdkResult = ref<VerificationResult | null>(null);
const problem = ref<string | null>(null);
const notice = ref<string | null>(null);
// "Signed in as": fixed demo users, so every session carries a stable externalRef.
const users = ref<{ id: string; label: string }[]>([]);
const userId = ref("");
const user = ref<UserView | null>(null);
function refreshUser() {
  if (userId.value) readUser(userId.value).then((u) => (user.value = u)).catch((err: unknown) => console.warn("user", err));
}
onMounted(() => {
  listUsers()
    .then(({ users: list }) => {
      users.value = list;
      userId.value = list[0]?.id ?? "";
    })
    .catch((err: unknown) => (problem.value = String(err)));
});
watch(userId, refreshUser);
const dir = computed(() => (locale.value === "ar" ? "rtl" : "ltr"));
const final = computed(() => verdict.value?.status === "verified" || verdict.value?.status === "not_verified");
// The person pressed the result screen's button (sekyro-close "finished"). Never remove the flow on the server's
// verdict alone: the person would lose the result screen.
const closed = ref(false);
const running = computed(() => session.value !== null && !closed.value);
const showFlow = computed(() => session.value !== null && !closed.value);

// Every action creates its session on the click, never on render; one attemptId per click.
function run(create: () => Promise<StartedSession>) {
  problem.value = null;
  notice.value = null;
  closed.value = false;
  verdict.value = null;
  sdkResult.value = null;
  create()
    .then((s) => (session.value = { sessionId: s.sessionId, clientToken: s.clientToken }))
    .catch((err: unknown) => {
      // Not re-checkable (not returningReady, revoked, stale): offer a full verification instead.
      if (err instanceof FallbackError) notice.value = err.message;
      else problem.value = String(err);
    });
}
const verify = () => run(() => startSession(userId.value, locale.value, crypto.randomUUID()));
const confirmItIsYou = () => run(() => startRecheck(userId.value, crypto.randomUUID()));

function onStep(event: CustomEvent<VerificationStep>) {
  lastStep.value = event.detail.kind;
}
// A verdict exists: refresh it from the server. The result screen stays on view.
function onResult(event: CustomEvent<VerificationResult>) {
  sdkResult.value = event.detail;
  const id = session.value?.sessionId;
  if (id) readVerdict(id).then((v) => (verdict.value = v)).catch((err: unknown) => console.warn("verdict", err));
}
// "finished": the person read the result and pressed its button. "cancelled": they left before it.
function onClose(event: CustomEvent<SekyroCloseEvent>) {
  closed.value = true;
  if (event.detail.reason === "cancelled") session.value = null;
  refreshUser();
}

// Test data ends the session on the server, outside the flow: leave the flow at once.
function onTestVerdict(v: Verdict) {
  verdict.value = v;
  closed.value = true;
  refreshUser();
}

// The verdict that counts, from the server, until it is final.
let timer: number | undefined;
watch(
  running,
  (isRunning) => {
    window.clearInterval(timer);
    if (!isRunning || session.value === null) return;
    const id = session.value.sessionId;
    timer = window.setInterval(() => {
      readVerdict(id).then((v) => (verdict.value = v)).catch((err: unknown) => console.warn("verdict", err));
    }, 3000);
  },
  { immediate: true },
);
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<template>
  <main :dir="dir" :lang="locale">
    <h1>Sekyro AI Vue sample</h1>
    <div class="toolbar">
      <label>
        Signed in as
        <select v-model="userId" :disabled="running">
          <option v-for="u in users" :key="u.id" :value="u.id">{{ u.label }}</option>
        </select>
      </label>
      <label>
        Language
        <select v-model="locale" :disabled="running">
          <option v-for="l in LOCALES" :key="l" :value="l">{{ l }}</option>
        </select>
      </label>
      <button type="button" :disabled="running || !userId" @click="verify">Start verification</button>
      <button v-if="user?.returningReady" type="button" :disabled="running" @click="confirmItIsYou">Confirm it is you</button>
      <span v-if="problem" role="alert">{{ problem }}</span>
    </div>

    <sekyro-verification
      v-if="session && showFlow"
      :client-token="session.clientToken"
      :locale="locale"
      color-scheme="system"
      asset-base-url="/models-v3"
      closable
      @sekyro-step="onStep"
      @sekyro-result="onResult"
      @sekyro-close="onClose"
    />

    <component
      :is="FinishWithTestData"
      v-if="FinishWithTestData && session && running"
      :session-id="session.sessionId"
      @verdict="onTestVerdict"
    />

    <p v-if="notice" role="status">{{ notice }} Use Start verification to run a full verification.</p>
    <p v-if="closed && verdict" role="status">
      {{ MESSAGES[verdict.decision.show] ?? MESSAGES.not_verified
      }}{{ verdict.decision.canRetry ? " You can start a new verification." : "" }}
    </p>

    <section>
      <h2>What happened</h2>
      <pre>{{ JSON.stringify({ lastStep, sdkResult: sdkResult?.status ?? null, serverVerdict: verdict, user }, null, 2) }}</pre>
    </section>
  </main>
</template>
