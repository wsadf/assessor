<script setup lang="ts">
import { computed } from "vue";
import { api, type Tipo } from "../../api";
import AssessorBalao from "../../components/AssessorBalao.vue";
import EstadoVazio from "../../components/EstadoVazio.vue";
import MesPicker from "../../components/MesPicker.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import { brl, mesNome } from "../../format";
import { mesSelecionado, useCarregar } from "../../estado";
import { PALETA } from "../../mesas";
import CabecalhoSub from "./CabecalhoSub.vue";

interface Categoria {
  nome: string;
  tipo: Tipo;
  totalMes: number;
  qtdMes: number;
}

const { dados, carregando, erro, recarregar } = useCarregar(
  () => api.get<{ categorias: Categoria[] }>("/categorias", { mes: mesSelecionado.value }),
  [mesSelecionado],
);

const grupos = computed(() => {
  const cats = dados.value?.categorias ?? [];
  return (["receita", "despesa"] as const).map((tipo) => {
    const itens = cats.filter((c) => c.tipo === tipo);
    return { tipo, titulo: tipo === "receita" ? "Receitas" : "Despesas", itens, max: Math.max(...itens.map((c) => c.totalMes), 1) };
  });
});
const usadas = computed(() => (dados.value?.categorias ?? []).filter((c) => c.qtdMes > 0).length);
const semUso = computed(() => (dados.value?.categorias ?? []).filter((c) => c.qtdMes === 0 && c.tipo === "despesa").map((c) => c.nome));
</script>

<template>
  <div>
    <CabecalhoSub titulo="Categorias" :subtitulo="`${dados?.categorias.length ?? 0} categorias · ${usadas} usadas em ${mesNome(mesSelecionado)}`">
      <MesPicker />
    </CabecalhoSub>

    <StatusCarga :carregando="carregando && !dados" :erro="erro" @tentar="recarregar" />
    <EstadoVazio v-if="dados && !dados.categorias.length" titulo="Nenhuma categoria ainda" texto="As categorias nascem dos lançamentos: o assessor cria uma nova quando você registra um gasto." />

    <template v-else-if="dados">
      <AssessorBalao mesa="financas" class="balao">
        Categorias certas deixam os relatórios confiáveis. Para mudar a categoria de um lançamento, abra-o em <b>Transações</b> ou diga no WhatsApp, por exemplo “o almoço era Alimentação”.
        <template v-if="semUso.length"> Sem uso neste mês: {{ semUso.slice(0, 4).join(", ") }}.</template>
      </AssessorBalao>

      <div v-for="g in grupos" :key="g.tipo" class="card grupo">
        <div class="eyebrow" :class="g.tipo === 'receita' ? 'pos' : ''">{{ g.titulo }}</div>
        <RouterLink
          v-for="(c, i) in g.itens"
          :key="c.nome"
          class="linha"
          :to="{ path: '/financas/transacoes', query: { categoria: c.nome } }"
        >
          <span class="dot" :style="{ background: g.tipo === 'receita' ? 'var(--accent)' : PALETA[i % PALETA.length] }" />
          <div class="corpo">
            <div class="topo">
              <strong>{{ c.nome }}</strong>
              <strong class="num" :class="{ pos: g.tipo === 'receita', faint: !c.qtdMes }">
                {{ c.qtdMes ? `${g.tipo === "receita" ? "+" : "-"}${brl(c.totalMes)}` : "—" }}
              </strong>
            </div>
            <div class="trilho"><span :style="{ width: `${(c.totalMes / g.max) * 100}%`, background: g.tipo === 'receita' ? 'var(--accent)' : PALETA[i % PALETA.length] }" /></div>
            <div class="faint qtd">{{ c.qtdMes }} {{ c.qtdMes === 1 ? "lançamento" : "lançamentos" }} este mês</div>
          </div>
        </RouterLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
.balao { margin-bottom: 24px; max-width: 640px; }
.grupo { padding: 22px 24px; margin-bottom: 18px; }
.grupo > .eyebrow { margin-bottom: 8px; }
.linha { display: flex; gap: 14px; align-items: flex-start; padding: 14px 0; border-bottom: 1px solid var(--line); }
.linha:last-child { border-bottom: 0; }
.linha .dot { margin-top: 7px; }
.corpo { flex: 1; min-width: 0; }
.topo { display: flex; justify-content: space-between; gap: 12px; font-size: 16px; }
.trilho { height: 4px; background: var(--surface-2); border-radius: 4px; margin-top: 8px; overflow: hidden; }
.trilho span { display: block; height: 100%; border-radius: 4px; }
.qtd { font-size: 12.5px; margin-top: 6px; }
</style>
