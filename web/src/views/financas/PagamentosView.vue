<script setup lang="ts">
import { api, type Transacao } from "../../api";
import AssessorBalao from "../../components/AssessorBalao.vue";
import EstadoVazio from "../../components/EstadoVazio.vue";
import MesPicker from "../../components/MesPicker.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import { brl, dataCurta, mesNome, pagamentoNome, pct } from "../../format";
import { mesSelecionado, useCarregar } from "../../estado";
import { PALETA } from "../../mesas";
import CabecalhoSub from "./CabecalhoSub.vue";

interface Forma {
  nome: string;
  total: number;
  qtd: number;
  participacao: number;
  ultimos: Transacao[];
}

const { dados, carregando, erro, recarregar } = useCarregar(
  () => api.get<{ total: number; formas: Forma[] }>("/pagamentos", { mes: mesSelecionado.value }),
  [mesSelecionado],
);

const ehCredito = (nome: string) => /cr[eé]dito|cart[aã]o/i.test(nome);
</script>

<template>
  <div>
    <CabecalhoSub titulo="Formas de pagamento" :subtitulo="`${dados?.formas.length ?? 0} formas · ${brl(dados?.total ?? 0)} em saídas em ${mesNome(mesSelecionado)}`">
      <MesPicker />
    </CabecalhoSub>

    <StatusCarga :carregando="carregando && !dados" :erro="erro" @tentar="recarregar" />
    <EstadoVazio v-if="dados && !dados.formas.length" titulo="Nenhuma saída neste mês" />

    <template v-else-if="dados">
      <AssessorBalao mesa="financas" class="balao">
        Agrupo as saídas pela forma que você informou, como “no crédito do Nubank” ou “no pix”. Cartões de crédito aparecem com o selo de fatura.
      </AssessorBalao>

      <div class="grade">
        <article v-for="(f, i) in dados.formas" :key="f.nome" class="card forma" :style="{ '--c': PALETA[i % PALETA.length] }">
          <div class="cabeca">
            <span class="chip" :class="ehCredito(f.nome) ? 'warning' : ''">{{ ehCredito(f.nome) ? "fatura" : "à vista" }}</span>
            <span class="faint num">{{ pct(f.participacao) }} das saídas</span>
          </div>
          <h3>{{ pagamentoNome(f.nome) }}</h3>
          <div class="total num">{{ brl(f.total) }}</div>
          <div class="trilho"><span :style="{ width: `${f.participacao * 100}%` }" /></div>
          <div class="faint qtd">{{ f.qtd }} {{ f.qtd === 1 ? "lançamento" : "lançamentos" }}</div>
          <ul>
            <li v-for="t in f.ultimos" :key="t.id">
              <span>{{ t.descricao }} <span class="faint">· {{ dataCurta(t.data) }}</span></span>
              <span class="num">{{ brl(t.valor) }}</span>
            </li>
          </ul>
        </article>
      </div>
    </template>
  </div>
</template>

<style scoped>
.balao { margin-bottom: 24px; max-width: 640px; }
.grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; }
.forma {
  padding: 20px 22px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--c) 10%, var(--surface)), var(--surface) 55%);
}
.cabeca { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; }
h3 { margin: 18px 0 4px; font-size: 17px; text-transform: capitalize; }
.total { font-size: 28px; font-weight: 700; }
.trilho { height: 5px; background: var(--surface-2); border-radius: 5px; margin: 14px 0 6px; overflow: hidden; }
.trilho span { display: block; height: 100%; background: var(--c); border-radius: 5px; }
.qtd { font-size: 12.5px; }
ul { list-style: none; padding: 12px 0 0; margin: 12px 0 0; border-top: 1px solid var(--line); display: grid; gap: 8px; font-size: 13.5px; }
li { display: flex; justify-content: space-between; gap: 10px; }
li > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
