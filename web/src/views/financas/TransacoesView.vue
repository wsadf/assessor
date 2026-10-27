<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { abrirArquivo, api, type Tipo, type Transacao } from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import EstadoVazio from "../../components/EstadoVazio.vue";
import MesPicker from "../../components/MesPicker.vue";
import PainelLateral from "../../components/PainelLateral.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import { brl, brlSinal, dataCurta, mesNome, pagamentoNome, rotuloDia } from "../../format";
import { HOJE, mesSelecionado, pode, useCarregar } from "../../estado";
import { PALETA } from "../../mesas";
import CabecalhoSub from "./CabecalhoSub.vue";

const { dados, carregando, erro, recarregar } = useCarregar(
  () => api.get<{ transacoes: Transacao[]; categorias: string[]; contrapartes: string[] }>("/transacoes", { mes: mesSelecionado.value }),
  [mesSelecionado],
);

const route = useRoute();
const filtroTipo = ref<"" | Tipo>("");
const filtroCategoria = ref(typeof route.query.categoria === "string" ? route.query.categoria : "");
const filtroContraparte = ref(typeof route.query.contraparte === "string" ? route.query.contraparte : "");
const busca = ref("");

const filtradas = computed(() =>
  (dados.value?.transacoes ?? []).filter(
    (t) =>
      (!filtroTipo.value || t.tipo === filtroTipo.value) &&
      (!filtroCategoria.value || t.categoria === filtroCategoria.value) &&
      (!filtroContraparte.value || t.contraparte === filtroContraparte.value) &&
      (!busca.value || `${t.descricao} ${t.categoria} ${t.contraparte ?? ""}`.toLowerCase().includes(busca.value.toLowerCase())),
  ),
);
const totalFiltrado = computed(() => filtradas.value.reduce((s, t) => s + (t.tipo === "receita" ? t.valor : -t.valor), 0));

const dias = computed(() => {
  const mapa = new Map<string, Transacao[]>();
  for (const t of filtradas.value) mapa.set(t.data, [...(mapa.get(t.data) ?? []), t]);
  return [...mapa.entries()].map(([data, itens]) => ({
    data,
    itens,
    saldo: itens.reduce((s, t) => s + (t.tipo === "receita" ? t.valor : -t.valor), 0),
  }));
});

const corCategoria = (c: string) => {
  const lista = dados.value?.categorias ?? [];
  const i = lista.indexOf(c);
  return PALETA[(i < 0 ? c.length : i) % PALETA.length];
};

const editando = ref<Transacao | null>(null);
const criando = ref(false);
const salvando = ref(false);
const erroForm = ref<string | null>(null);
const form = reactive({ tipo: "despesa" as Tipo, valor: "", descricao: "", categoria: "", pagamento: "", data: HOJE, contraparte: "", parcelas: "" });

function abrir(t?: Transacao) {
  erroForm.value = null;
  editando.value = t ?? null;
  criando.value = !t;
  Object.assign(form, t
    ? { tipo: t.tipo, valor: t.valor.toFixed(2).replace(".", ","), descricao: t.descricao, categoria: t.categoria, pagamento: t.pagamento ?? "", data: t.data, contraparte: t.contraparte ?? "", parcelas: "" }
    : { tipo: "despesa", valor: "", descricao: "", categoria: "", pagamento: "", data: mesSelecionado.value === HOJE.slice(0, 7) ? HOJE : `${mesSelecionado.value}-01`, contraparte: "", parcelas: "" });
}
const fechar = () => {
  editando.value = null;
  criando.value = false;
};

async function salvar() {
  const valor = Number(form.valor.replace(/\./g, "").replace(",", "."));
  if (!(valor > 0)) return (erroForm.value = "Informe um valor maior que zero.");
  if (!form.descricao.trim() || !form.categoria.trim()) return (erroForm.value = "Preencha descrição e categoria.");
  const parcelas = form.parcelas ? Number(form.parcelas) : null;
  if (parcelas !== null && !(Number.isInteger(parcelas) && parcelas >= 2 && parcelas <= 60)) return (erroForm.value = "Parcelas: de 2 a 60.");
  salvando.value = true;
  erroForm.value = null;
  const corpo = {
    tipo: form.tipo,
    valor,
    descricao: form.descricao,
    categoria: form.categoria,
    pagamento: form.pagamento.trim() || null,
    data: form.data,
    contraparte: form.contraparte.trim() || null,
    ...(editando.value ? {} : { parcelas }),
  };
  try {
    if (editando.value) await api.patch(`/transacoes/${editando.value.id}`, corpo);
    else await api.post("/transacoes", corpo);
    fechar();
    await recarregar();
  } catch (e) {
    erroForm.value = (e as Error).message;
  } finally {
    salvando.value = false;
  }
}

function verComprovante(id: number) {
  abrirArquivo(id).catch((e: Error) => (erroForm.value = e.message));
}

async function excluir() {
  if (!editando.value || !confirm(`Excluir “${editando.value.descricao}” de ${brl(editando.value.valor)}?`)) return;
  await api.del(`/transacoes/${editando.value.id}`);
  fechar();
  await recarregar();
}
</script>

<template>
  <div>
    <CabecalhoSub titulo="Transações" :subtitulo="`${dados?.transacoes.length ?? 0} lançamentos · ${mesNome(mesSelecionado)}`">
      <MesPicker />
      <button class="btn primary" @click="abrir()"><AppIcon name="mais" :size="16" /> Lançar</button>
    </CabecalhoSub>

    <div class="filtros">
      <div v-if="pode('receitas') && pode('despesas')" class="segmentos">
        <button :class="{ ativo: !filtroTipo }" @click="filtroTipo = ''">Todas</button>
        <button :class="{ ativo: filtroTipo === 'despesa' }" @click="filtroTipo = 'despesa'">Saídas</button>
        <button :class="{ ativo: filtroTipo === 'receita' }" @click="filtroTipo = 'receita'">Entradas</button>
      </div>
      <select v-model="filtroCategoria" class="input">
        <option value="">Todas as categorias</option>
        <option v-for="c in dados?.categorias ?? []" :key="c" :value="c">{{ c }}</option>
      </select>
      <input v-model="busca" class="input busca" type="search" placeholder="Buscar descrição, pessoa ou loja" />
    </div>
    <div v-if="filtroContraparte || busca || filtroCategoria" class="resumo-filtro">
      <span v-if="filtroContraparte" class="chip ok">
        {{ filtroContraparte }}
        <button class="limpar" aria-label="Limpar filtro de pessoa" @click="filtroContraparte = ''">×</button>
      </span>
      <span class="muted">{{ filtradas.length }} lançamentos · total <strong class="num">{{ totalFiltrado >= 0 ? "+" : "-" }}{{ brl(Math.abs(totalFiltrado)) }}</strong></span>
    </div>

    <StatusCarga :carregando="carregando && !dados" :erro="erro" @tentar="recarregar" />

    <EstadoVazio v-if="dados && !filtradas.length" titulo="Nenhum lançamento" texto="Nada neste mês com esses filtros." />

    <div v-else class="card lista">
      <section v-for="d in dias" :key="d.data" class="dia">
        <header>
          <span class="eyebrow">{{ rotuloDia(d.data, HOJE) }}<template v-if="rotuloDia(d.data, HOJE) !== dataCurta(d.data)"> · {{ dataCurta(d.data) }}</template></span>
          <span class="num faint">{{ d.saldo >= 0 ? "+" : "-" }}{{ brl(Math.abs(d.saldo)) }}</span>
        </header>
        <button v-for="t in d.itens" :key="t.id" class="linha" @click="abrir(t)">
          <span class="dot" :style="{ background: corCategoria(t.categoria) }" />
          <span class="corpo">
            <span class="desc">{{ t.descricao }}</span>
            <span class="eyebrow meta">
              {{ t.categoria }}<template v-if="t.contraparte"> · {{ t.tipo === "receita" ? "de" : "para" }} {{ t.contraparte }}</template> · {{ pagamentoNome(t.pagamento) }}<template v-if="t.criadoPor"> · por {{ t.criadoPor }}</template>
            </span>
          </span>
          <span class="valor">
            <strong class="num" :class="{ pos: t.tipo === 'receita' }">{{ brlSinal(t.valor, t.tipo) }}</strong>
            <span v-if="t.comprovanteId" class="chip ok">comprovante</span>
            <span v-if="t.recorrente" class="chip">recorrente</span>
            <span v-if="t.parcela" class="chip">parcela {{ t.parcela.numero }}/{{ t.parcela.total }}</span>
            <span v-else-if="t.pagamento?.toLowerCase().includes('credito')" class="chip warning">na fatura</span>
          </span>
        </button>
      </section>
    </div>

    <PainelLateral v-if="editando || criando" :titulo="editando ? 'Editar transação' : 'Nova transação'" @fechar="fechar">
      <div v-if="pode('receitas') && pode('despesas')" class="segmentos largo">
        <button :class="{ ativo: form.tipo === 'despesa' }" @click="form.tipo = 'despesa'">Saída</button>
        <button :class="{ ativo: form.tipo === 'receita' }" @click="form.tipo = 'receita'">Entrada</button>
      </div>
      <label class="valor-campo">
        <span>R$</span>
        <input v-model="form.valor" inputmode="decimal" placeholder="0,00" autofocus />
      </label>
      <label class="field"><span>Descrição</span><input v-model="form.descricao" class="input" placeholder="Ex.: Almoço no iFood" /></label>
      <label class="field"><span>Data</span><input v-model="form.data" class="input" type="date" /></label>
      <label class="field">
        <span>Categoria</span>
        <input v-model="form.categoria" class="input" list="lista-categorias" placeholder="Ex.: Alimentação" />
        <datalist id="lista-categorias"><option v-for="c in dados?.categorias ?? []" :key="c" :value="c" /></datalist>
      </label>
      <label class="field">
        <span>{{ form.tipo === "receita" ? "De quem veio" : "Para quem foi" }} (pessoa ou loja)</span>
        <input v-model="form.contraparte" class="input" list="lista-contrapartes" placeholder="Ex.: João, iFood, Posto Shell" />
        <datalist id="lista-contrapartes"><option v-for="c in dados?.contrapartes ?? []" :key="c" :value="c" /></datalist>
      </label>
      <label class="field"><span>Pagamento</span><input v-model="form.pagamento" class="input" placeholder="pix, débito, crédito Nubank…" /></label>
      <label v-if="criando && form.tipo === 'despesa'" class="field">
        <span>Parcelas (deixe vazio se for à vista; o valor acima é o de cada parcela)</span>
        <input v-model="form.parcelas" class="input" inputmode="numeric" placeholder="Ex.: 10" />
      </label>
      <p v-if="editando?.parcela" class="faint">Parcela {{ editando.parcela.numero }} de {{ editando.parcela.total }}. Editar aqui muda só esta parcela.</p>
      <button v-if="editando?.comprovanteId" class="btn" type="button" @click="verComprovante(editando.comprovanteId)">Ver comprovante</button>
      <p v-if="erroForm" class="erro">{{ erroForm }}</p>
      <template #rodape>
        <button class="btn primary" :disabled="salvando" @click="salvar">{{ salvando ? "Salvando…" : "Salvar" }}</button>
        <button class="btn ghost" @click="fechar">Cancelar</button>
        <span style="flex: 1" />
        <button v-if="editando" class="btn danger" @click="excluir"><AppIcon name="lixo" :size="16" /> Excluir</button>
      </template>
    </PainelLateral>
  </div>
</template>

<style scoped>
.filtros { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
.filtros select { min-width: 200px; }
.resumo-filtro { display: flex; align-items: center; gap: 12px; margin: -6px 0 16px; flex-wrap: wrap; }
.resumo-filtro strong { color: var(--text); }
.limpar { border: 0; background: none; color: inherit; cursor: pointer; font-size: 15px; line-height: 1; padding: 0 0 0 4px; }
.busca { flex: 1; min-width: 180px; }
.segmentos { display: inline-flex; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 3px; }
.segmentos button { border: 0; background: transparent; padding: 6px 14px; border-radius: 999px; cursor: pointer; color: var(--text-2); font-size: 14px; }
.segmentos button.ativo { background: var(--surface-2); color: var(--text); box-shadow: inset 0 0 0 1px var(--line-strong); }
.segmentos.largo { display: flex; }
.segmentos.largo button { flex: 1; }
.lista { padding: 8px 24px; }
.dia { padding: 18px 0 6px; border-bottom: 1px solid var(--line); }
.dia:last-child { border-bottom: 0; }
.dia header { display: flex; justify-content: space-between; margin-bottom: 4px; }
.linha {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 10px;
  margin: 0 -10px;
  border: 0;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
}
.linha:hover { background: var(--surface-2); }
.corpo { flex: 1; min-width: 0; display: grid; }
.desc { font-weight: 600; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { font-size: 10.5px; }
.valor { display: grid; justify-items: end; gap: 4px; }
.valor strong { font-size: 16px; }
.valor-campo { display: flex; align-items: baseline; gap: 8px; padding: 18px 20px; border: 1px solid var(--line-strong); border-radius: 14px; background: var(--surface-2); }
.valor-campo span { color: var(--text-2); font-size: 20px; }
.valor-campo input { border: 0; background: transparent; outline: none; font-size: 40px; font-weight: 700; color: var(--mesa); width: 100%; }
.erro { color: var(--danger); margin: 0; }
</style>
