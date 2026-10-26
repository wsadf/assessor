<script setup lang="ts">
import { computed, ref } from "vue";
import { brl } from "../../format";
import { escala, rotuloEixo, type Serie } from "./escala";

const props = withDefaults(
  defineProps<{ rotulos: string[]; series: Serie[]; altura?: number; empilhado?: boolean; formatar?: (v: number) => string; legenda?: boolean }>(),
  { altura: 240, empilhado: false, legenda: true },
);

const W = 640;
const M = { t: 12, r: 8, b: 30, l: 44 };
const ativo = ref<number | null>(null);
const fmt = (v: number) => (props.formatar ?? brl)(v);

const geo = computed(() => {
  const H = props.altura;
  const n = props.rotulos.length || 1;
  const totais = props.rotulos.map((_, i) =>
    props.empilhado ? props.series.reduce((s, se) => s + (se.valores[i] ?? 0), 0) : Math.max(...props.series.map((se) => se.valores[i] ?? 0)),
  );
  const { teto, ticks } = escala(Math.max(...totais, 0));
  const slot = (W - M.l - M.r) / n;
  const grupo = Math.min(slot * 0.62, 64);
  const larg = props.empilhado ? grupo : grupo / Math.max(props.series.length, 1);
  const y = (v: number) => M.t + (1 - v / teto) * (H - M.t - M.b);
  const barras = props.rotulos.flatMap((_, i) => {
    const x0 = M.l + slot * i + (slot - grupo) / 2;
    let acumulado = 0;
    return props.series.map((se, s) => {
      const v = se.valores[i] ?? 0;
      const yTopo = props.empilhado ? y(acumulado + v) : y(v);
      const yBase = props.empilhado ? y(acumulado) : y(0);
      acumulado += v;
      return { key: `${i}-${s}`, i, x: props.empilhado ? x0 : x0 + larg * s, w: Math.max(larg - (props.empilhado ? 0 : 3), 2), y: yTopo, h: Math.max(yBase - yTopo, v > 0 ? 1.5 : 0), cor: se.cor };
    });
  });
  return { H, slot, ticks, y, barras, cx: (i: number) => M.l + slot * i + slot / 2 };
});

const passoRotulo = computed(() => Math.max(1, Math.ceil(props.rotulos.length / 12)));
</script>

<template>
  <div class="grafico">
    <svg :viewBox="`0 0 ${W} ${geo.H}`" role="img" aria-label="Gráfico de barras" @pointerleave="ativo = null">
      <g class="grade">
        <g v-for="t in geo.ticks" :key="t">
          <line :x1="M.l" :x2="W - M.r" :y1="geo.y(t)" :y2="geo.y(t)" />
          <text :x="M.l - 8" :y="geo.y(t) + 4" text-anchor="end">{{ rotuloEixo(t) }}</text>
        </g>
        <template v-for="(r, i) in rotulos" :key="r">
          <text v-if="i % passoRotulo === 0" :x="geo.cx(i)" :y="geo.H - 8" text-anchor="middle">{{ r }}</text>
        </template>
      </g>
      <rect
        v-for="(r, i) in rotulos"
        :key="`h-${r}`"
        class="alvo"
        :class="{ ativo: ativo === i }"
        :x="M.l + geo.slot * i"
        :y="M.t"
        :width="geo.slot"
        :height="geo.H - M.t - M.b"
        @pointerenter="ativo = i"
      />
      <rect v-for="b in geo.barras" :key="b.key" :x="b.x" :y="b.y" :width="b.w" :height="b.h" :fill="b.cor" rx="3" pointer-events="none" />
    </svg>
    <div v-if="ativo !== null" class="tip" :style="{ left: `${(geo.cx(ativo) / W) * 100}%` }">
      <div class="faint">{{ rotulos[ativo] }}</div>
      <div v-for="s in series" :key="s.nome" class="linha-tip">
        <span class="dot" :style="{ background: s.cor }" /> {{ s.nome }} <strong class="num">{{ fmt(s.valores[ativo] ?? 0) }}</strong>
      </div>
    </div>
    <div v-if="legenda && series.length > 1" class="legenda">
      <span v-for="s in series" :key="s.nome"><span class="dot" :style="{ background: s.cor }" /> {{ s.nome }}</span>
    </div>
  </div>
</template>

<style scoped>
.grafico { position: relative; }
svg { width: 100%; height: auto; display: block; }
.grade line { stroke: var(--line); stroke-dasharray: 3 4; }
.grade text { fill: var(--text-3); font-size: 11px; }
.alvo { fill: transparent; }
.alvo.ativo { fill: var(--text); opacity: 0.05; }
.tip {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  pointer-events: none;
  white-space: nowrap;
  z-index: 2;
}
.linha-tip { display: flex; align-items: center; gap: 8px; }
.linha-tip strong { margin-left: auto; padding-left: 12px; }
.legenda { display: flex; gap: 16px; justify-content: center; font-size: 12.5px; color: var(--text-2); margin-top: 6px; }
.legenda span { display: inline-flex; align-items: center; gap: 6px; }
</style>
