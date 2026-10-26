import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import "./style.css";

try {
  const tema = localStorage.getItem("assessor-tema");
  if (tema === "light" || tema === "dark") document.documentElement.dataset.theme = tema;
} catch {
  // Sem localStorage o tema segue o padrao escuro.
}

createApp(App).use(router).mount("#app");
