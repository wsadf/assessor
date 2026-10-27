<script setup lang="ts">
import { computed } from "vue";
import { api, type Financas } from "../../api";
import AssessorBalao from "../../components/AssessorBalao.vue";
import BlocoMesa from "../../components/BlocoMesa.vue";
import EstadoVazio from "../../components/EstadoVazio.vue";
import GraficoLinha from "../../components/graficos/GraficoLinha.vue";
import GraficoRosca from "../../components/graficos/GraficoRosca.vue";
import ListaBarras from "../../components/graficos/ListaBarras.vue";
import MesPicker from "../../components/MesPicker.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import ValorGrande from "../../components/ValorGrande.vue";
import { brl, brlSinal, dataCurta, mesCurto, mesNome, pagamentoNome, pct } from "../../format";
import GraficoBarras from "../../components/graficos/GraficoBarras.vue";
import { HOJE, mesSelecionado, pode, useCarregar } from "../../estado";
import { PALETA } from "../../mesas";

const { dados: f, carregando, erro, recarregar } = useCarregar(() => api.get<Financas>("/financas", { mes: mesSelecionado.value }), [mesSelecionado]);
// Perfil so gastos: a API nao manda receitas, saldo nem renda.
const veReceitas = computed(() => pode("receitas") && f.value?.saldoAtual !== undefined);

const ehAtual = computed(() => mesSelecionado.value === HOJE.slice(0, 7));
const vazio = computed(() => f.value && f.value.pulso.lancamentos === 0);
const pontos = computed(() => (f.value?.diario ?? []).map((d) => ({ x: String(d.dia), y: d.saldo })));

const topCategoria = computed(() => f.value?.porCategoria[0]);
const fatiaTop = computed(() => (f.value && topCategoria.value && f.value.despesas ? topCategoria.value.total / f.value.despesas : 0));
const rosca = computed(() => {
  const cats = f.value?.porCategoria ?? [];
  const principais = cats.slice(0, 6).map((c, i) => ({ nome: c.nome, valor: c.total, cor: PALETA[i] }));
  const resto = cats.slice(6).reduce((s, c) => s + c.total, 0);
  return resto > 0 ? [...principais, { nome: "Outras", valor: resto, cor: PALETA[7] }] : principais;
});

const maioresSaidas = computed(() =>
  (f.value?.maioresSaidas ?? []).map((t, i) => ({ nome: t.descricao, valor: t.valor, cor: PALETA[i % PALETA.length], detalhe: `${t.categoria} · ${dataCurta(t.data)}` })),
);

const rendaSerie = computed(() => ({
  rotulos: (f.value?.renda?.meses ?? []).map((m) => mesCurto(m.mes)),
  series: [{ nome: "Entradas", cor: "#10b981", valores: (f.value?.renda?.meses ?? []).map((m) => m.receitas) }],
}));
const estabilidade = computed(() => {
  const v = f.value?.renda?.variacao ?? 0;
  if (!f.value?.renda?.media) return { rotulo: "sem entradas registradas", classe: "" };
  if (v > 0.25) return { rotulo: "renda variável", classe: "warning" };
  return { rotulo: "renda estável", classe: "ok" };
});
const comprometidoSerie = computed(() => ({
  rotulos: (f.value?.comprometido ?? []).map((m) => mesCurto(m.mes)),
  series: [{ nome: "Parcelas", cor: "#ee7aa8", valores: (f.value?.comprometido ?? []).map((m) => m.valor) }],
}));
const totalComprometido = computed(() => (f.value?.comprometido ?? []).reduce((s, m) => s + m.valor, 0));

const variacaoMes = computed(() => {
  if (!f.value || !f.value.mesAnterior.despesas) return null;
  return f.value.despesas / f.value.mesAnterior.despesas - 1;
});
const aindaVem = computed(() => (f.value?.projecao ? Math.max(f.value.projecao.despesas - f.value.despesas, 0) : 0));
const pagamentos = computed(() => {
  const lista = f.value?.pulso.porPagamento ?? [];
  const total = lista.reduce((s, p) => s + p.total, 0) || 1;
  return lista.map((p, i) => ({ ...p, frac: p.total / total, cor: PALETA[i % PALETA.length] }));
});
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Finanças</h1>
        <p>{{ mesNome(mesSelecionado) }}, com o que você registrou pelo WhatsApp e por aqui.</p>
      </div>
      <span class="spacer" />
      <MesPicker />
    </div>

    <StatusCarga :carregando="carregando && !f" :erro="erro" @tentar="recarregar" />

    <EstadoVazio
      v-if="vazio"
      titulo="Nada registrado neste mês"
      texto="Mande um gasto pelo WhatsApp, como “gastei 62 na farmácia”, ou lance direto em Transações."
    >
      <RouterLink class="btn primary" to="/financas/transacoes">Ir para Transações</RouterLink>
    </EstadoVazio>

    <template v-else-if="f">
      <BlocoMesa v-if="veReceitas" titulo="Saldo do período">
        <ValorGrande :valor="f.saldoAtual ?? 0" />
        <div class="mini">
          <div><span class="eyebrow">Recebido</span><strong class="num pos">{{ brl(f.receitas ?? 0) }}</strong></div>
          <div><span class="eyebrow">Pago</span><strong class="num">{{ brl(f.despesas) }}</strong></div>
          <div><span class="eyebrow">Início do mês</span><strong class="num">{{ brl(f.inicioDoMes ?? 0) }}</strong></div>
        </div>
        <AssessorBalao mesa="financas">
          seu saldo está em <b>{{ brl(f.saldoAtual ?? 0) }}</b>
          <template v-if="topCategoria">, com <b>{{ topCategoria.nome }}</b> puxando os gastos</template>.
        </AssessorBalao>
        <template #lado>
          <GraficoLinha :pontos="pontos" dica="Passe o mouse para ler o dia" />
          <div class="ultimos">
            <div class="eyebrow">Últimos lançamentos</div>
            <div v-for="t in f.ultimos" :key="t.id" class="list-row">
              <span class="dot" :style="{ background: t.tipo === 'receita' ? 'var(--accent)' : 'var(--violet)' }" />
              <div class="flex1">
                <div class="tx-desc">{{ t.descricao }}</div>
                <div class="eyebrow tx-meta">{{ t.categoria }} · {{ dataCurta(t.data) }}</div>
              </div>
              <strong class="num" :class="t.tipo === 'receita' ? 'pos' : ''">{{ brlSinal(t.valor, t.tipo) }}</strong>
            </div>
            <RouterLink class="ver" to="/financas/transacoes">Ver todas →</RouterLink>
          </div>
        </template>
      </BlocoMesa>

      <BlocoMesa titulo="Saídas">
        <ValorGrande :valor="f.despesas" />
        <p class="muted">em {{ f.pulso.lancamentos }} lançamentos no mês.</p>
        <AssessorBalao v-if="topCategoria" mesa="financas">
          <b>{{ topCategoria.nome }}</b> concentra <b>{{ pct(fatiaTop) }}</b> dos seus gastos.
        </AssessorBalao>
        <RouterLink class="btn primary" to="/financas/analises">Explorar →</RouterLink>
        <template #lado>
          <ListaBarras :itens="maioresSaidas" />
          <div class="eyebrow faint rodape">As maiores saídas do mês · a régua compara cada uma com a maior</div>
        </template>
      </BlocoMesa>

      <BlocoMesa v-if="f.projecao" :titulo="ehAtual ? 'O fim do mês, projetado' : 'Como o mês fechou'">
        <ValorGrande :valor="veReceitas ? (f.projecao.saldoFinal ?? 0) : f.projecao.despesas" />
        <p class="muted">
          <template v-if="!veReceitas">em gastos no mês, no ritmo de <b>{{ brl(f.projecao.ritmoDiario) }}</b> por dia.</template>
          <template v-else-if="ehAtual">o saldo se os gastos seguirem no ritmo de <b>{{ brl(f.projecao.ritmoDiario) }}</b> por dia.</template>
          <template v-else>saldo no último dia do mês.</template>
        </p>
        <div class="mini">
          <div><span class="eyebrow">Realizado</span><strong class="num">{{ brl(f.despesas) }}</strong></div>
          <div><span class="eyebrow">Projetado</span><strong class="num">{{ brl(f.projecao.despesas) }}</strong></div>
          <div v-if="ehAtual"><span class="eyebrow">Ainda por vir</span><strong class="num">{{ brl(aindaVem) }}</strong></div>
        </div>
        <AssessorBalao mesa="financas">
          <template v-if="!veReceitas">no ritmo de agora, os gastos de {{ mesNome(f.mes).split(" ")[0] }} chegam a <b>{{ brl(f.projecao.despesas) }}</b>.</template>
          <template v-else-if="ehAtual">no ritmo de agora, você fecha {{ mesNome(f.mes).split(" ")[0] }} com <b>{{ brl(f.projecao.saldoFinal ?? 0) }}</b>.</template>
          <template v-else>você fechou o mês com <b>{{ brl(f.projecao.saldoFinal ?? 0) }}</b>.</template>
        </AssessorBalao>
        <template #lado>
          <div class="barras-proj">
            <div class="barra-linha">
              <div class="trilho"><span class="cheio" :style="{ width: `${Math.min(f.despesas / Math.max(f.projecao.despesas, 1), 1) * 100}%` }" /></div>
              <span class="eyebrow">Realizado {{ brl(f.despesas) }}</span>
            </div>
            <div class="barra-linha">
              <div class="trilho tracejado" />
              <span class="eyebrow">Projetado {{ brl(f.projecao.despesas) }}</span>
            </div>
          </div>
          <div class="mini dois">
            <div v-if="veReceitas"><span class="eyebrow">Recebido no mês</span><strong class="num pos">{{ brl(f.receitas ?? 0) }}</strong></div>
            <div>
              <span class="eyebrow">Mês anterior</span>
              <strong class="num">{{ brl(f.mesAnterior.despesas) }}</strong>
              <span v-if="variacaoMes !== null" class="chip" :class="variacaoMes > 0 ? 'danger' : 'ok'">
                {{ variacaoMes > 0 ? "+" : "" }}{{ pct(variacaoMes) }}
              </span>
            </div>
          </div>
          <div class="eyebrow faint rodape">A barra cheia é o realizado · a tracejada, onde o mês termina no ritmo atual</div>
        </template>
      </BlocoMesa>

      <BlocoMesa titulo="Para onde foi o dinheiro">
        <AssessorBalao mesa="financas">
          {{ f.porCategoria.length }} categorias com gasto em {{ mesNome(f.mes) }}. Toque numa fatia para ver o valor.
        </AssessorBalao>
        <RouterLink class="btn" to="/financas/categorias">Ver categorias →</RouterLink>
        <template #lado>
          <GraficoRosca :itens="rosca" rotulo-centro="saídas" />
        </template>
      </BlocoMesa>

      <BlocoMesa v-if="f.renda" titulo="Quanto você ganha por mês">
        <ValorGrande :valor="f.renda.media" />
        <p class="muted">de entrada média nos meses com receita, entre <b>{{ brl(f.renda.menor) }}</b> e <b>{{ brl(f.renda.maior) }}</b>.</p>
        <span class="chip" :class="estabilidade.classe">{{ estabilidade.rotulo }}</span>
        <AssessorBalao mesa="financas">
          <template v-if="f.renda.variacao > 0.25">sua renda oscila bastante. Planeje o mês pelo <b>menor valor</b> ({{ brl(f.renda.menor) }}), não pela média.</template>
          <template v-else-if="f.renda.media">sua renda está estável: a média de {{ brl(f.renda.media) }} é uma boa base para o orçamento.</template>
          <template v-else>registre suas entradas, como “recebi 800 do freela”, para eu calcular quanto você ganha por mês.</template>
        </AssessorBalao>
        <template #lado>
          <GraficoBarras :rotulos="rendaSerie.rotulos" :series="rendaSerie.series" :altura="220" :legenda="false" />
          <div class="eyebrow faint rodape">Entradas dos últimos 6 meses · a média considera só os meses com receita</div>
        </template>
      </BlocoMesa>

      <BlocoMesa titulo="Já comprometido com parcelas">
        <ValorGrande :valor="totalComprometido" />
        <p class="muted">em parcelas já lançadas para os próximos 6 meses.</p>
        <AssessorBalao mesa="financas">
          <template v-if="totalComprometido">o próximo mês já começa com <b>{{ brl(f.comprometido[0]?.valor ?? 0) }}</b> em parcelas. No WhatsApp: “quanto falta pagar do carro?”.</template>
          <template v-else>nenhuma parcela futura. Para lançar uma compra parcelada, diga “comprei a TV em 10x de 150”.</template>
        </AssessorBalao>
        <template #lado>
          <GraficoBarras :rotulos="comprometidoSerie.rotulos" :series="comprometidoSerie.series" :altura="220" :legenda="false" />
        </template>
      </BlocoMesa>

      <BlocoMesa titulo="O pulso do mês">
        <ValorGrande :valor="f.pulso.lancamentos" :moeda="false" sufixo="lançamentos" />
        <AssessorBalao mesa="financas">
          <b>{{ f.pulso.lancamentos }} lançamentos</b>, {{ brl(f.pulso.ticketMedio) }} por saída em média
          <template v-if="pagamentos[0]"> e <b>{{ pct(pagamentos[0].frac) }}</b> no {{ pagamentoNome(pagamentos[0].nome) }}</template>.
        </AssessorBalao>
        <template #lado>
          <div class="pilha">
            <span v-for="p in pagamentos" :key="p.nome" :style="{ width: `${p.frac * 100}%`, background: p.cor }" :title="pagamentoNome(p.nome)" />
          </div>
          <div class="legenda-pilha">
            <span v-for="p in pagamentos" :key="p.nome"><span class="dot" :style="{ background: p.cor }" /> {{ pagamentoNome(p.nome) }} {{ pct(p.frac) }}</span>
          </div>
          <div class="mini tres">
            <div><span class="eyebrow">Ticket médio de saída</span><strong class="num">{{ brl(f.pulso.ticketMedio) }}</strong></div>
            <div v-if="f.pulso.diaMaisMovimentado">
              <span class="eyebrow">Dia mais movimentado</span>
              <strong class="num">{{ dataCurta(f.pulso.diaMaisMovimentado.data) }} · {{ f.pulso.diaMaisMovimentado.qtd }} lanç.</strong>
            </div>
            <div><span class="eyebrow">Formas de pagamento</span><strong class="num">{{ pagamentos.length }}</strong></div>
          </div>
          <RouterLink class="ver" to="/financas/pagamentos">Ver formas de pagamento →</RouterLink>
        </template>
      </BlocoMesa>
    </template>
  </div>
</template>

<style scoped>
.mini { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.mini.dois { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 24px; }
.mini.tres { margin-top: 24px; }
.mini > div { display: grid; gap: 4px; align-content: start; }
.mini strong { font-size: 18px; }
.mini .chip { justify-self: start; }
.muted b { color: var(--text); }
.esq-chip, :deep(.esq) > .chip { justify-self: start; }
p { margin: 0; }
.flex1 { flex: 1; min-width: 0; }
.ultimos { margin-top: 24px; }
.ultimos > .eyebrow { margin-bottom: 4px; }
.tx-desc { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tx-meta { font-size: 10.5px; margin-top: 2px; }
.ver { display: inline-block; margin-top: 12px; color: var(--mesa); font-size: 14px; font-weight: 500; }
.rodape { margin-top: 20px; font-size: 10.5px; }
.barras-proj { display: grid; gap: 14px; padding-top: 40px; }
.barra-linha { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center; }
.trilho { height: 12px; border-radius: 12px; background: var(--surface-2); overflow: hidden; }
.trilho .cheio { display: block; height: 100%; background: var(--mesa); border-radius: 12px; }
.tracejado { background: transparent; border: 1.5px dashed var(--text-3); }
.pilha { display: flex; height: 14px; border-radius: 14px; overflow: hidden; gap: 3px; margin-top: 12px; }
.pilha span { display: block; height: 100%; min-width: 4px; }
.legenda-pilha { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 12.5px; color: var(--text-2); }
.legenda-pilha > span { display: inline-flex; align-items: center; gap: 6px; }
@media (max-width: 600px) {
  .mini, .mini.tres { grid-template-columns: 1fr 1fr; }
}
</style>
