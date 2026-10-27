<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api, ApiError, baixarArquivo, type DossieMes } from "../api";
import AppIcon from "../components/AppIcon.vue";
import AssessorBalao from "../components/AssessorBalao.vue";
import EstadoVazio from "../components/EstadoVazio.vue";
import StatusCarga from "../components/StatusCarga.vue";
import { brl, dataCurta, mesNome } from "../format";
import { carregarEu, HOJE, useCarregar } from "../estado";

const ENCERRADO = "Seu acesso a este cliente foi encerrado.";
const PASTA: Record<string, string> = { notas_fiscais: "Nota fiscal", comprovantes: "Comprovante", boletos: "Boleto" };

const { dados: lista, carregando, erro, recarregar } = useCarregar(() => api.get<{ clientes: { conta: string; nome: string | null; desde: string }[] }>("/contador/clientes"));
const cliente = ref<string | null>(null);
const meses = ref<string[]>([]);
const mes = ref<string | null>(null);
const dossie = ref<DossieMes | null>(null);
const aviso = ref<string | null>(null);
const carregandoMes = ref(false);
const baixando = ref<string | null>(null);

const nomeCliente = computed(() => lista.value?.clientes.find((c) => c.conta === cliente.value)?.nome ?? "Cliente");

watch(lista, (l) => {
  if (l && l.clientes.length === 1 && !cliente.value) cliente.value = l.clientes[0].conta;
});

/** 403 em qualquer passo: o titular revogou; volta para a lista com o motivo. */
async function tratar<T>(f: () => Promise<T>) {
  try {
    return await f();
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      aviso.value = ENCERRADO;
      cliente.value = null;
      await Promise.all([recarregar(), carregarEu()]);
      return null;
    }
    aviso.value = (e as Error).message;
    return null;
  }
}

watch(cliente, async (c) => {
  meses.value = [];
  mes.value = null;
  dossie.value = null;
  if (!c) return;
  aviso.value = null;
  const r = await tratar(() => api.get<{ meses: string[] }>(`/contador/${c}/meses`));
  if (r) {
    meses.value = r.meses;
    // Parcelas lancadas adiante criam meses futuros; o contador quer comecar pelo mes corrente.
    mes.value = r.meses.find((m) => m <= HOJE.slice(0, 7)) ?? r.meses[0] ?? null;
  }
});

watch(mes, async (m) => {
  dossie.value = null;
  if (!m || !cliente.value) return;
  carregandoMes.value = true;
  dossie.value = await tratar(() => api.get<DossieMes>(`/contador/${cliente.value}/mes/${m}`));
  carregandoMes.value = false;
});

async function baixar(caminho: string, nome: string, chave: string) {
  baixando.value = chave;
  await tratar(() => baixarArquivo(caminho, nome));
  baixando.value = null;
}

const codigo = ref("");
const usando = ref(false);
async function usarCodigo() {
  aviso.value = null;
  usando.value = true;
  try {
    const r = await api.post<{ conta: string; nome: string | null }>("/contador/aceitar", { codigo: codigo.value });
    codigo.value = "";
    await Promise.all([recarregar(), carregarEu()]);
    cliente.value = r.conta;
  } catch (e) {
    aviso.value = (e as Error).message;
  } finally {
    usando.value = false;
  }
}

const mesTitulo = (m: string) => {
  const s = mesNome(m);
  return s[0].toUpperCase() + s.slice(1);
};
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const ext = (tipo: string) => (tipo.includes("pdf") ? "pdf" : tipo.split("/")[1] ?? "arquivo");
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Clientes</h1>
        <p>Dossiê mensal de quem te deu acesso de contador. Só leitura.</p>
      </div>
    </div>

    <StatusCarga :carregando="carregando && !lista" :erro="erro" @tentar="recarregar" />
    <div v-if="aviso" class="aviso erro" role="alert">{{ aviso }}</div>

    <template v-if="lista">
      <section class="card bloco">
        <div v-if="lista.clientes.length" class="clientes">
          <button
            v-for="c in lista.clientes"
            :key="c.conta"
            type="button"
            class="chip cliente"
            :class="{ ok: c.conta === cliente }"
            :aria-pressed="c.conta === cliente"
            @click="cliente = c.conta"
          >
            {{ c.nome ?? "Cliente sem nome" }}
          </button>
        </div>
        <EstadoVazio v-else titulo="Nenhum cliente ainda" texto="Peça ao seu cliente o código de contador (CONT-XXXXXX) e use abaixo." />
        <form class="codigo" @submit.prevent="usarCodigo">
          <input v-model="codigo" class="input" placeholder="CONT-XXXXXX" autocapitalize="characters" autocomplete="off" aria-label="Código de contador" />
          <button class="btn" type="submit" :disabled="usando || !codigo.trim()">{{ usando ? "Conferindo…" : "Usar código" }}</button>
        </form>
      </section>

      <template v-if="cliente">
        <div class="cabecalho">
          <h2>{{ nomeCliente }}</h2>
          <span class="spacer" />
          <select v-if="meses.length" v-model="mes" class="input mes" aria-label="Mês">
            <option v-for="m in meses" :key="m" :value="m">{{ mesTitulo(m) }}</option>
          </select>
          <button
            v-if="mes"
            class="btn primary"
            :disabled="baixando === 'pacote'"
            @click="baixar(`/contador/${cliente}/mes/${mes}/pacote`, `dossie-${mes}.zip`, 'pacote')"
          >
            <AppIcon name="seta" :size="16" /> {{ baixando === "pacote" ? "Preparando…" : "Baixar o mês" }}
          </button>
        </div>

        <EstadoVazio v-if="!meses.length" titulo="Nada registrado ainda" texto="Quando houver lançamentos ou notas, os meses aparecem aqui." />
        <p v-if="carregandoMes" class="faint">Carregando o mês…</p>

        <template v-if="dossie">
          <AssessorBalao mesa="fiscal">
            em {{ mesNome(dossie.mes) }}: <b>{{ brl(dossie.receitas) }}</b> de receitas e <b>{{ brl(dossie.despesas) }}</b> de despesas, em
            {{ plural(dossie.lancamentos.length, "lançamento", "lançamentos") }} e {{ plural(dossie.documentos.length, "documento", "documentos") }}.
          </AssessorBalao>

          <div class="eyebrow secao">Documentos</div>
          <EstadoVazio v-if="!dossie.documentos.length" titulo="Nenhum documento" texto="Notas, comprovantes e boletos guardados no mês aparecem aqui." />
          <section v-else class="card lista">
            <div v-for="d in dossie.documentos" :key="d.id" class="list-row">
              <div class="flex1">
                <strong>{{ d.titulo }}</strong>
                <div class="faint">{{ PASTA[d.pasta] ?? "Comprovante de lançamento" }} · {{ dataCurta(d.data) }}</div>
              </div>
              <button
                class="btn ghost"
                :disabled="baixando === `doc-${d.id}`"
                @click="baixar(`/contador/${cliente}/documentos/${d.id}/arquivo`, `${d.titulo}.${ext(d.tipo)}`, `doc-${d.id}`)"
              >
                Baixar
              </button>
            </div>
          </section>

          <div class="eyebrow secao">Lançamentos</div>
          <EstadoVazio v-if="!dossie.lancamentos.length" titulo="Nenhum lançamento" texto="Nada registrado neste mês." />
          <section v-else class="card tabela-wrap">
            <table class="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th class="direita">Valor</th>
                  <th>Lançado por</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in dossie.lancamentos" :key="l.id">
                  <td class="num">{{ dataCurta(l.data) }}</td>
                  <td>
                    {{ l.descricao }}<span v-if="l.contraparte" class="faint"> · {{ l.contraparte }}</span>
                    <span v-if="l.parcela" class="faint"> · {{ l.parcela }}</span>
                  </td>
                  <td>{{ l.categoria }}</td>
                  <td class="direita num" :class="l.tipo">{{ l.tipo === "despesa" ? "-" : "+" }}{{ brl(l.valor) }}</td>
                  <td class="faint">{{ l.lancadoPor ?? "" }}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.bloco { padding: 18px 20px; display: grid; gap: 14px; margin-bottom: 24px; }
.clientes { display: flex; flex-wrap: wrap; gap: 8px; }
.cliente { cursor: pointer; background: transparent; font: inherit; padding: 6px 14px; }
.codigo { display: flex; gap: 8px; max-width: 420px; }
.codigo .input { flex: 1; text-transform: uppercase; }
.cabecalho { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.cabecalho h2 { margin: 0; font-size: 22px; }
.spacer { flex: 1; }
.mes { width: auto; min-width: 180px; }
.secao { margin: 28px 0 10px; }
.lista { padding: 4px 20px; }
.flex1 { flex: 1; min-width: 0; }
.flex1 strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.faint { font-size: 13px; }
.tabela-wrap { padding: 0; overflow-x: auto; }
.tabela { width: 100%; border-collapse: collapse; font-size: 14px; }
.tabela th { text-align: left; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-3); padding: 12px 16px; border-bottom: 1px solid var(--line); }
.tabela td { padding: 10px 16px; border-bottom: 1px solid var(--line); vertical-align: top; }
.tabela tr:last-child td { border-bottom: 0; }
.direita { text-align: right; white-space: nowrap; }
.receita { color: var(--accent); }
@media (max-width: 600px) {
  .codigo { max-width: none; }
  .mes { min-width: 0; flex: 1; }
}
</style>
