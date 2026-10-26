<script setup lang="ts">
import { computed, ref } from "vue";
import { brl, pct } from "../../format";

const props = defineProps<{ itens: { nome: string; valor: number; cor: string }[]; rotuloCentro?: string }>();
const ativo = ref<number | null>(null);

const R = 70;
const C = 2 * Math.PI * R;
const total = computed(() => props.itens.reduce((s, i) => s + i.valor, 0));
const arcos = computed(() => {
  let acumulado = 0;
  return props.itens.map((it, i) => {
    const frac = total.value ? it.valor / total.value : 0;
    // Pequena folga entre os arcos; arcos minusculos ficam visiveis com um minimo de 0,6%.
    const comp = Math.max(frac * C - 3, frac > 0 ? C * 0.006 : 0);
    const arco = { i, cor: it.cor, dash: `${comp} ${C - comp}`, offset: -acumulado * C, frac };
    acumulado += frac;
    return arco;
  });
});
const centro = computed(() => (ativo.value === null ? { titulo: props.rotuloCentro ?? "total", valor: total.value } : { titulo: props.itens[ativo.value].nome, valor: props.itens[ativo.value].valor }));
</script>

<template>
  <div class="rosca">
    <svg viewBox="0 0 200 200" role="img" aria-label="Gráfico de rosca">
      <g transform="rotate(-90 100 100)">
        <circle cx="100" cy="100" :r="R" fill="none" stroke="var(--surface-2)" stroke-width="22" />
        <circle
          v-for="a in arcos"
          :key="a.i"
          cx="100"
          cy="100"
          :r="R"
          fill="none"
          :stroke="a.cor"
          :stroke-width="ativo === a.i ? 26 : 22"
          :stroke-dasharray="a.dash"
          :stroke-dashoffset="a.offset"
          class="arco"
          @pointerenter="ativo = a.i"
          @pointerleave="ativo = null"
        />
      </g>
      <text x="100" y="94" text-anchor="middle" class="c-titulo">{{ centro.titulo }}</text>
      <text x="100" y="116" text-anchor="middle" class="c-valor">{{ brl(centro.valor) }}</text>
    </svg>
    <ul class="legenda">
      <li v-for="(it, i) in itens" :key="it.nome" :class="{ ativo: ativo === i }" @pointerenter="ativo = i" @pointerleave="ativo = null">
        <span class="dot" :style="{ background: it.cor }" />
        <span class="nome">{{ it.nome }}</span>
        <span class="faint num">{{ pct(total ? it.valor / total : 0) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.rosca { display: grid; grid-template-columns: minmax(150px, 210px) 1fr; gap: 20px; align-items: center; }
svg { width: 100%; height: auto; }
.arco { transition: stroke-width 0.15s; cursor: pointer; }
.c-titulo { fill: var(--text-3); font-size: 11px; }
.c-valor { fill: var(--text); font-size: 15px; font-weight: 700; }
.legenda { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; font-size: 13.5px; }
.legenda li { display: flex; align-items: center; gap: 8px; padding: 2px 6px; border-radius: 6px; }
.legenda li.ativo { background: var(--surface-2); }
.nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 520px) {
  .rosca { grid-template-columns: 1fr; }
  svg { max-width: 220px; margin: 0 auto; }
}
</style>
