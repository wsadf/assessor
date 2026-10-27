<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { abrirArquivo, api, type Documento, type Documentos } from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import AssessorBalao from "../../components/AssessorBalao.vue";
import EstadoVazio from "../../components/EstadoVazio.vue";
import PainelLateral from "../../components/PainelLateral.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import { diaMes } from "../../format";
import { useCarregar } from "../../estado";

const pasta = ref<string | null>(null);
const busca = ref("");
// A busca so dispara quando a pessoa para de digitar.
const buscaAtiva = ref("");
let espera: ReturnType<typeof setTimeout> | undefined;
watch(busca, (v) => {
  clearTimeout(espera);
  espera = setTimeout(() => (buscaAtiva.value = v.trim()), 300);
});

const { dados: d, carregando, erro, recarregar } = useCarregar(
  () => api.get<Documentos>("/documentos", { pasta: pasta.value, busca: buscaAtiva.value }),
  [pasta, buscaAtiva],
);

const tamanho = (bytes: number) => {
  const em = (div: number, sufixo: string) => `${(bytes / div).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${sufixo}`;
  if (bytes >= 1024 ** 3) return em(1024 ** 3, "GB");
  if (bytes >= 1024 ** 2) return em(1024 ** 2, "MB");
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};
const fracaoUso = computed(() => (d.value ? Math.min(d.value.uso.bytes / d.value.uso.limite, 1) : 0));
const nomeDaPasta = (id: string | null) => d.value?.pastas.find((p) => p.id === id)?.nome ?? "Sem pasta";
const totalGuardado = computed(() => (d.value?.pastas ?? []).reduce((s, p) => s + p.qtd, 0));
const dataDe = (doc: Documento) => doc.dataDocumento ?? doc.guardadoEm?.slice(0, 10) ?? null;

const editando = ref<Documento | null>(null);
const form = reactive({ titulo: "", pasta: "", descricao: "" });
const salvando = ref(false);
const erroForm = ref<string | null>(null);

function abrir(doc: Documento) {
  editando.value = doc;
  erroForm.value = null;
  Object.assign(form, { titulo: doc.titulo ?? doc.nomeOriginal, pasta: doc.pasta ?? "outros", descricao: doc.descricao ?? "" });
}

async function salvar() {
  if (!editando.value) return;
  if (!form.titulo.trim()) return (erroForm.value = "O documento precisa de um título.");
  salvando.value = true;
  erroForm.value = null;
  try {
    await api.patch(`/documentos/${editando.value.id}`, { titulo: form.titulo, pasta: form.pasta, descricao: form.descricao.trim() || null });
    editando.value = null;
    await recarregar();
  } catch (e) {
    erroForm.value = (e as Error).message;
  } finally {
    salvando.value = false;
  }
}

async function excluir() {
  const doc = editando.value;
  if (!doc || !confirm(`Excluir “${doc.titulo ?? doc.nomeOriginal}”? O arquivo some de vez.`)) return;
  await api.del(`/documentos/${doc.id}`);
  editando.value = null;
  await recarregar();
}

function ver(doc: Documento) {
  abrirArquivo(doc.id).catch((e: Error) => (erroForm.value = e.message));
}
</script>

<template>
  <div>
    <div class="page-head">
      <RouterLink class="icon-btn" to="/tarefas" aria-label="Voltar para Tarefas"><AppIcon name="voltar" /></RouterLink>
      <div>
        <h1>Documentos</h1>
        <p>O que você mandou pelo WhatsApp e pediu para guardar, separado por pasta.</p>
      </div>
    </div>

    <StatusCarga :carregando="carregando && !d" :erro="erro" @tentar="recarregar" />

    <template v-if="d">
      <div class="uso" :class="{ alerta: d.uso.alerta }">
        <div class="trilho"><span :style="{ width: `${fracaoUso * 100}%` }" /></div>
        <span class="faint">
          {{ tamanho(d.uso.bytes) }} de {{ tamanho(d.uso.limite) }} usados
          <template v-if="d.uso.alerta"> · exclua documentos antigos para não faltar espaço</template>
        </span>
      </div>

      <div class="filtros">
        <button class="chip-filtro" :class="{ ativo: !pasta }" @click="pasta = null">Todas · {{ totalGuardado }}</button>
        <button
          v-for="p in d.pastas.filter((x) => x.qtd || x.id === pasta)"
          :key="p.id"
          class="chip-filtro"
          :class="{ ativo: pasta === p.id }"
          @click="pasta = p.id"
        >
          {{ p.nome }} · {{ p.qtd }}
        </button>
        <input v-model="busca" class="input busca" type="search" placeholder="Buscar: contrato do apartamento, CRLV, comprovante do aluguel…" />
      </div>

      <AssessorBalao v-if="!totalGuardado" mesa="tarefas">
        nenhum documento ainda. Mande um PDF ou uma foto pelo WhatsApp e diga <b>“guarda esse”</b>: eu leio, dou um nome e coloco na pasta certa.
      </AssessorBalao>
      <EstadoVazio
        v-else-if="!d.documentos.length"
        titulo="Nada encontrado"
        :texto="buscaAtiva ? `Nenhum documento combina com “${buscaAtiva}”.` : 'Esta pasta está vazia.'"
      />
      <section v-else class="card lista">
        <button v-for="doc in d.documentos" :key="doc.id" class="linha" @click="abrir(doc)">
          <span class="icone" :class="{ pdf: doc.tipo === 'application/pdf' }">{{ doc.tipo === "application/pdf" ? "PDF" : doc.tipo.startsWith("image/") ? "IMG" : "ARQ" }}</span>
          <span class="corpo">
            <span class="titulo">{{ doc.titulo ?? doc.nomeOriginal }}</span>
            <span v-if="doc.descricao" class="descricao faint">{{ doc.descricao }}</span>
            <span class="eyebrow meta">
              {{ nomeDaPasta(doc.pasta) }}<template v-if="dataDe(doc)"> · {{ diaMes(dataDe(doc)!) }}</template> · {{ tamanho(doc.tamanho) }}<template v-if="doc.enviadoPor"> · por {{ doc.enviadoPor }}</template>
            </span>
          </span>
          <span class="chip" v-if="doc.transacaoId">comprovante</span>
        </button>
      </section>
    </template>

    <PainelLateral v-if="editando" titulo="Documento" @fechar="editando = null">
      <button class="btn primary" type="button" @click="ver(editando)">Abrir arquivo</button>
      <label class="field"><span>Título</span><input v-model="form.titulo" class="input" maxlength="120" /></label>
      <label class="field">
        <span>Pasta</span>
        <select v-model="form.pasta" class="input">
          <option v-for="p in d?.pastas ?? []" :key="p.id" :value="p.id">{{ p.nome }}</option>
        </select>
      </label>
      <label class="field">
        <span>Descrição (é o que a busca encontra)</span>
        <textarea v-model="form.descricao" class="input area" maxlength="600" rows="4" />
      </label>
      <p class="faint">Arquivo original: {{ editando.nomeOriginal }} · {{ tamanho(editando.tamanho) }}</p>
      <p v-if="erroForm" class="erro">{{ erroForm }}</p>
      <template #rodape>
        <button class="btn primary" :disabled="salvando" @click="salvar">{{ salvando ? "Salvando…" : "Salvar" }}</button>
        <button class="btn ghost" @click="editando = null">Cancelar</button>
        <span style="flex: 1" />
        <button class="btn danger" @click="excluir"><AppIcon name="lixo" :size="16" /> Excluir</button>
      </template>
    </PainelLateral>
  </div>
</template>

<style scoped>
.uso { display: grid; gap: 6px; margin-bottom: 20px; max-width: 420px; }
.trilho { height: 8px; border-radius: 8px; background: var(--surface-2); overflow: hidden; }
.trilho span { display: block; height: 100%; background: var(--mesa); border-radius: 8px; }
.uso.alerta .trilho span { background: var(--warning); }
.uso .faint { font-size: 13px; }
.filtros { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 18px; }
.chip-filtro { border: 1px solid var(--line-strong); background: transparent; color: var(--text-2); border-radius: 999px; padding: 6px 12px; cursor: pointer; font-size: 13px; }
.chip-filtro.ativo { background: var(--surface-2); color: var(--text); border-color: var(--mesa); }
.busca { flex: 1; min-width: 220px; }
.lista { padding: 6px 16px; }
.linha {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 8px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.linha:last-child { border-bottom: 0; }
.linha:hover { background: var(--surface-2); border-radius: 10px; }
.icone { width: 40px; height: 40px; flex: none; border-radius: 10px; display: grid; place-items: center; font-size: 11px; font-weight: 700; background: var(--surface-2); color: var(--text-2); }
.icone.pdf { color: var(--mesa); }
.corpo { flex: 1; min-width: 0; display: grid; gap: 2px; }
.titulo { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.descricao { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { font-size: 10.5px; }
.area { height: auto; padding: 10px 12px; resize: vertical; font: inherit; }
.erro { color: var(--danger); margin: 0; }
p { margin: 0; }
</style>
