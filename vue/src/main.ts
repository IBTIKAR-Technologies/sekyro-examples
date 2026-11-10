import { createApp } from "vue";
// Registers <sekyro-verification> once; the stylesheet loads the flow's fonts beside it.
import "@sekyro/elements/define";
import "@sekyro/elements/styles.css";
// Types <sekyro-verification> in templates for vue-tsc.
import "@sekyro/elements/vue";
import "./app.css";
import App from "./App.vue";

createApp(App).mount("#app");
