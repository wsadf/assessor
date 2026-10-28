<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api, type Analises } from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import AssessorBalao from "../../components/AssessorBalao.vue";
import EstadoVazio from "../../components/EstadoVazio.vue";
import GraficoBarras from "../../components/graficos/GraficoBarras.vue";
import GraficoRosca from "../../components/graficos/GraficoRosca.vue";
import ListaBarras from "../../components/graficos/ListaBarras.vue";
import MesPicker from "../../components/MesPicker.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import { brl, mesCurto, mesNome, pagamentoNome } from "../../format";
import { mesSelecionado, pode, useCarregar } from "../../estado";
import { PALETA } from "../../mesas";
import CabecalhoSub from "./CabecalhoSub.vue";

const { dados: a, carregando, erro, recarregar } = useCarregar(
  () => api.get<Analises>("/analises", { mes: mesSelecionado.value, meses: 6 }),
  [mesSelecionado],
);

type CardId = "resumo" | "entradas" | "saidas" | "rosca" | "barrasCategoria" | "fluxo" | "top5" | "porDia" | "pagamentos" | "receitas";

const CATALOGO: Record<CardId, { titulo: string; largo?: boolean; palavras: string[] }> = {
  resumo: { titulo: "Resumo do mês", palavras: ["resumo", "saldo"] },
  entradas: { titulo: "Entradas", palavras: ["entrada", "recebi"] },
  saidas: { titulo: "Saídas", palavras: ["saida", "gastei", "gasto total"] },
  rosca: { titulo: "Despesas por categoria", palavras: ["pizza", "rosca", "fatia"] },
  barrasCategoria: { titulo: "Despesas por categoria (barras)", palavras: ["categoria", "barra"] },
  fluxo: { titulo: "Fluxo mensal, 6 meses", largo: true, palavras: ["fluxo", "mensal", "meses", "entradas e saidas"] },
  top5: { titulo: "Top 5 categorias", palavras: ["top", "ranking", "maiores"] },
  porDia: { titulo: "Gastos por dia", largo: true, palavras: ["dia", "diario"] },
  pagamentos: { titulo: "Por forma de pagamento", palavras: ["pagamento", "cartao", "credito", "pix"] },
  receitas: { titulo: "Receitas por categoria", palavras: ["receita", "renda"] },
};
const PADRAO: CardId[] = ["resumo", "entradas", "saidas", "rosca", "barrasCategoria", "fluxo", "top5"];
const CHAVE = "assessor-analises-cards";

function lerOrdem(): CardId[] {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as CardId[] | null;
    if (Array.isArray(salvo)) return salvo.filter((c) => c in CATALOGO);
  } catch {
    // Ordem salva invalida ou sem localStorage: volta ao padrao.
  }
  return [...PADRAO];
}

const cards = ref<CardId[]>(lerOrdem());
watch(cards, (v) => {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(v));
  } catch {
    // So nesta sessao.
  }
}, { deep: true });

const arrastando = ref<CardId | null>(null);
function soltarSobre(alvo: CardId) {
  const de = arrastando.value;
  arrastando.value = null;
  if (!de || de === alvo) return;
  const lista = cards.value.filter((c) => c !== de);
  lista.splice(lista.indexOf(alvo), 0, de);
  cards.value = lista;
}
const remover = (id: CardId) => (cards.value = cards.value.filter((c) => c !== id));
// Quem so ve gastos nao recebe receitas da API; esses cards ficariam zerados.
const COM_RECEITAS = new Set<CardId>(["resumo", "entradas", "receitas"]);
const visiveis = computed(() => cards.value.filter((c) => pode("receitas") || !COM_RECEITAS.has(c)));

const pedido = ref("");
const resposta = ref<string | null>(null);
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function pedir() {
  const texto = normalizar(pedido.value);
  if (!texto.trim()) return;
  const achados = (Object.keys(CATALOGO) as CardId[]).filter((id) => CATALOGO[id].palavras.some((p) => texto.includes(p)));
  if (!achados.length) {
    resposta.value = `Ainda não sei montar esse gráfico. Tente: ${Object.values(CATALOGO).map((c) => c.titulo.toLowerCase()).slice(0, 5).join(", ")}.`;
    return;
  }
  const novos = achados.filter((id) => !cards.value.includes(id));
  cards.value = [...novos, ...cards.value];
  resposta.value = novos.length
    ? `Pronto, adicionei ${novos.map((id) => `“${CATALOGO[id].titulo}”`).join(" e ")} no topo.`
    : `${achados.map((id) => `“${CATALOGO[id].titulo}”`).join(" e ")} já está na sua dashboard, não dupliquei.`;
  pedido.value = "";
}

const restaurar = () => {
  cards.value = [...PADRAO];
  resposta.value = null;
};

const cat = computed(() => (a.value?.porCategoria ?? []).map((c, i) => ({ nome: c.nome, valor: c.total, cor: PALETA[i % PALETA.length] })));
const fluxo = computed(() => ({
  rotulos: (a.value?.fluxo ?? []).map((f) => mesCurto(f.mes)),
  series: [
    ...(pode("receitas") ? [{ nome: "Receitas", cor: "#10b981", valores: (a.value?.fluxo ?? []).map((f) => f.receitas ?? 0) }] : []),
    { nome: "Despesas", cor: "#ee7aa8", valores: (a.value?.fluxo ?? []).map((f) => f.despesas) },
  ],
}));
const vazio = computed(() => a.value && a.value.resumo.lancamentos === 0);
const pagamentos = computed(() =>
  (a.value?.porPagamento ?? []).map((p, i) => ({ nome: pagamentoNome(p.nome), valor: p.total, cor: PALETA[i % PALETA.length], detalhe: `${p.qtd} lançamentos` })),
);
</script>

<template>
  <div>
    <CabecalhoSub titulo="Análises" :subtitulo="`Sua dashboard financeira, montada com o Bento · ${mesNome(mesSelecionado)}`">
      <template #selo><span class="chip ok selo">beta</span></template>
      <MesPicker />
    </CabecalhoSub>

    <StatusCarga :carregando="carregando && !a" :erro="erro" @tentar="recarregar" />
    <EstadoVazio v-if="vazio" titulo="Sem lançamentos neste mês" texto="As análises aparecem quando houver gastos ou receitas no mês escolhido." />

    <template v-else-if="a">
      <div class="dica faint">
        <AppIcon name="arrastar" :size="15" /> Arraste os cards pela alça para reorganizar · a ordem fica salva neste navegador
        <button v-if="cards.join() !== PADRAO.join()" class="link" @click="restaurar">restaurar padrão</button>
      </div>

      <div class="dash">
        <article
          v-for="id in visiveis"
          :key="id"
          class="card cartao"
          :class="{ largo: CATALOGO[id].largo, arrastando: arrastando === id }"
          @dragover.prevent
          @drop="soltarSobre(id)"
        >
          <header>
            <span class="alca" draggable="true" title="Arrastar" @dragstart="arrastando = id" @dragend="arrastando = null"><AppIcon name="arrastar" :size="16" /></span>
            <div class="titulos">
              <strong>{{ CATALOGO[id].titulo }}</strong>
              <span class="faint">{{ id === "fluxo" ? "últimos 6 meses" : mesNome(a.mes) }}</span>
            </div>
            <button class="icon-btn mini" title="Remover da dashboard" @click="remover(id)"><AppIcon name="fechar" :size="14" /></button>
          </header>

          <div class="corpo">
            <template v-if="id === 'resumo'">
              <div class="grande num">{{ brl((a.resumo.receitas ?? 0) - a.resumo.despesas) }}</div>
              <span class="chip" :class="(a.resumo.receitas ?? 0) >= a.resumo.despesas ? 'ok' : 'danger'">
                {{ (a.resumo.receitas ?? 0) >= a.resumo.despesas ? "sobrou no mês" : "gastou mais do que recebeu" }}
              </span>
            </template>
            <template v-else-if="id === 'entradas'">
              <div class="grande num pos">{{ brl(a.resumo.receitas ?? 0) }}</div>
              <span class="faint">{{ a.porReceita.reduce((s, r) => s + r.qtd, 0) }} entradas</span>
            </template>
            <template v-else-if="id === 'saidas'">
              <div class="grande num">{{ brl(a.resumo.despesas) }}</div>
              <span class="faint">{{ a.porCategoria.reduce((s, r) => s + r.qtd, 0) }} saídas</span>
            </template>
            <GraficoRosca v-else-if="id === 'rosca'" :itens="cat.slice(0, 7)" rotulo-centro="saídas" />
            <GraficoBarras
              v-else-if="id === 'barrasCategoria'"
              :rotulos="cat.slice(0, 6).map((c) => c.nome)"
              :series="[{ nome: 'Despesas', cor: '#a98bf5', valores: cat.slice(0, 6).map((c) => c.valor) }]"
              :altura="230"
            />
            <GraficoBarras v-else-if="id === 'fluxo'" :rotulos="fluxo.rotulos" :series="fluxo.series" :altura="240" />
            <ListaBarras v-else-if="id === 'top5'" :itens="cat.slice(0, 5)" numerar />
            <GraficoBarras
              v-else-if="id === 'porDia'"
              :rotulos="a.porDia.map((d) => String(d.dia))"
              :series="[{ nome: 'Gastos', cor: '#f3b23c', valores: a.porDia.map((d) => d.despesas) }]"
              :altura="220"
            />
            <ListaBarras
              v-else-if="id === 'pagamentos'"
              :itens="pagamentos"
            />
            <ListaBarras
              v-else-if="id === 'receitas'"
              :itens="a.porReceita.map((r) => ({ nome: r.nome, valor: r.total, cor: '#10b981', detalhe: `${r.qtd} entradas` }))"
            />
          </div>
        </article>
      </div>

      <EstadoVazio v-if="!cards.length" titulo="Dashboard vazia" texto="Peça um gráfico abaixo ou restaure o padrão.">
        <button class="btn" @click="restaurar">Restaurar padrão</button>
      </EstadoVazio>

      <div class="pedido-area">
        <AssessorBalao v-if="resposta" mesa="financas">{{ resposta }}</AssessorBalao>
        <form class="pedido" @submit.prevent="pedir">
          <input v-model="pedido" placeholder="Peça um gráfico… ex.: gastos por dia, fluxo mensal, por forma de pagamento" />
          <button class="icon-btn enviar" type="submit" aria-label="Pedir gráfico"><AppIcon name="avancar" /></button>
        </form>
      </div>
    </template>
  </div>
</template>

<style scoped>
.selo { vertical-align: middle; font-size: 11px; }
.dica { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 14px; flex-wrap: wrap; }
.link { border: 0; background: none; color: var(--mesa); cursor: pointer; padding: 0; }
.dash { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; padding-bottom: 120px; }
.cartao { padding: 16px 18px; display: flex; flex-direction: column; min-height: 170px; transition: opacity 0.15s; }
.cartao.largo { grid-column: span 2; }
.cartao.arrastando { opacity: 0.4; }
header { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 14px; }
.alca { cursor: grab; color: var(--text-3); padding-top: 2px; }
.titulos { flex: 1; display: grid; min-width: 0; }
.titulos strong { font-size: 15px; }
.titulos span { font-size: 12.5px; }
.icon-btn.mini { width: 28px; height: 28px; border-color: transparent; color: var(--text-3); }
.icon-btn.mini:hover { border-color: var(--line-strong); color: var(--text); }
.corpo { flex: 1; display: grid; align-content: center; gap: 10px; }
.grande { font-size: 32px; font-weight: 700; letter-spacing: -0.02em; }
.corpo .chip { justify-self: start; }
.pedido-area { position: sticky; bottom: 16px; display: grid; gap: 10px; }
.pedido {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 18px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}
.pedido input { flex: 1; border: 0; background: transparent; outline: none; height: 40px; }
.enviar { background: var(--mesa); border-color: transparent; color: var(--botao-texto); }
@media (max-width: 700px) {
  .cartao.largo { grid-column: auto; }
}
</style>
