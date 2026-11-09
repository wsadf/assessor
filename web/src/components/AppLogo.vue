<script setup lang="ts">
withDefaults(defineProps<{ tamanho?: number; nome?: boolean }>(), { tamanho: 26, nome: true });
const id = `logo-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <span class="logo">
    <svg :width="tamanho" :height="tamanho" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient :id="id" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f0c09c" />
          <stop offset="1" stop-color="#c9784a" />
        </linearGradient>
      </defs>
      <path d="M10 4h28a10 10 0 0 1 10 10v16a10 10 0 0 1-10 10H18l-12 8v-8.5A10 10 0 0 1 0 30V14A10 10 0 0 1 10 4z" :fill="`url(#${id})`" />
      <circle cx="13" cy="22" r="3.3" fill="#0b0b0f" />
      <circle cx="23" cy="22" r="3.3" fill="#0b0b0f" />
      <path d="M34 15Q34 22 41 22Q34 22 34 29Q34 22 27 22Q34 22 34 15Z" fill="#0b0b0f" />
    </svg>
    <span v-if="nome">secret<span class="ai">ai</span></span>
  </span>
</template>

<style scoped>
.logo { display: inline-flex; align-items: center; gap: 10px; font-family: var(--fonte-titulo); font-size: 21px; font-weight: 500; letter-spacing: -0.02em; }
.ai { color: var(--accent); }
</style>
