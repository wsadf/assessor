<script setup lang="ts">
import { computed, ref } from "vue";
import { api, type Contraparte } from "../../api";
import AssessorBalao from "../../components/AssessorBalao.vue";
import EstadoVazio from "../../components/EstadoVazio.vue";
import ListaBarras from "../../components/graficos/ListaBarras.vue";
import MesPicker from "../../components/MesPicker.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import { brl, dataCurta, mesNome } from "../../format";
import { mesSelecionado, useCarregar } from "../../estado";
import { PALETA } from "../../mesas";
import CabecalhoSub from "./CabecalhoSub.vue";

const { dados, carregando, erro, recarregar } = useCarregar(
  () => api.get<{ contrapartes: Contraparte[]; semContraparte: number }>("/contrapartes", { mes: mesSelecionado.value }),
  [mesSelecionado],
);

const busca = ref("");
const lista = computed(() => (dados.value?.contrapartes ?? []).filter((c) => !busca.value || c.nome.toLowerCase().includes(busca.value.toLowerCase())));
const ranking = computed(() =>
  (dados.value?.contrapartes ?? [])
    .filter((c) => c.enviado > 0)
    .sort((a, b) => b.enviado - a.enviado)
    .slice(0, 6)
    .map((c, i) => ({ nome: c.nome, valor: c.enviado, cor: PALETA[i % PALETA.length], detalhe: `${c.qtd} lançamentos${c.pix ? ` · ${c.pix} Pix` : ""}` })),
);
const pixMaior = computed(() => [...(dados.value?.contrapartes ?? [])].filter((c) => c.pix).sort((a, b) => b.enviado - a.enviado)[0]);
</script>

<template>
  <div>
    <CabecalhoSub titulo="Pessoas e lojas" :subtitulo="`${dados?.contrapartes.length ?? 0} com movimento em ${mesNome(mesSelecionado)}`">
      <MesPicker />
    </CabecalhoSub>

    <StatusCarga :carregando="carregando && !dados" :erro="erro" @tentar="recarregar" />

    <EstadoVazio
      v-if="dados && !dados.contrapartes.length"
      titulo="Ninguém registrado neste mês"
      texto="Diga quem recebeu ou pagou ao lançar, como “mandei 50 de Pix pro João” ou “almoço 45 no Restaurante Sabor”, e o assessor guarda aqui."
    />

    <template v-else-if="dados">
      <div class="topo">
        <AssessorBalao mesa="financas">
          <template v-if="pixMaior">quem mais recebeu Pix seu em {{ mesNome(mesSelecionado).split(" ")[0] }} foi <b>{{ pixMaior.nome }}</b>: {{ brl(pixMaior.enviado) }}.</template>
          <template v-else>aqui fica para quem foi e de quem veio cada real.</template>
          No WhatsApp é só perguntar: “quanto mandei pro João esse mês?”.
          <template v-if="dados.semContraparte"> {{ dados.semContraparte }} lançamentos do mês estão sem pessoa ou loja.</template>
        </AssessorBalao>
        <div class="card ranking">
          <div class="eyebrow">Para onde mais foi dinheiro</div>
          <ListaBarras :itens="ranking" numerar />
        </div>
      </div>

      <input v-model="busca" class="input busca" type="search" placeholder="Buscar pessoa ou loja" />

      <div class="grade">
        <article v-for="c in lista" :key="c.nome" class="card pessoa">
          <header>
            <span class="inicial">{{ c.nome[0] }}</span>
            <div class="flex1">
              <strong>{{ c.nome }}</strong>
              <div class="faint meta">{{ c.qtd }} {{ c.qtd === 1 ? "lançamento" : "lançamentos" }} · último {{ dataCurta(c.ultima) }}</div>
            </div>
            <span v-if="c.pix" class="chip ok">{{ c.pix }} Pix</span>
          </header>
          <div class="valores">
            <div v-if="c.enviado"><span class="eyebrow">Enviado</span><strong class="num">{{ brl(c.enviado) }}</strong></div>
            <div v-if="c.recebido"><span class="eyebrow">Recebido</span><strong class="num pos">{{ brl(c.recebido) }}</strong></div>
          </div>
          <ul>
            <li v-for="t in c.transacoes" :key="t.id">
              <span>{{ t.descricao }} <span class="faint">· {{ dataCurta(t.data) }}</span></span>
              <span class="num" :class="{ pos: t.tipo === 'receita' }">{{ t.tipo === "receita" ? "+" : "-" }}{{ brl(t.valor) }}</span>
            </li>
          </ul>
          <RouterLink class="ver" :to="{ path: '/financas/transacoes', query: { contraparte: c.nome } }">Ver lançamentos →</RouterLink>
        </article>
      </div>
    </template>
  </div>
</template>

<style scoped>
.topo { display: grid; grid-template-columns: 1fr 1.1fr; gap: 24px; align-items: start; margin-bottom: 24px; }
.ranking { padding: 18px 20px; display: grid; gap: 12px; }
.busca { width: 100%; max-width: 360px; margin-bottom: 16px; }
.grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.pessoa { padding: 18px 20px; display: grid; gap: 12px; align-content: start; }
header { display: flex; gap: 12px; align-items: center; }
.inicial { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; background: var(--accent-soft); color: var(--mesa); flex: none; }
.flex1 { flex: 1; min-width: 0; }
.flex1 strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { font-size: 12.5px; }
.valores { display: flex; gap: 24px; }
.valores > div { display: grid; gap: 2px; }
.valores strong { font-size: 20px; }
ul { list-style: none; margin: 0; padding: 10px 0 0; border-top: 1px solid var(--line); display: grid; gap: 7px; font-size: 13.5px; }
li { display: flex; justify-content: space-between; gap: 10px; }
li > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ver { color: var(--mesa); font-size: 14px; font-weight: 500; }
@media (max-width: 900px) {
  .topo { grid-template-columns: 1fr; }
}
</style>
