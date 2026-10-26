<script setup lang="ts">
import { api, type Pesquisas } from "../api";
import AssessorBalao from "../components/AssessorBalao.vue";
import BlocoMesa from "../components/BlocoMesa.vue";
import EstadoVazio from "../components/EstadoVazio.vue";
import StatusCarga from "../components/StatusCarga.vue";
import ValorGrande from "../components/ValorGrande.vue";
import { dataCurta } from "../format";
import { useCarregar } from "../estado";

const { dados: p, carregando, erro, recarregar } = useCarregar(() => api.get<Pesquisas>("/pesquisas"));
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Pesquisas</h1>
        <p>Preços, cotações, regras e avaliações pesquisados na internet, sempre com a fonte.</p>
      </div>
    </div>

    <StatusCarga :carregando="carregando && !p" :erro="erro" @tentar="recarregar" />

    <template v-if="p">
      <BlocoMesa titulo="O balcão de pesquisas">
        <ValorGrande :valor="p.pesquisas.length" :moeda="false" sufixo="pesquisas pedidas" />
        <div class="mini">
          <div><span class="eyebrow">Entregues</span><strong class="num">{{ p.entregues }}</strong></div>
          <div><span class="eyebrow">Em andamento</span><strong class="num">{{ p.andamento }}</strong></div>
          <div><span class="eyebrow">Fontes citadas</span><strong class="num">{{ p.fontes }}</strong></div>
        </div>
        <AssessorBalao mesa="pesquisas">
          <template v-if="!p.habilitado">minha mesa está montada, mas a busca na internet ainda <b>não está ligada</b> no assessor. Quando ligar, cada pesquisa pedida no WhatsApp aparece aqui com o resumo e as fontes.</template>
          <template v-else>me mande a primeira missão no WhatsApp: preço, cotação, avaliação, o que precisar.</template>
        </AssessorBalao>
        <span v-if="!p.habilitado" class="chip warning">pesquisa na internet inativa</span>
        <template #lado>
          <EstadoVazio v-if="!p.pesquisas.length" titulo="Nenhuma pesquisa ainda" texto="Exemplos do que dá para pedir: “quanto tá o dólar hoje?”, “preço médio desse notebook”, “qual o teto do MEI?”." />
          <article v-for="x in p.pesquisas" :key="x.id" class="card pesquisa">
            <div class="topo">
              <strong>{{ x.pergunta }}</strong>
              <span class="chip" :class="x.status === 'entregue' ? 'ok' : x.status === 'falhou' ? 'danger' : ''">{{ x.status }}</span>
            </div>
            <p v-if="x.resumo" class="muted">{{ x.resumo }}</p>
            <div class="fontes">
              <a v-for="fo in x.fontes" :key="fo.url" :href="fo.url" target="_blank" rel="noopener">{{ fo.titulo }}</a>
            </div>
            <span class="faint data">{{ dataCurta(x.criadaEm) }}</span>
          </article>
        </template>
      </BlocoMesa>
    </template>
  </div>
</template>

<style scoped>
.mini { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.mini > div { display: grid; gap: 4px; }
.mini strong { font-size: 20px; }
.chip { justify-self: start; }
.pesquisa { padding: 16px 18px; display: grid; gap: 8px; margin-bottom: 12px; }
.topo { display: flex; justify-content: space-between; gap: 12px; }
.fontes { display: flex; flex-wrap: wrap; gap: 10px; font-size: 13px; }
.fontes a { color: var(--mesa); }
.data { font-size: 12px; }
p { margin: 0; }
</style>
