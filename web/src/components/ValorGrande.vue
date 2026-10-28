<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{ valor: number; moeda?: boolean; sufixo?: string }>(), { moeda: true });

const partes = computed(() => {
  if (props.moeda === false) return { inteiro: props.valor.toLocaleString("pt-BR"), centavos: "" };
  const abs = Math.abs(props.valor);
  const [i, c] = abs.toFixed(2).split(".");
  return { inteiro: `${props.valor < 0 ? "-" : ""}${Number(i).toLocaleString("pt-BR")}`, centavos: `,${c}` };
});
</script>

<template>
  <div class="valor num">
    <span v-if="moeda !== false" class="rs">R$</span>
    <span class="inteiro">{{ partes.inteiro }}</span>
    <span class="centavos">{{ partes.centavos }}</span>
    <span v-if="sufixo" class="sufixo">{{ sufixo }}</span>
  </div>
</template>

<style scoped>
.valor { display: flex; align-items: baseline; gap: 4px; line-height: 1; }
.valor { font-family: var(--fonte-titulo); }
.rs { font-size: 22px; color: var(--text-3); font-weight: 400; }
.inteiro { font-size: 56px; font-weight: 400; letter-spacing: -0.045em; }
.centavos { font-size: 22px; color: var(--text-3); }
.sufixo { font-size: 24px; color: var(--text-2); margin-left: 8px; }
@media (max-width: 600px) {
  .inteiro { font-size: 46px; }
}
</style>
