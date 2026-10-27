<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { api, type Prioridade, type StatusTarefa, type Tarefa, type Tarefas } from "../api";
import AppIcon from "../components/AppIcon.vue";
import AssessorBalao from "../components/AssessorBalao.vue";
import BlocoMesa from "../components/BlocoMesa.vue";
import EstadoVazio from "../components/EstadoVazio.vue";
import PainelLateral from "../components/PainelLateral.vue";
import StatusCarga from "../components/StatusCarga.vue";
import ValorGrande from "../components/ValorGrande.vue";
import { dataCurta, pct, rotuloDia } from "../format";
import { HOJE, pode, useCarregar } from "../estado";

const { dados: t, carregando, erro, recarregar } = useCarregar(() => api.get<Tarefas>("/tarefas"));

type Filtro = "atrasadas" | "pendentes" | "andamento" | "concluidas" | "abertas";
const filtro = ref<Filtro>("abertas");
const STATUS = [
  { id: "atrasadas", nome: "Em atraso", cor: "var(--danger)" },
  { id: "pendentes", nome: "Pendentes", cor: "var(--warning)" },
  { id: "andamento", nome: "Em andamento", cor: "var(--info)" },
  { id: "concluidas", nome: "Concluídas", cor: "var(--accent)" },
] as const;

const lista = computed(() => {
  const todas = t.value?.tarefas ?? [];
  switch (filtro.value) {
    case "atrasadas": return todas.filter((x) => x.atrasada);
    case "pendentes": return todas.filter((x) => x.status === "pendente" && !x.atrasada);
    case "andamento": return todas.filter((x) => x.status === "andamento" && !x.atrasada);
    case "concluidas": return todas.filter((x) => x.status === "concluida");
    default: return todas.filter((x) => x.status !== "concluida");
  }
});
const r = computed(() => t.value?.resumo);
const fracConcluida = computed(() => (r.value?.total ? r.value.concluidas / r.value.total : 0));
const destaque = computed(() => t.value?.tarefas.find((x) => x.atrasada) ?? t.value?.tarefas.find((x) => x.status !== "concluida"));

const projetos = computed(() =>
  (t.value?.projetos ?? []).map((p) => {
    const doProjeto = (t.value?.tarefas ?? []).filter((x) => x.projeto === p.nome);
    return { nome: p.nome, total: doProjeto.length, feitas: doProjeto.filter((x) => x.status === "concluida").length, atrasadas: doProjeto.filter((x) => x.atrasada).length };
  }),
);

async function alternar(x: Tarefa) {
  await api.patch(`/tarefas/${x.id}`, { status: x.status === "concluida" ? "pendente" : "concluida" });
  await recarregar();
}

const editando = ref<Tarefa | null>(null);
const criando = ref(false);
const erroForm = ref<string | null>(null);
const form = reactive({ titulo: "", prazo: "", prioridade: "normal" as Prioridade, projeto: "", status: "pendente" as StatusTarefa, notas: "" });

function abrir(x?: Tarefa) {
  erroForm.value = null;
  editando.value = x ?? null;
  criando.value = !x;
  Object.assign(form, x
    ? { titulo: x.titulo, prazo: x.prazo ?? "", prioridade: x.prioridade, projeto: x.projeto ?? "", status: x.status, notas: x.notas ?? "" }
    : { titulo: "", prazo: "", prioridade: "normal", projeto: "", status: "pendente", notas: "" });
}
const fechar = () => {
  editando.value = null;
  criando.value = false;
};

async function salvar() {
  if (!form.titulo.trim()) return (erroForm.value = "Dê um título para a tarefa.");
  const corpo = { titulo: form.titulo, prazo: form.prazo || null, prioridade: form.prioridade, projeto: form.projeto.trim() || null, status: form.status, notas: form.notas.trim() || null };
  try {
    if (editando.value) await api.patch(`/tarefas/${editando.value.id}`, corpo);
    else await api.post("/tarefas", corpo);
    fechar();
    await recarregar();
  } catch (e) {
    erroForm.value = (e as Error).message;
  }
}

async function excluir() {
  if (!editando.value || !confirm(`Excluir “${editando.value.titulo}”?`)) return;
  await api.del(`/tarefas/${editando.value.id}`);
  fechar();
  await recarregar();
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Tarefas</h1>
        <p>O que você precisa fazer, com prazo e prioridade. Pelo WhatsApp: “cria a tarefa de revisar o contrato até quarta”.</p>
      </div>
      <span class="spacer" />
      <RouterLink v-if="pode('documentos')" class="btn" to="/tarefas/documentos">Documentos →</RouterLink>
      <button class="btn primary" @click="abrir()"><AppIcon name="mais" :size="16" /> Nova tarefa</button>
    </div>

    <StatusCarga :carregando="carregando && !t" :erro="erro" @tentar="recarregar" />

    <EstadoVazio v-if="t && !t.tarefas.length" titulo="Nenhuma tarefa" texto="Crie a primeira aqui ou peça ao assessor no WhatsApp.">
      <button class="btn primary" @click="abrir()">Nova tarefa</button>
    </EstadoVazio>

    <template v-else-if="t && r">
      <BlocoMesa titulo="Tarefas por status">
        <ValorGrande :valor="r.total" :moeda="false" sufixo="tarefas" />
        <div class="pilha">
          <span v-for="s in STATUS" :key="s.id" :style="{ flex: r[s.id], background: s.cor }" />
        </div>
        <div class="status">
          <button v-for="s in STATUS" :key="s.id" class="st" :class="{ ativo: filtro === s.id }" @click="filtro = filtro === s.id ? 'abertas' : s.id">
            <span class="dot" :style="{ background: s.cor }" /> {{ s.nome }} <strong class="num">{{ r[s.id] }}</strong>
          </button>
        </div>
        <div class="mini">
          <div><span class="eyebrow">Concluídas</span><strong class="num">{{ pct(fracConcluida) }}</strong></div>
          <div><span class="eyebrow">Em atraso</span><strong class="num">{{ r.atrasadas }}</strong></div>
        </div>
        <AssessorBalao mesa="tarefas">
          <template v-if="r.atrasadas && destaque"><b>{{ r.atrasadas }} em atraso</b>. Se resolver <b>{{ destaque.titulo }}</b> primeiro, o resto anda.</template>
          <template v-else-if="destaque">nada atrasado. A próxima é <b>{{ destaque.titulo }}</b>.</template>
          <template v-else>tudo concluído por aqui.</template>
        </AssessorBalao>
        <template #lado>
          <div class="eyebrow">{{ filtro === "abertas" ? "Abertas, das mais urgentes" : STATUS.find((s) => s.id === filtro)?.nome }}</div>
          <EstadoVazio v-if="!lista.length" titulo="Nada aqui" />
          <div v-for="x in lista" :key="x.id" class="list-row tarefa">
            <button class="check" :class="{ feito: x.status === 'concluida' }" :aria-label="x.status === 'concluida' ? 'Reabrir' : 'Concluir'" @click="alternar(x)">
              <AppIcon v-if="x.status === 'concluida'" name="check" :size="14" />
            </button>
            <button class="corpo" @click="abrir(x)">
              <span class="titulo" :class="{ riscado: x.status === 'concluida' }">{{ x.titulo }}</span>
              <span class="eyebrow meta">
                <template v-if="x.prazo">{{ x.atrasada ? "venceu" : "vence" }} {{ rotuloDia(x.prazo, HOJE) }}</template>
                <template v-else>sem prazo</template>
                <template v-if="x.projeto"> · {{ x.projeto }}</template>
              </span>
            </button>
            <span v-if="x.atrasada" class="chip danger">atrasada</span>
            <span v-else-if="x.prioridade !== 'normal' && x.status !== 'concluida'" class="chip" :class="x.prioridade === 'urgente' ? 'danger' : 'warning'">{{ x.prioridade }}</span>
            <span v-if="x.status === 'andamento'" class="chip">em andamento</span>
          </div>
        </template>
      </BlocoMesa>

      <BlocoMesa v-if="projetos.length" titulo="Projetos">
        <AssessorBalao mesa="tarefas">tarefas do mesmo assunto viram projeto. No WhatsApp: “novo projeto: mudança do escritório”.</AssessorBalao>
        <template #lado>
          <div class="projetos">
            <article v-for="p in projetos" :key="p.nome" class="card projeto">
              <strong>{{ p.nome }}</strong>
              <div class="trilho"><span :style="{ width: `${(p.feitas / p.total) * 100}%` }" /></div>
              <div class="faint num">{{ p.feitas }} de {{ p.total }} feitas<template v-if="p.atrasadas"> · <span class="neg-txt">{{ p.atrasadas }} atrasada</span></template></div>
            </article>
          </div>
        </template>
      </BlocoMesa>
    </template>

    <PainelLateral v-if="editando || criando" :titulo="editando ? 'Editar tarefa' : 'Nova tarefa'" @fechar="fechar">
      <label class="field"><span>Título</span><input v-model="form.titulo" class="input" placeholder="Ex.: Revisar o contrato" autofocus /></label>
      <div class="dois">
        <label class="field"><span>Prazo</span><input v-model="form.prazo" class="input" type="date" /></label>
        <label class="field">
          <span>Prioridade</span>
          <select v-model="form.prioridade" class="input"><option value="normal">normal</option><option value="alta">alta</option><option value="urgente">urgente</option></select>
        </label>
      </div>
      <div class="dois">
        <label class="field">
          <span>Status</span>
          <select v-model="form.status" class="input"><option value="pendente">pendente</option><option value="andamento">em andamento</option><option value="concluida">concluída</option></select>
        </label>
        <label class="field"><span>Projeto</span><input v-model="form.projeto" class="input" list="lista-projetos" placeholder="opcional" /></label>
        <datalist id="lista-projetos"><option v-for="p in t?.projetos ?? []" :key="p.nome" :value="p.nome" /></datalist>
      </div>
      <label class="field"><span>Notas</span><textarea v-model="form.notas" class="input area" rows="4" /></label>
      <p v-if="editando" class="faint">Criada em {{ dataCurta(editando.criadaEm) }}</p>
      <p v-if="erroForm" class="erro">{{ erroForm }}</p>
      <template #rodape>
        <button class="btn primary" @click="salvar">Salvar</button>
        <button class="btn ghost" @click="fechar">Cancelar</button>
        <span style="flex: 1" />
        <button v-if="editando" class="btn danger" @click="excluir"><AppIcon name="lixo" :size="16" /> Excluir</button>
      </template>
    </PainelLateral>
  </div>
</template>

<style scoped>
.pilha { display: flex; height: 12px; gap: 4px; border-radius: 12px; overflow: hidden; }
.pilha span { min-width: 0; }
.status { display: grid; gap: 4px; }
.st { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 0; background: transparent; border-radius: 10px; cursor: pointer; color: var(--text-2); font-size: 15px; text-align: left; }
.st strong { margin-left: auto; color: var(--text); }
.st.ativo, .st:hover { background: var(--surface); color: var(--text); }
.mini { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.mini > div { display: grid; gap: 4px; }
.mini strong { font-size: 20px; }
.tarefa { padding: 10px 0; }
.check { width: 22px; height: 22px; border-radius: 50%; border: 1.8px solid var(--line-strong); background: transparent; display: grid; place-items: center; cursor: pointer; flex: none; color: #06140f; }
.check:hover { border-color: var(--mesa); }
.check.feito { background: var(--accent); border-color: var(--accent); }
.corpo { flex: 1; min-width: 0; display: grid; border: 0; background: transparent; text-align: left; cursor: pointer; padding: 0; }
.titulo { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.riscado { text-decoration: line-through; color: var(--text-3); }
.meta { font-size: 10.5px; margin-top: 2px; }
.projetos { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.projeto { padding: 16px 18px; display: grid; gap: 10px; }
.trilho { height: 6px; background: var(--surface-2); border-radius: 6px; overflow: hidden; }
.trilho span { display: block; height: 100%; background: var(--mesa); }
.neg-txt { color: var(--danger); }
.dois { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.area { height: auto; padding: 10px 12px; resize: vertical; }
.erro { color: var(--danger); margin: 0; }
p { margin: 0; }
</style>
