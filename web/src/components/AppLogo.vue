<script setup lang="ts">
withDefaults(defineProps<{ tamanho?: number; nome?: boolean }>(), { tamanho: 26, nome: true });
const id = `logo-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <span class="logo">
    <svg :width="tamanho" :height="tamanho" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient :id="id" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f0c09c" />
          <stop offset="1" stop-color="#c9784a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="10" :fill="`url(#${id})`" />
      <path d="M9 22l7-13 7 13" stroke="#0b0b0f" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span v-if="nome">assessor</span>
  </span>
</template>

<style scoped>
.logo { display: inline-flex; align-items: center; gap: 10px; font-family: var(--fonte-titulo); font-size: 21px; font-weight: 500; letter-spacing: -0.02em; }
</style>
