<script setup lang="ts">
import { computed, ref } from "vue";
import { brl } from "../../format";
import { escala, rotuloEixo } from "./escala";

const props = withDefaults(
  defineProps<{ pontos: { x: string; y: number }[]; cor?: string; altura?: number; marcarExtremos?: boolean; dica?: string }>(),
  { cor: "var(--mesa)", altura: 240, marcarExtremos: true },
);

const W = 640;
const M = { t: 16, r: 12, b: 28, l: 44 };
const ativo = ref<number | null>(null);

const geo = computed(() => {
  const H = props.altura;
  const ys = props.pontos.map((p) => p.y);
  const min = Math.min(0, ...ys);
  const { teto, ticks } = escala(Math.max(...ys, 1) - min);
  const base = min < 0 ? -escala(-min).teto : 0;
  const top = base + teto;
  const x = (i: number) => M.l + (props.pontos.length <= 1 ? 0 : (i / (props.pontos.length - 1)) * (W - M.l - M.r));
  const y = (v: number) => M.t + (1 - (v - base) / (top - base)) * (H - M.t - M.b);
  const linha = props.pontos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(" ");
  const area = props.pontos.length ? `${linha} L${x(props.pontos.length - 1)} ${y(base)} L${x(0)} ${y(base)} Z` : "";
  const iMax = ys.indexOf(Math.max(...ys));
  const iMin = ys.indexOf(Math.min(...ys));
  return { H, x, y, linha, area, ticks: ticks.map((t) => t + base), iMax, iMin };
});

function mover(ev: PointerEvent) {
  const svg = ev.currentTarget as SVGSVGElement;
  const r = svg.getBoundingClientRect();
  const px = ((ev.clientX - r.left) / r.width) * W;
  const n = props.pontos.length;
  if (!n) return;
  const i = Math.round(((px - M.l) / (W - M.l - M.r)) * (n - 1));
  ativo.value = Math.min(n - 1, Math.max(0, i));
}

const rotulosX = computed(() => {
  const n = props.pontos.length;
  const passo = Math.max(1, Math.ceil(n / 6));
  return props.pontos.map((p, i) => ({ i, x: p.x })).filter(({ i }) => i % passo === 0 || i === n - 1);
});
</script>

<template>
  <div class="grafico">
    <svg :viewBox="`0 0 ${W} ${geo.H}`" role="img" aria-label="Gráfico de linha" @pointermove="mover" @pointerleave="ativo = null">
      <g class="grade">
        <g v-for="t in geo.ticks" :key="t">
          <line :x1="M.l" :x2="W - M.r" :y1="geo.y(t)" :y2="geo.y(t)" />
          <text :x="M.l - 8" :y="geo.y(t) + 4" text-anchor="end">{{ rotuloEixo(t) }}</text>
        </g>
        <text v-for="r in rotulosX" :key="r.i" :x="geo.x(r.i)" :y="geo.H - 6" text-anchor="middle">{{ r.x }}</text>
      </g>
      <path :d="geo.area" :fill="cor" opacity="0.12" />
      <path :d="geo.linha" :stroke="cor" stroke-width="2.2" fill="none" stroke-linejoin="round" stroke-linecap="round" />
      <template v-if="marcarExtremos && pontos.length > 2">
        <circle :cx="geo.x(geo.iMax)" :cy="geo.y(pontos[geo.iMax].y)" r="4" :fill="cor" />
        <text class="marca" :x="geo.x(geo.iMax)" :y="geo.y(pontos[geo.iMax].y) - 10" text-anchor="middle">pico</text>
        <circle :cx="geo.x(geo.iMin)" :cy="geo.y(pontos[geo.iMin].y)" r="4" :fill="cor" />
        <text class="marca" :x="geo.x(geo.iMin)" :y="geo.y(pontos[geo.iMin].y) + 18" text-anchor="middle">vale</text>
      </template>
      <g v-if="ativo !== null && pontos[ativo]">
        <line class="cursor" :x1="geo.x(ativo)" :x2="geo.x(ativo)" :y1="M.t" :y2="geo.H - M.b" />
        <circle :cx="geo.x(ativo)" :cy="geo.y(pontos[ativo].y)" r="5" :fill="cor" stroke="var(--bg)" stroke-width="2" />
      </g>
    </svg>
    <div v-if="ativo !== null && pontos[ativo]" class="tip" :style="{ left: `${(geo.x(ativo) / W) * 100}%` }">
      <div class="faint">{{ pontos[ativo].x }}</div>
      <strong class="num">{{ brl(pontos[ativo].y) }}</strong>
    </div>
    <div v-if="dica" class="eyebrow dica">{{ dica }}</div>
  </div>
</template>

<style scoped>
.grafico { position: relative; }
svg { width: 100%; height: auto; display: block; touch-action: none; }
.grade line { stroke: var(--line); stroke-dasharray: 3 4; }
.grade text, .marca { fill: var(--text-3); font-size: 11px; }
.marca { font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; font-size: 10px; }
.cursor { stroke: var(--text-3); stroke-dasharray: 3 3; }
.tip {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 13px;
  pointer-events: none;
  white-space: nowrap;
}
.dica { margin-top: 10px; font-size: 10.5px; }
</style>
