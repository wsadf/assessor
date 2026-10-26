<script setup lang="ts">
import { computed } from "vue";
import { mesNome } from "../format";
import { HOJE, mesSelecionado } from "../estado";
import AppIcon from "./AppIcon.vue";

const mover = (delta: number) => {
  const [y, m] = mesSelecionado.value.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  mesSelecionado.value = d.toISOString().slice(0, 7);
};
const ehAtual = computed(() => mesSelecionado.value === HOJE.slice(0, 7));
</script>

<template>
  <div class="mes">
    <button class="icon-btn" aria-label="Mês anterior" @click="mover(-1)"><AppIcon name="voltar" :size="16" /></button>
    <span class="rotulo">{{ ehAtual ? "este mês" : mesNome(mesSelecionado) }}</span>
    <button class="icon-btn" aria-label="Próximo mês" :disabled="ehAtual" @click="mover(1)"><AppIcon name="avancar" :size="16" /></button>
  </div>
</template>

<style scoped>
.mes { display: inline-flex; align-items: center; gap: 12px; }
.mes .icon-btn { width: 34px; height: 34px; }
.mes .icon-btn:disabled { opacity: 0.35; cursor: default; }
.rotulo { font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mesa); min-width: 120px; text-align: center; }
</style>
