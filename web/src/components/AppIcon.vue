<script setup lang="ts">
defineProps<{ name: string; size?: number }>();

const PATHS: Record<string, string> = {
  painel: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z",
  transacoes: "M7 7h13M17 4l3 3-3 3M17 17H4M7 14l-3 3 3 3",
  categorias: "M3 12V4h8l9 9-8 8zM7.5 8.5h.01",
  cartao: "M3 6h18v12H3zM3 10h18M7 15h3",
  analises: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  sol: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  lua: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  menu: "M4 7h16M4 12h16M4 17h16",
  mais: "M12 5v14M5 12h14",
  voltar: "M15 18l-6-6 6-6",
  avancar: "M9 18l6-6-6-6",
  fechar: "M6 6l12 12M18 6 6 18",
  lixo: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  check: "M5 12.5l4.5 4.5L19 7.5",
  relogio: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  repetir: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
  arrastar: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  editar: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  busca: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
};
</script>

<template>
  <svg
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="PATHS[name] ?? ''" />
  </svg>
</template>
