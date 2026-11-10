<script setup lang="ts">
// <sekyro-verification> runs every step of the session's flow. The page gets the one-time client token from the
// sample server, shows the SDK's result for display, and reads the verdict that counts from the server.
import type { SekyroCloseEvent, VerificationResult, VerificationStep } from "@sekyro/elements";
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from "vue";
import { readVerdict, startSession, type Verdict } from "./server";

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
const dir = computed(() => (locale.value === "ar" ? "rtl" : "ltr"));
const final = computed(() => verdict.value?.status === "verified" || verdict.value?.status === "not_verified");
const running = computed(() => session.value !== null && !final.value);

function start() {
  problem.value = null;
  verdict.value = null;
  sdkResult.value = null;
  startSession(locale.value)
    .then((s) => (session.value = { sessionId: s.sessionId, clientToken: s.clientToken }))
    .catch((err: unknown) => (problem.value = String(err)));
}

function onStep(event: CustomEvent<VerificationStep>) {
  lastStep.value = event.detail.kind;
}
function onResult(event: CustomEvent<VerificationResult>) {
  sdkResult.value = event.detail;
}
function onClose(_event: CustomEvent<SekyroCloseEvent>) {
  session.value = null;
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
        Language
        <select v-model="locale" :disabled="running">
          <option v-for="l in LOCALES" :key="l" :value="l">{{ l }}</option>
        </select>
      </label>
      <button type="button" :disabled="running" @click="start">Start verification</button>
      <span v-if="problem" role="alert">{{ problem }}</span>
    </div>

    <sekyro-verification
      v-if="session && running"
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
      @verdict="(v: Verdict) => (verdict = v)"
    />

    <section>
      <h2>What happened</h2>
      <pre>{{ JSON.stringify({ lastStep, sdkResult: sdkResult?.status ?? null, serverVerdict: verdict }, null, 2) }}</pre>
    </section>
  </main>
</template>
