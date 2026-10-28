<script setup lang="ts">
import { reactive, ref } from "vue";
import { api, type ContaBancaria, type Importacao, type ResultadoImportacao } from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import AssessorBalao from "../../components/AssessorBalao.vue";
import EstadoVazio from "../../components/EstadoVazio.vue";
import PainelLateral from "../../components/PainelLateral.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import { brl, dataCurta } from "../../format";
import { pode, useCarregar } from "../../estado";
import CabecalhoSub from "./CabecalhoSub.vue";

const { dados, carregando, erro, recarregar } = useCarregar(() =>
  pode("receitas") ? api.get<{ contas: ContaBancaria[]; importacoes: Importacao[] }>("/extratos") : Promise.resolve(null),
);

const arquivo = ref<HTMLInputElement | null>(null);
const enviando = ref(false);
const resultado = ref<ResultadoImportacao | null>(null);
const erroImportar = ref<string | null>(null);

/** Base64 em pedacos: String.fromCharCode com o arquivo inteiro estoura a pilha em extratos grandes. */
function paraBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

async function importar(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  erroImportar.value = null;
  resultado.value = null;
  if (f.size > 5 * 1024 * 1024) {
    erroImportar.value = "O arquivo passa de 5 MB.";
    return;
  }
  enviando.value = true;
  try {
    resultado.value = await api.post<ResultadoImportacao>("/extratos", { nome: f.name, conteudo: paraBase64(await f.arrayBuffer()) });
    await recarregar();
  } catch (err) {
    erroImportar.value = (err as Error).message;
  } finally {
    enviando.value = false;
    if (arquivo.value) arquivo.value.value = "";
  }
}

const editando = ref<ContaBancaria | null>(null);
const form = reactive({ nome: "", fechamento: "" as string | number, vencimento: "" as string | number });
const erroForm = ref<string | null>(null);
const salvando = ref(false);

function editar(c: ContaBancaria) {
  editando.value = c;
  erroForm.value = null;
  Object.assign(form, { nome: c.nome, fechamento: c.fechamento ? String(c.fechamento) : "", vencimento: c.vencimento ? String(c.vencimento) : "" });
}

async function salvar() {
  if (!editando.value) return;
  // input type=number entrega numero com v-model; vazio continua texto.
  const dia = (v: string | number) => (String(v).trim() ? Number(v) : null);
  salvando.value = true;
  erroForm.value = null;
  try {
    const corpo: Record<string, unknown> = { nome: form.nome };
    if (editando.value.tipo === "cartao") Object.assign(corpo, { fechamento: dia(form.fechamento), vencimento: dia(form.vencimento) });
    await api.patch(`/extratos/contas/${editando.value.id}`, corpo);
    editando.value = null;
    await recarregar();
  } catch (err) {
    erroForm.value = (err as Error).message;
  } finally {
    salvando.value = false;
  }
}

async function desligar(c: ContaBancaria) {
  if (!confirm(`Desligar ${c.nome}? Os lançamentos importados continuam, só perdem a ligação com o banco.`)) return;
  await api.del(`/extratos/contas/${c.id}`).catch((e: Error) => alert(e.message));
  await recarregar();
}

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
</script>

<template>
  <div>
    <CabecalhoSub titulo="Extratos" subtitulo="Mande o extrato ou a fatura em OFX e o Bento lança tudo, sem repetir o que você já registrou.">
      <template v-if="pode('receitas')">
        <input ref="arquivo" type="file" accept=".ofx,.OFX,application/x-ofx" class="escondido" @change="importar" />
        <button class="btn primary" :disabled="enviando" @click="arquivo?.click()">
          <AppIcon name="mais" :size="16" /> {{ enviando ? "Importando…" : "Importar extrato" }}
        </button>
      </template>
    </CabecalhoSub>

    <div v-if="!pode('receitas')" class="aviso info">Importar extrato precisa de acesso a despesas e receitas. Peça ao titular.</div>

    <template v-else>
      <AssessorBalao mesa="financas">
        a conexão automática com o banco (Open Finance) ainda não está disponível. Enquanto isso, baixe o extrato ou a fatura em <b>OFX</b> no app ou
        no site do banco (costuma ficar em "Exportar extrato") e importe aqui, ou mande o arquivo no WhatsApp. O que já foi importado não se repete.
      </AssessorBalao>

      <div v-if="erroImportar" class="aviso erro" role="alert">{{ erroImportar }}</div>
      <div v-if="resultado" class="aviso info resultado">
        <b>{{ resultado.contaBancaria.nome }}</b><template v-if="resultado.de && resultado.ate"> · {{ dataCurta(resultado.de) }} a {{ dataCurta(resultado.ate) }}</template><br />
        {{ resultado.criados }} lançamentos novos, {{ resultado.unidos }} unidos ao que você já tinha registrado, {{ resultado.ignorados }} ignorados
        (já importados, pagamento de fatura ou investimento)<template v-if="resultado.estornados">, {{ resultado.estornados }} compras estornadas</template>.
      </div>

      <StatusCarga :carregando="carregando && !dados" :erro="erro" @tentar="recarregar" />

      <template v-if="dados">
        <div class="eyebrow secao">Contas e cartões</div>
        <EstadoVazio v-if="!dados.contas.length" titulo="Nenhum extrato ainda" texto="Importe o primeiro OFX para ver a conta ou o cartão aqui." />
        <section v-else class="card lista">
          <div v-for="c in dados.contas" :key="c.id" class="list-row">
            <AppIcon :name="c.tipo === 'cartao' ? 'cartao' : 'painel'" :size="18" />
            <div class="flex1">
              <strong>{{ c.nome }}</strong>
              <div class="faint">
                {{ c.tipo === "cartao" ? "Cartão" : "Conta corrente" }}
                <template v-if="c.saldo !== null"> · {{ c.tipo === "cartao" ? "fatura" : "saldo" }} {{ brl(Math.abs(c.saldo)) }}<template v-if="c.saldoEm"> em {{ dataCurta(c.saldoEm) }}</template></template>
                <template v-if="c.tipo === 'cartao'"> · <template v-if="c.fechamento">fecha dia {{ c.fechamento }}, vence dia {{ c.vencimento }}</template><template v-else>informe fechamento e vencimento</template></template>
                <template v-if="c.ultimaImportacao"> · importado {{ quando(c.ultimaImportacao) }}</template>
              </div>
            </div>
            <span v-if="c.tipo === 'cartao' && !c.fechamento" class="chip warning">sem datas</span>
            <button class="btn ghost" @click="editar(c)">Editar</button>
            <button class="icon-btn" :aria-label="`Desligar ${c.nome}`" title="Desligar" @click="desligar(c)"><AppIcon name="lixo" :size="16" /></button>
          </div>
        </section>

        <div class="eyebrow secao">Últimas importações</div>
        <EstadoVazio v-if="!dados.importacoes.length" titulo="Nada importado" texto="As importações aparecem aqui, com o que entrou e o que foi ignorado." />
        <section v-else class="card lista">
          <div v-for="i in dados.importacoes" :key="i.id" class="list-row">
            <div class="flex1">
              <strong>{{ i.conta }}</strong>
              <div class="faint">{{ quando(i.em) }}<template v-if="i.arquivo"> · {{ i.arquivo }}</template></div>
            </div>
            <span class="faint num">+{{ i.criados }} · {{ i.unidos }} unidos · {{ i.ignorados }} ignorados<template v-if="i.estornados"> · {{ i.estornados }} estornos</template></span>
          </div>
        </section>
      </template>
    </template>

    <PainelLateral v-if="editando" :titulo="editando.nome" @fechar="editando = null">
      <label class="field"><span>Nome</span><input v-model="form.nome" class="input" maxlength="60" /></label>
      <template v-if="editando.tipo === 'cartao'">
        <div class="linha">
          <label class="field"><span>Dia do fechamento</span><input v-model="form.fechamento" class="input" type="number" min="1" max="31" /></label>
          <label class="field"><span>Dia do vencimento</span><input v-model="form.vencimento" class="input" type="number" min="1" max="31" /></label>
        </div>
        <p class="faint">Com as datas, o assessor responde "minha fatura já fechou?" e quanto está em aberto.</p>
      </template>
      <p v-if="erroForm" class="erro">{{ erroForm }}</p>
      <template #rodape>
        <button class="btn primary" :disabled="salvando" @click="salvar">{{ salvando ? "Salvando…" : "Salvar" }}</button>
        <button class="btn ghost" @click="editando = null">Cancelar</button>
      </template>
    </PainelLateral>
  </div>
</template>

<style scoped>
.escondido { display: none; }
.secao { margin: 28px 0 10px; }
.lista { padding: 4px 20px; }
.list-row { gap: 14px; }
.flex1 { flex: 1; min-width: 0; }
.flex1 strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.faint { font-size: 13px; }
.resultado { margin-top: 12px; }
.linha { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.erro { color: var(--danger); margin: 0; }
p { margin: 0; }
</style>
