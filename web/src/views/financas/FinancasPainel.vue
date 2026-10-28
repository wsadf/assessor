<script setup lang="ts">
import { computed } from "vue";
import { api, type Financas } from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import AssessorBalao from "../../components/AssessorBalao.vue";
import EstadoVazio from "../../components/EstadoVazio.vue";
import GraficoBarras from "../../components/graficos/GraficoBarras.vue";
import GraficoLinha from "../../components/graficos/GraficoLinha.vue";
import GraficoRosca from "../../components/graficos/GraficoRosca.vue";
import ListaBarras from "../../components/graficos/ListaBarras.vue";
import MesPicker from "../../components/MesPicker.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import { brl, brlSinal, dataCurta, mesCurto, mesNome, pagamentoNome, pct } from "../../format";
import { eu, HOJE, mesSelecionado, pode, useCarregar } from "../../estado";
import { PALETA } from "../../mesas";

const { dados: f, carregando, erro, recarregar } = useCarregar(() => api.get<Financas>("/financas", { mes: mesSelecionado.value }), [mesSelecionado]);
// Perfil so gastos: a API nao manda receitas, saldo nem renda.
const veReceitas = computed(() => pode("receitas") && f.value?.saldoAtual !== undefined);

const ehAtual = computed(() => mesSelecionado.value === HOJE.slice(0, 7));
const vazio = computed(() => f.value && f.value.pulso.lancamentos === 0);
const pontos = computed(() => (f.value?.diario ?? []).map((d) => ({ x: String(d.dia), y: d.saldo })));

const saudacao = computed(() => {
  const h = new Date().getHours();
  const oi = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const nome = eu.value?.nome?.split(" ")[0];
  return nome ? `${oi}, ${nome}.` : `${oi}.`;
});
const nomeDoMes = computed(() => mesNome(mesSelecionado.value).split(" ")[0]);

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
  series: [{ nome: "Entradas", cor: "var(--success)", valores: (f.value?.renda?.meses ?? []).map((m) => m.receitas) }],
}));
const estabilidade = computed(() => {
  const v = f.value?.renda?.variacao ?? 0;
  if (!f.value?.renda?.media) return { rotulo: "sem entradas registradas", classe: "" };
  if (v > 0.25) return { rotulo: "renda variável", classe: "warning" };
  return { rotulo: "renda estável", classe: "ok" };
});
const comprometidoSerie = computed(() => ({
  rotulos: (f.value?.comprometido ?? []).map((m) => mesCurto(m.mes)),
  series: [{ nome: "Parcelas", cor: "var(--accent)", valores: (f.value?.comprometido ?? []).map((m) => m.valor) }],
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
const totalContas = computed(() => (f.value?.contasProximas ?? []).reduce((s, c) => s + (c.valor ?? 0), 0));
</script>

<template>
  <div>
    <header class="page-head">
      <div>
        <span class="eyebrow">Finanças · {{ mesNome(mesSelecionado) }}</span>
        <h1>{{ saudacao }}</h1>
        <p>Tudo o que você registrou pelo WhatsApp e por aqui, num lugar só.</p>
      </div>
      <span class="spacer" />
      <MesPicker />
    </header>

    <StatusCarga :carregando="carregando && !f" :erro="erro" @tentar="recarregar" />

    <EstadoVazio
      v-if="vazio"
      titulo="Nada registrado neste mês"
      texto="Mande um gasto pelo WhatsApp, como “gastei 62 na farmácia”, ou lance direto em Transações."
    >
      <RouterLink class="btn primary" to="/financas/transacoes">Ir para Transações</RouterLink>
    </EstadoVazio>

    <template v-else-if="f">
      <AssessorBalao mesa="financas" class="resumo">
        <template v-if="veReceitas">
          Seu saldo está em <b>{{ brl(f.saldoAtual ?? 0) }}</b><template v-if="topCategoria">, com <b>{{ topCategoria.nome }}</b> puxando os gastos</template>.
          <template v-if="f.projecao && ehAtual"> No ritmo de agora, você fecha {{ nomeDoMes }} com <b>{{ brl(f.projecao.saldoFinal ?? 0) }}</b>.</template>
        </template>
        <template v-else>
          Você gastou <b>{{ brl(f.despesas) }}</b> em {{ f.pulso.lancamentos }} lançamentos<template v-if="topCategoria">, e <b>{{ topCategoria.nome }}</b> concentra {{ pct(fatiaTop) }}</template>.
        </template>
      </AssessorBalao>

      <section class="kpis">
        <article v-if="veReceitas" class="vidro kpi destaque">
          <span class="rotulo">Saldo agora</span>
          <strong class="num">{{ brl(f.saldoAtual ?? 0) }}</strong>
          <small>começou o mês com {{ brl(f.inicioDoMes ?? 0) }}</small>
        </article>
        <article v-if="veReceitas" class="vidro kpi">
          <span class="rotulo">Recebido</span>
          <strong class="num pos">{{ brl(f.receitas ?? 0) }}</strong>
          <small>entradas no mês</small>
        </article>
        <article class="vidro kpi">
          <span class="rotulo">Pago</span>
          <strong class="num">{{ brl(f.despesas) }}</strong>
          <small>
            <span v-if="variacaoMes !== null" class="chip" :class="variacaoMes > 0 ? 'danger' : 'ok'">{{ variacaoMes > 0 ? "+" : "" }}{{ pct(variacaoMes) }}</span>
            vs. mês anterior
          </small>
        </article>
        <article v-if="f.projecao" class="vidro kpi">
          <span class="rotulo">{{ ehAtual ? "Fim do mês, projetado" : "Como o mês fechou" }}</span>
          <strong class="num">{{ brl(veReceitas ? (f.projecao.saldoFinal ?? 0) : f.projecao.despesas) }}</strong>
          <small>{{ veReceitas ? "de saldo" : "em gastos" }} · {{ brl(f.projecao.ritmoDiario) }} por dia</small>
        </article>
        <article v-if="!veReceitas" class="vidro kpi">
          <span class="rotulo">Lançamentos</span>
          <strong class="num">{{ f.pulso.lancamentos }}</strong>
          <small>{{ brl(f.pulso.ticketMedio) }} por saída em média</small>
        </article>
      </section>

      <section v-if="veReceitas" class="linha-1">
        <article class="vidro cartao">
          <div class="cab-cartao">
            <div>
              <h2>Saldo dia a dia</h2>
              <p>Passe o mouse no gráfico para ler cada dia.</p>
            </div>
          </div>
          <GraficoLinha :pontos="pontos" />
        </article>

        <article class="vidro cartao">
          <div class="cab-cartao">
            <div>
              <h2>Últimos lançamentos</h2>
              <p>O que entrou e saiu por último.</p>
            </div>
            <RouterLink class="ver" to="/financas/transacoes">Ver todos <AppIcon name="seta" :size="14" class="diag" /></RouterLink>
          </div>
          <div v-for="t in f.ultimos" :key="t.id" class="list-row">
            <span class="marca-tx" :class="t.tipo" />
            <div class="flex1">
              <div class="tx-desc">{{ t.descricao }}</div>
              <div class="tx-meta">{{ t.categoria }} · {{ dataCurta(t.data) }}</div>
            </div>
            <strong class="num" :class="t.tipo === 'receita' ? 'pos' : ''">{{ brlSinal(t.valor, t.tipo) }}</strong>
          </div>
        </article>
      </section>

      <section class="grade">
        <article class="vidro cartao">
          <div class="cab-cartao">
            <div>
              <h2>Maiores saídas</h2>
              <p v-if="topCategoria"><b>{{ topCategoria.nome }}</b> concentra {{ pct(fatiaTop) }} dos gastos.</p>
            </div>
            <RouterLink class="ver" to="/financas/analises">Explorar <AppIcon name="seta" :size="14" class="diag" /></RouterLink>
          </div>
          <ListaBarras :itens="maioresSaidas" />
        </article>

        <article class="vidro cartao">
          <div class="cab-cartao">
            <div>
              <h2>Para onde foi o dinheiro</h2>
              <p>{{ f.porCategoria.length }} categorias com gasto. Toque numa fatia para ver o valor.</p>
            </div>
            <RouterLink class="ver" to="/financas/categorias">Categorias <AppIcon name="seta" :size="14" class="diag" /></RouterLink>
          </div>
          <GraficoRosca :itens="rosca" rotulo-centro="saídas" />
        </article>

        <article v-if="f.projecao" class="vidro cartao">
          <div class="cab-cartao">
            <div>
              <h2>{{ ehAtual ? "Onde o mês termina" : "Como o mês fechou" }}</h2>
              <p v-if="ehAtual">No ritmo de {{ brl(f.projecao.ritmoDiario) }} por dia.</p>
              <p v-else>Gasto realizado contra o projetado.</p>
            </div>
          </div>
          <div class="barras-proj">
            <div class="barra-linha">
              <div class="trilho"><span class="cheio" :style="{ width: `${Math.min(f.despesas / Math.max(f.projecao.despesas, 1), 1) * 100}%` }" /></div>
              <span>Realizado <b class="num">{{ brl(f.despesas) }}</b></span>
            </div>
            <div class="barra-linha">
              <div class="trilho tracejado" />
              <span>Projetado <b class="num">{{ brl(f.projecao.despesas) }}</b></span>
            </div>
          </div>
          <div class="mini">
            <div v-if="ehAtual"><span>Ainda por vir</span><strong class="num">{{ brl(aindaVem) }}</strong></div>
            <div><span>Mês anterior</span><strong class="num">{{ brl(f.mesAnterior.despesas) }}</strong></div>
          </div>
        </article>

        <article v-if="f.contasProximas?.length" class="vidro cartao">
          <div class="cab-cartao">
            <div>
              <h2>Vence nos próximos dias</h2>
              <p>
                {{ brl(totalContas) }} em {{ f.contasProximas.length }} {{ f.contasProximas.length === 1 ? "conta" : "contas" }}<template
                  v-if="f.contasProximas.some((c) => c.valor === null)"
                >, fora as variáveis</template>. Aviso na véspera.
              </p>
            </div>
            <RouterLink class="ver" to="/financas/contas">Contas <AppIcon name="seta" :size="14" class="diag" /></RouterLink>
          </div>
          <div v-for="c in f.contasProximas" :key="c.id" class="list-row">
            <span class="dia num">{{ dataCurta(c.vencimento) }}</span>
            <div class="flex1">
              <div class="tx-desc">{{ c.descricao }}</div>
              <div class="tx-meta">{{ c.mensal ? "todo mês" : "única" }}</div>
            </div>
            <strong class="num">{{ c.valor === null ? "variável" : brl(c.valor) }}</strong>
          </div>
        </article>

        <article v-if="f.renda" class="vidro cartao">
          <div class="cab-cartao">
            <div>
              <h2>Quanto você ganha por mês</h2>
              <p>Média de <b>{{ brl(f.renda.media) }}</b>, entre {{ brl(f.renda.menor) }} e {{ brl(f.renda.maior) }}.</p>
            </div>
            <span class="chip" :class="estabilidade.classe">{{ estabilidade.rotulo }}</span>
          </div>
          <GraficoBarras :rotulos="rendaSerie.rotulos" :series="rendaSerie.series" :altura="200" :legenda="false" />
        </article>

        <article class="vidro cartao">
          <div class="cab-cartao">
            <div>
              <h2>Já comprometido com parcelas</h2>
              <p v-if="totalComprometido">{{ brl(totalComprometido) }} nos próximos 6 meses.</p>
              <p v-else>Nenhuma parcela futura. Diga “comprei a TV em 10x de 150”.</p>
            </div>
          </div>
          <GraficoBarras :rotulos="comprometidoSerie.rotulos" :series="comprometidoSerie.series" :altura="200" :legenda="false" />
        </article>

        <article class="vidro cartao largo">
          <div class="cab-cartao">
            <div>
              <h2>O pulso do mês</h2>
              <p>{{ f.pulso.lancamentos }} lançamentos e {{ brl(f.pulso.ticketMedio) }} por saída em média.</p>
            </div>
            <RouterLink class="ver" to="/financas/pagamentos">Formas de pagamento <AppIcon name="seta" :size="14" class="diag" /></RouterLink>
          </div>
          <div class="pilha">
            <span v-for="p in pagamentos" :key="p.nome" :style="{ width: `${p.frac * 100}%`, background: p.cor }" :title="pagamentoNome(p.nome)" />
          </div>
          <div class="legenda-pilha">
            <span v-for="p in pagamentos" :key="p.nome"><span class="dot" :style="{ background: p.cor }" /> {{ pagamentoNome(p.nome) }} {{ pct(p.frac) }}</span>
          </div>
          <div class="mini tres">
            <div><span>Ticket médio de saída</span><strong class="num">{{ brl(f.pulso.ticketMedio) }}</strong></div>
            <div v-if="f.pulso.diaMaisMovimentado">
              <span>Dia mais movimentado</span>
              <strong class="num">{{ dataCurta(f.pulso.diaMaisMovimentado.data) }} · {{ f.pulso.diaMaisMovimentado.qtd }} lanç.</strong>
            </div>
            <div><span>Formas de pagamento</span><strong class="num">{{ pagamentos.length }}</strong></div>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>

<style scoped>
p { margin: 0; }
.page-head .eyebrow { display: block; margin-bottom: 12px; }
.diag { transform: rotate(-45deg); }
.vidro { background: var(--glass); border: 1px solid var(--line); border-radius: 22px; backdrop-filter: blur(16px); }
.flex1 { flex: 1; min-width: 0; }

.resumo { margin-bottom: 24px; }

.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 16px; }
.kpi { padding: 22px 24px; display: grid; gap: 8px; align-content: start; }
.kpi .rotulo { font-size: 13px; color: var(--text-2); }
.kpi strong { font-family: var(--fonte-titulo); font-size: 30px; font-weight: 400; letter-spacing: -0.035em; line-height: 1.1; }
.kpi small { font-size: 12.5px; color: var(--text-3); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kpi.destaque { background: linear-gradient(160deg, rgba(227, 165, 124, 0.16), var(--glass) 60%); border-color: rgba(227, 165, 124, 0.3); }

.linha-1 { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; margin-bottom: 16px; align-items: start; }
.grade { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.cartao { padding: 24px; display: grid; gap: 18px; align-content: start; min-width: 0; }
.largo { grid-column: 1 / -1; }
.cab-cartao { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.cab-cartao h2 { margin: 0; font-size: 18px; }
.cab-cartao p { margin-top: 4px; font-size: 13.5px; color: var(--text-3); }
.cab-cartao p b { color: var(--text); font-weight: 500; }
.ver { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--text-2); white-space: nowrap; }
.ver:hover { color: var(--text); }

.list-row { padding: 12px 2px; }
.tx-desc { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tx-meta { font-size: 12.5px; color: var(--text-3); margin-top: 2px; }
.marca-tx { width: 8px; height: 8px; border-radius: 3px; flex: none; background: var(--text-3); }
.marca-tx.receita { background: var(--success); }
.dia { font-size: 12.5px; color: var(--text-2); padding: 4px 8px; border-radius: 8px; border: 1px solid var(--line); flex: none; }

.barras-proj { display: grid; gap: 14px; }
.barra-linha { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center; font-size: 13px; color: var(--text-2); }
.barra-linha b { color: var(--text); font-weight: 500; }
.trilho { height: 10px; border-radius: 10px; background: var(--glass-2); overflow: hidden; }
.trilho .cheio { display: block; height: 100%; background: linear-gradient(90deg, #c9784a, #f0c09c); border-radius: 10px; }
.tracejado { background: transparent; border: 1px dashed var(--line-strong); }

.mini { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
.mini.tres { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.mini > div { display: grid; gap: 4px; }
.mini span { font-size: 12.5px; color: var(--text-3); }
.mini strong { font-size: 17px; font-weight: 500; }

.pilha { display: flex; height: 12px; border-radius: 12px; overflow: hidden; gap: 3px; }
.pilha span { display: block; height: 100%; min-width: 4px; }
.legenda-pilha { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: var(--text-2); }
.legenda-pilha > span { display: inline-flex; align-items: center; gap: 6px; }

@media (max-width: 1100px) {
  .linha-1 { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  .grade { grid-template-columns: 1fr; }
  .mini.tres { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 600px) {
  .kpis { grid-template-columns: 1fr 1fr; gap: 10px; }
  .kpi { padding: 16px; }
  .kpi strong { font-size: 21px; }
  .cartao { padding: 20px 18px; }
  .cab-cartao { flex-wrap: wrap; }
}
</style>
