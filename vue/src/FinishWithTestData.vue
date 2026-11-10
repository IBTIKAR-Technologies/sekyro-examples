<script setup lang="ts">
// "Finish with test data": App.vue loads it only when import.meta.env.DEV is true, so `vite build` leaves it out.
import { ref } from "vue";
import { finishWithTestData, type Verdict } from "./server";

const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ verdict: [verdict: Verdict] }>();
const busy = ref(false);
const problem = ref<string | null>(null);

function finish() {
  busy.value = true;
  problem.value = null;
  finishWithTestData(props.sessionId)
    .then((v) => emit("verdict", v))
    .catch((err: unknown) => (problem.value = String(err)))
    .finally(() => (busy.value = false));
}
</script>

<template>
  <div class="toolbar">
    <button type="button" :disabled="busy" @click="finish">Finish with test data</button>
    <span v-if="problem" role="alert">{{ problem }}</span>
  </div>
</template>
