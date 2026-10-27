<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { api, type ContaPagar, type Frequencia, type Recorrencia, type Tipo } from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import AssessorBalao from "../../components/AssessorBalao.vue";
import EstadoVazio from "../../components/EstadoVazio.vue";
import PainelLateral from "../../components/PainelLateral.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import { brl, dataCurta, rotuloDia } from "../../format";
import { HOJE, pode, useCarregar } from "../../estado";
import CabecalhoSub from "./CabecalhoSub.vue";

const contas = useCarregar(() => api.get<{ contas: ContaPagar[] }>("/contas-pagar", { incluirPagas: "true" }));
const recs = useCarregar(() => api.get<{ recorrencias: Recorrencia[] }>("/recorrencias"));

const abertas = computed(() => (contas.dados.value?.contas ?? []).filter((c) => c.situacao === "aberta"));
const pagasNoMes = computed(() =>
  (contas.dados.value?.contas ?? []).filter((c) => c.situacao === "paga" && c.vencimento.startsWith(HOJE.slice(0, 7))),
);
const vencidas = computed(() => abertas.value.filter((c) => c.vencida).length);
const ativas = computed(() => (recs.dados.value?.recorrencias ?? []).filter((r) => r.situacao === "ativa"));
const totalMensalRecorrente = computed(() =>
  ativas.value
    .filter((r) => r.tipo === "despesa")
    .reduce((s, r) => s + r.valor * (r.frequencia === "diaria" ? 30 : r.frequencia === "semanal" ? 4.3 : 1), 0),
);

type Painel = { modo: "conta"; conta?: ContaPagar } | { modo: "pagar"; conta: ContaPagar } | { modo: "recorrencia" };
const painel = ref<Painel | null>(null);
const erro = ref<string | null>(null);
const salvando = ref(false);
const contaForm = reactive({ descricao: "", vencimento: HOJE, valor: "", categoria: "", mensal: true });
const pagarForm = reactive({ valor: "", data: HOJE, pagamento: "" });
const recForm = reactive({ tipo: "despesa" as Tipo, valor: "", categoria: "", descricao: "", frequencia: "mensal" as Frequencia, inicio: HOJE, pagamento: "" });

const numero = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const valorTexto = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","));

function abrirConta(c?: ContaPagar) {
  erro.value = null;
  Object.assign(contaForm, c
    ? { descricao: c.descricao, vencimento: c.vencimento, valor: valorTexto(c.valor), categoria: c.categoria, mensal: c.mensal }
    : { descricao: "", vencimento: HOJE, valor: "", categoria: "", mensal: true });
  painel.value = { modo: "conta", conta: c };
}
function abrirPagar(c: ContaPagar) {
  erro.value = null;
  Object.assign(pagarForm, { valor: valorTexto(c.valor), data: HOJE, pagamento: "" });
  painel.value = { modo: "pagar", conta: c };
}
function abrirRecorrencia() {
  erro.value = null;
  Object.assign(recForm, { tipo: "despesa", valor: "", categoria: "", descricao: "", frequencia: "mensal", inicio: HOJE, pagamento: "" });
  painel.value = { modo: "recorrencia" };
}

async function executar(acao: () => Promise<unknown>) {
  salvando.value = true;
  erro.value = null;
  try {
    await acao();
    painel.value = null;
    await Promise.all([contas.recarregar(), recs.recarregar()]);
  } catch (e) {
    erro.value = (e as Error).message;
  } finally {
    salvando.value = false;
  }
}

function salvarConta() {
  if (!contaForm.descricao.trim()) return (erro.value = "Dê um nome para a conta.");
  const valor = contaForm.valor.trim() ? numero(contaForm.valor) : null;
  if (valor !== null && !(valor > 0)) return (erro.value = "Valor inválido.");
  const corpo = { descricao: contaForm.descricao, vencimento: contaForm.vencimento, valor, categoria: contaForm.categoria.trim() || undefined, mensal: contaForm.mensal };
  const atual = painel.value?.modo === "conta" ? painel.value.conta : undefined;
  return executar(() => (atual ? api.patch(`/contas-pagar/${atual.id}`, corpo) : api.post("/contas-pagar", corpo)));
}

function pagar() {
  if (painel.value?.modo !== "pagar") return;
  const id = painel.value.conta.id;
  const valor = pagarForm.valor.trim() ? numero(pagarForm.valor) : undefined;
  if (valor !== undefined && !(valor > 0)) return (erro.value = "Valor inválido.");
  return executar(() => api.post(`/contas-pagar/${id}/pagar`, { valor, data: pagarForm.data, pagamento: pagarForm.pagamento.trim() || undefined }));
}

function cancelarConta(c: ContaPagar) {
  if (!confirm(`Remover "${c.descricao}" das contas a pagar? Os avisos dela param.`)) return;
  return executar(() => api.del(`/contas-pagar/${c.id}`));
}

function salvarRecorrencia() {
  const valor = numero(recForm.valor);
  if (!(valor > 0)) return (erro.value = "Informe um valor maior que zero.");
  if (!recForm.descricao.trim() || !recForm.categoria.trim()) return (erro.value = "Preencha descrição e categoria.");
  return executar(() =>
    api.post("/recorrencias", { ...recForm, valor, pagamento: recForm.pagamento.trim() || null }),
  );
}

function alterar(r: Recorrencia, acao: "pausar" | "retomar" | "cancelar") {
  if (acao === "cancelar" && !confirm(`Cancelar "${r.descricao}"? O que já foi lançado continua.`)) return;
  return executar(() => api.patch(`/recorrencias/${r.id}`, { acao }));
}
</script>

<template>
  <div>
    <CabecalhoSub titulo="Contas e recorrências" subtitulo="O que vence e o que se repete. O Bento avisa na véspera e lança o recorrente sozinho.">
      <button class="btn" @click="abrirRecorrencia"><AppIcon name="repetir" :size="16" /> Recorrência</button>
      <button class="btn primary" @click="abrirConta()"><AppIcon name="mais" :size="16" /> Conta a pagar</button>
    </CabecalhoSub>

    <StatusCarga :carregando="contas.carregando.value && !contas.dados.value" :erro="contas.erro.value" @tentar="contas.recarregar" />

    <AssessorBalao v-if="contas.dados.value" mesa="financas">
      <template v-if="vencidas"><b>{{ vencidas }} {{ vencidas === 1 ? "conta vencida" : "contas vencidas" }}</b>. Quando pagar, diga “paguei” no WhatsApp ou use o botão Pagar.</template>
      <template v-else-if="abertas.length">a próxima é <b>{{ abertas[0].descricao }}</b>, {{ rotuloDia(abertas[0].vencimento, HOJE).toLowerCase() }}. Aviso na véspera.</template>
      <template v-else>nenhuma conta cadastrada. No WhatsApp: “o condomínio vence dia 8, 480 reais, todo mês”.</template>
    </AssessorBalao>

    <div class="eyebrow secao">Contas a pagar</div>
    <EstadoVazio v-if="contas.dados.value && !abertas.length && !pagasNoMes.length" titulo="Nenhuma conta a pagar" texto="Cadastre o que vence todo mês, como condomínio e fatura do cartão." />
    <section v-else-if="contas.dados.value" class="card lista">
      <div v-for="c in [...abertas, ...pagasNoMes]" :key="c.id" class="list-row">
        <div class="flex1">
          <strong>{{ c.descricao }}</strong>
          <div class="faint">
            {{ c.situacao === "paga" ? "paga" : `vence ${dataCurta(c.vencimento)}` }} · {{ c.categoria }} · {{ c.mensal ? "todo mês" : "única" }}
          </div>
        </div>
        <span v-if="c.vencida" class="chip danger">vencida</span>
        <span v-else-if="c.situacao === 'paga'" class="chip ok">paga</span>
        <strong class="num">{{ c.valor === null ? "variável" : brl(c.valor) }}</strong>
        <template v-if="c.situacao === 'aberta'">
          <button class="btn" @click="abrirPagar(c)">Pagar</button>
          <button class="icon-btn" aria-label="Editar" title="Editar" @click="abrirConta(c)"><AppIcon name="editar" :size="16" /></button>
          <button class="icon-btn" aria-label="Remover" title="Remover" @click="cancelarConta(c)"><AppIcon name="lixo" :size="16" /></button>
        </template>
      </div>
    </section>

    <div class="eyebrow secao">
      Recorrências
      <span v-if="totalMensalRecorrente" class="faint"> · cerca de {{ brl(totalMensalRecorrente) }} por mês em gastos</span>
    </div>
    <EstadoVazio v-if="recs.dados.value && !recs.dados.value.recorrencias.length" titulo="Nenhuma recorrência" texto="No WhatsApp: “toda segunda tem 89,90 da academia”." />
    <section v-else-if="recs.dados.value" class="card lista">
      <div v-for="r in recs.dados.value.recorrencias" :key="r.id" class="list-row">
        <div class="flex1">
          <strong>{{ r.descricao }}</strong>
          <div class="faint">{{ r.frequenciaTexto }} · {{ r.categoria }}<template v-if="r.situacao === 'ativa'"> · próxima {{ dataCurta(r.proxima) }}</template></div>
        </div>
        <span v-if="r.situacao === 'pausada'" class="chip warning">pausada</span>
        <strong class="num" :class="{ pos: r.tipo === 'receita' }">{{ r.tipo === "receita" ? "+" : "-" }}{{ brl(r.valor) }}</strong>
        <button v-if="r.situacao === 'ativa'" class="btn ghost" @click="alterar(r, 'pausar')">Pausar</button>
        <button v-else class="btn ghost" @click="alterar(r, 'retomar')">Retomar</button>
        <button class="icon-btn" aria-label="Cancelar recorrência" title="Cancelar" @click="alterar(r, 'cancelar')"><AppIcon name="lixo" :size="16" /></button>
      </div>
    </section>

    <PainelLateral
      v-if="painel"
      :titulo="painel.modo === 'pagar' ? `Pagar ${painel.conta.descricao}` : painel.modo === 'recorrencia' ? 'Nova recorrência' : painel.conta ? 'Editar conta' : 'Nova conta a pagar'"
      @fechar="painel = null"
    >
      <template v-if="painel.modo === 'conta'">
        <label class="field"><span>Nome</span><input v-model="contaForm.descricao" class="input" maxlength="80" placeholder="Ex.: Condomínio, Fatura Nubank" autofocus /></label>
        <label class="field"><span>Vencimento</span><input v-model="contaForm.vencimento" class="input" type="date" /></label>
        <label class="field"><span>Valor (deixe vazio se varia, como fatura)</span><input v-model="contaForm.valor" class="input" inputmode="decimal" placeholder="0,00" /></label>
        <label class="field"><span>Categoria ao pagar</span><input v-model="contaForm.categoria" class="input" placeholder="Contas" /></label>
        <label class="marcar"><input v-model="contaForm.mensal" type="checkbox" /> Vence todo mês no mesmo dia</label>
      </template>
      <template v-else-if="painel.modo === 'pagar'">
        <label class="field"><span>Valor pago</span><input v-model="pagarForm.valor" class="input" inputmode="decimal" placeholder="0,00" autofocus /></label>
        <label class="field"><span>Data</span><input v-model="pagarForm.data" class="input" type="date" /></label>
        <label class="field"><span>Forma de pagamento</span><input v-model="pagarForm.pagamento" class="input" placeholder="pix, boleto, débito…" /></label>
        <p class="faint">A despesa entra em Transações{{ painel.conta.mensal ? " e o vencimento passa para o mês seguinte" : "" }}.</p>
      </template>
      <template v-else>
        <div v-if="pode('receitas') && pode('despesas')" class="segmentos">
          <button :class="{ ativo: recForm.tipo === 'despesa' }" @click="recForm.tipo = 'despesa'">Gasto</button>
          <button :class="{ ativo: recForm.tipo === 'receita' }" @click="recForm.tipo = 'receita'">Receita</button>
        </div>
        <label class="field"><span>Descrição</span><input v-model="recForm.descricao" class="input" maxlength="80" placeholder="Ex.: Academia" autofocus /></label>
        <label class="field"><span>Valor de cada lançamento</span><input v-model="recForm.valor" class="input" inputmode="decimal" placeholder="0,00" /></label>
        <label class="field"><span>Categoria</span><input v-model="recForm.categoria" class="input" placeholder="Ex.: Saúde" /></label>
        <label class="field">
          <span>Repete</span>
          <select v-model="recForm.frequencia" class="input">
            <option value="diaria">Todo dia</option>
            <option value="semanal">Toda semana, no mesmo dia</option>
            <option value="mensal">Todo mês, no mesmo dia</option>
          </select>
        </label>
        <label class="field"><span>Primeiro lançamento</span><input v-model="recForm.inicio" class="input" type="date" /></label>
        <label class="field"><span>Forma de pagamento</span><input v-model="recForm.pagamento" class="input" placeholder="crédito, débito automático…" /></label>
      </template>
      <p v-if="erro" class="erro">{{ erro }}</p>
      <template #rodape>
        <button
          class="btn primary"
          :disabled="salvando"
          @click="painel.modo === 'pagar' ? pagar() : painel.modo === 'recorrencia' ? salvarRecorrencia() : salvarConta()"
        >
          {{ salvando ? "Salvando…" : painel.modo === "pagar" ? "Registrar pagamento" : "Salvar" }}
        </button>
        <button class="btn ghost" @click="painel = null">Cancelar</button>
      </template>
    </PainelLateral>
  </div>
</template>

<style scoped>
.secao { margin: 32px 0 10px; }
.lista { padding: 4px 20px; }
.list-row { gap: 12px; }
.flex1 { flex: 1; min-width: 0; }
.flex1 strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.faint { font-size: 13px; }
.num { white-space: nowrap; }
.marcar { display: flex; gap: 10px; align-items: center; font-size: 14px; color: var(--text-2); }
.marcar input { accent-color: var(--mesa); width: 16px; height: 16px; }
.segmentos { display: flex; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 3px; }
.segmentos button { flex: 1; border: 0; background: transparent; padding: 6px 14px; border-radius: 999px; cursor: pointer; color: var(--text-2); font-size: 14px; }
.segmentos button.ativo { background: var(--surface-2); color: var(--text); box-shadow: inset 0 0 0 1px var(--line-strong); }
.erro { color: var(--danger); margin: 0; }
p { margin: 0; }
</style>
