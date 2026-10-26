<script setup lang="ts">
import { computed } from "vue";
import { api, type Fiscal } from "../api";
import AssessorBalao from "../components/AssessorBalao.vue";
import BlocoMesa from "../components/BlocoMesa.vue";
import EstadoVazio from "../components/EstadoVazio.vue";
import GraficoBarras from "../components/graficos/GraficoBarras.vue";
import MesPicker from "../components/MesPicker.vue";
import StatusCarga from "../components/StatusCarga.vue";
import ValorGrande from "../components/ValorGrande.vue";
import { brl, dataCurta, mesCurto, mesNome } from "../format";
import { mesSelecionado, useCarregar } from "../estado";

const { dados: f, carregando, erro, recarregar } = useCarregar(() => api.get<Fiscal>("/fiscal", { mes: mesSelecionado.value }), [mesSelecionado]);

const STATUS_NOTAS = [
  { nome: "Autorizadas", cor: "var(--accent)" },
  { nome: "Processando", cor: "var(--info)" },
  { nome: "Com erro", cor: "var(--danger)" },
  { nome: "Canceladas", cor: "var(--text-3)" },
];
const serie = computed(() => ({
  rotulos: (f.value?.meses ?? []).map((m) => mesCurto(m.mes)),
  series: [{ nome: "Receitas", cor: "#22b8cf", valores: (f.value?.meses ?? []).map((m) => m.receitas) }],
}));
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Fiscal</h1>
        <p>Faturamento e notas fiscais de serviço.</p>
      </div>
      <span class="spacer" />
      <MesPicker />
    </div>

    <StatusCarga :carregando="carregando && !f" :erro="erro" @tentar="recarregar" />

    <template v-if="f">
      <BlocoMesa titulo="Faturamento">
        <ValorGrande :valor="f.faturamentoBase" />
        <p class="muted">em receitas registradas em {{ mesNome(f.mes) }}, a base para as notas fiscais.</p>
        <div class="mini">
          <div v-for="s in STATUS_NOTAS" :key="s.nome"><span class="eyebrow">{{ s.nome }}</span><strong class="num">0</strong></div>
        </div>
        <AssessorBalao mesa="fiscal">
          a emissão de notas ainda <b>não está ligada</b> neste assessor. Enquanto isso, acompanho as suas receitas para quando ela entrar.
        </AssessorBalao>
        <span class="chip warning">emissão de NFS-e inativa</span>
        <template #lado>
          <div class="status-notas">
            <div v-for="s in STATUS_NOTAS" :key="s.nome" class="linha-st">
              <span>{{ s.nome }}</span>
              <span class="dot" :style="{ background: s.cor }" />
              <strong class="num">0</strong>
            </div>
          </div>
          <div class="eyebrow faint rodape">A emissão depende de um emissor de NFS-e (PlugNotas, Focus NFe ou eNotas), previsto na fase 4 do plano</div>
        </template>
      </BlocoMesa>

      <BlocoMesa titulo="Receitas que podem virar nota">
        <AssessorBalao mesa="fiscal">
          <template v-if="f.porCategoria.length">por origem: <span v-for="(c, i) in f.porCategoria" :key="c.nome"><b>{{ c.nome }}</b> {{ brl(c.total) }}{{ i < f.porCategoria.length - 1 ? ", " : "." }}</span></template>
          <template v-else>nenhuma receita registrada neste mês.</template>
        </AssessorBalao>
        <template #lado>
          <EstadoVazio v-if="!f.receitas.length" titulo="Sem receitas no mês" texto="Registre uma entrada, como “recebi 800 do freela”." />
          <div v-for="r in f.receitas" :key="r.id" class="list-row">
            <span class="dot" style="background: var(--mesa)" />
            <div class="flex1">
              <div class="titulo">{{ r.descricao }}</div>
              <div class="eyebrow meta">{{ r.categoria }} · {{ dataCurta(r.data) }}</div>
            </div>
            <strong class="num pos">+{{ brl(r.valor) }}</strong>
          </div>
        </template>
      </BlocoMesa>

      <BlocoMesa titulo="Faturamento nos últimos 6 meses">
        <AssessorBalao mesa="fiscal">o MEI tem teto anual de faturamento; acompanhar o mês a mês evita surpresa no fim do ano.</AssessorBalao>
        <template #lado>
          <GraficoBarras :rotulos="serie.rotulos" :series="serie.series" :altura="220" :legenda="false" />
        </template>
      </BlocoMesa>
    </template>
  </div>
</template>

<style scoped>
p { margin: 0; }
.mini { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.mini > div { display: grid; gap: 4px; }
.mini strong { font-size: 20px; }
.chip { justify-self: start; }
.status-notas { display: grid; gap: 4px; padding-top: 16px; }
.linha-st { display: grid; grid-template-columns: 1fr auto 40px; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 16px; font-weight: 600; }
.linha-st strong { text-align: right; }
.rodape { margin-top: 20px; font-size: 10.5px; line-height: 1.6; }
.flex1 { flex: 1; min-width: 0; }
.titulo { font-weight: 600; }
.meta { font-size: 10.5px; margin-top: 2px; }
@media (max-width: 600px) {
  .mini { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
