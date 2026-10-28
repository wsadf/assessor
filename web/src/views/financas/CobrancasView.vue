<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { api, type ChavePix, type Cobranca, type TipoChavePix } from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import AssessorBalao from "../../components/AssessorBalao.vue";
import EstadoVazio from "../../components/EstadoVazio.vue";
import PainelLateral from "../../components/PainelLateral.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import { brl, dataCurta } from "../../format";
import { pode, useCarregar } from "../../estado";
import CabecalhoSub from "./CabecalhoSub.vue";

const TIPOS: Record<TipoChavePix, string> = { cpf: "CPF", cnpj: "CNPJ", email: "E-mail", telefone: "Celular", aleatoria: "Chave aleatória" };
const SITUACAO = { aberta: "em aberto", paga: "paga", cancelada: "cancelada" } as const;

const filtro = ref<"" | "aberta" | "paga" | "cancelada">("");
const { dados, carregando, erro, recarregar } = useCarregar(
  () => (pode("receitas") ? api.get<{ chave: ChavePix | null; cobrancas: Cobranca[] }>("/cobrancas", { situacao: filtro.value }) : Promise.resolve(null)),
  [filtro],
);
const abertas = computed(() => (dados.value?.cobrancas ?? []).filter((c) => c.situacao === "aberta"));
const totalAberto = computed(() => abertas.value.reduce((s, c) => s + c.valor, 0));

type Painel = { modo: "chave" } | { modo: "nova" } | { modo: "criada"; cobranca: Cobranca };
const painel = ref<Painel | null>(null);
const erroForm = ref<string | null>(null);
const salvando = ref(false);
const copiado = ref<string | null>(null);
const chaveForm = reactive({ tipo: "cpf" as TipoChavePix, chave: "", nome: "", cidade: "" });
const nova = reactive({ pagador: "", whatsapp: "", descricao: "", valor: "", vencimento: "" });

function abrirChave() {
  const c = dados.value?.chave;
  Object.assign(chaveForm, c ? { ...c } : { tipo: "cpf", chave: "", nome: "", cidade: "" });
  erroForm.value = null;
  painel.value = { modo: "chave" };
}

function abrirNova() {
  Object.assign(nova, { pagador: "", whatsapp: "", descricao: "", valor: "", vencimento: "" });
  erroForm.value = null;
  painel.value = { modo: "nova" };
}

async function salvarChave() {
  salvando.value = true;
  erroForm.value = null;
  try {
    await api.put("/cobrancas/chave", chaveForm);
    painel.value = null;
    await recarregar();
  } catch (e) {
    erroForm.value = (e as Error).message;
  } finally {
    salvando.value = false;
  }
}

// Sem PAINEL_URL no servidor o link vem relativo; o cliente precisa do endereco inteiro.
const completo = (link: string) => (link.startsWith("/") ? `${location.origin}${link}` : link);

const numero = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

async function criar() {
  erroForm.value = null;
  const valor = numero(nova.valor);
  if (!nova.pagador.trim() || !nova.descricao.trim() || !(valor > 0)) return (erroForm.value = "Informe quem paga, o que é e o valor.");
  salvando.value = true;
  try {
    const c = await api.post<Cobranca>("/cobrancas", {
      pagador: nova.pagador,
      whatsapp: nova.whatsapp.trim() || null,
      descricao: nova.descricao,
      valor,
      vencimento: nova.vencimento || null,
    });
    painel.value = { modo: "criada", cobranca: c };
    await recarregar();
  } catch (e) {
    erroForm.value = (e as Error).message;
  } finally {
    salvando.value = false;
  }
}

async function copiar(texto: string, qual: string) {
  try {
    await navigator.clipboard.writeText(texto);
    copiado.value = qual;
    setTimeout(() => (copiado.value = null), 2000);
  } catch {
    // Sem permissao de area de transferencia: o texto continua visivel para copiar a mao.
  }
}

async function recebi(c: Cobranca) {
  if (!confirm(`Confirmar que ${c.pagador} pagou ${brl(c.valor)}? A receita é lançada em Finanças.`)) return;
  await api.post(`/cobrancas/${c.id}/recebida`, {}).catch((e: Error) => alert(e.message));
  await recarregar();
}

async function cancelar(c: Cobranca) {
  if (!confirm(`Cancelar a cobrança de ${c.pagador}? O código Pix já enviado continua pagável: se o pagamento cair, avise o cliente ou devolva pelo banco.`)) return;
  await api.del(`/cobrancas/${c.id}`).catch((e: Error) => alert(e.message));
  await recarregar();
}
</script>

<template>
  <div>
    <CabecalhoSub titulo="Cobranças" subtitulo="Cobre seus clientes por Pix na sua chave. O dinheiro vai direto para a sua conta.">
      <template v-if="pode('receitas') && dados">
        <button class="btn" @click="abrirChave"><AppIcon name="editar" :size="16" /> {{ dados.chave ? "Chave Pix" : "Cadastrar chave Pix" }}</button>
        <button class="btn primary" :disabled="!dados.chave" @click="abrirNova"><AppIcon name="mais" :size="16" /> Nova cobrança</button>
      </template>
    </CabecalhoSub>

    <div v-if="!pode('receitas')" class="aviso info">Cobranças precisam de acesso às receitas. Peça ao titular.</div>

    <template v-else>
      <StatusCarga :carregando="carregando && !dados" :erro="erro" @tentar="recarregar" />

      <template v-if="dados">
        <AssessorBalao mesa="financas">
          <template v-if="!dados.chave">cadastre a sua chave Pix para começar. Eu monto o código e o link; o pagamento cai direto no seu banco, sem passar por aqui.</template>
          <template v-else-if="abertas.length"><b>{{ brl(totalAberto) }}</b> em {{ abertas.length }} {{ abertas.length === 1 ? "cobrança aberta" : "cobranças abertas" }}. Quando o cliente pagar, me avise ou importe o extrato que eu marco.</template>
          <template v-else>nenhuma cobrança em aberto. No WhatsApp é só pedir: “cobra R$ 850 do João pela consultoria de agosto”.</template>
          A emissão de nota fiscal ainda não está disponível: por enquanto, emita no site da prefeitura ou com o seu contador.
        </AssessorBalao>

        <div v-if="dados.chave" class="faint chave">
          Chave {{ TIPOS[dados.chave.tipo] }}: <b>{{ dados.chave.chave }}</b> · {{ dados.chave.nome }} · {{ dados.chave.cidade }}
        </div>

        <div class="filtros">
          <select v-model="filtro" class="input" aria-label="Situação">
            <option value="">Todas</option>
            <option value="aberta">Em aberto</option>
            <option value="paga">Pagas</option>
            <option value="cancelada">Canceladas</option>
          </select>
        </div>

        <EstadoVazio v-if="!dados.cobrancas.length" titulo="Nenhuma cobrança" texto="As cobranças que você criar aparecem aqui." />
        <section v-else class="card lista">
          <div v-for="c in dados.cobrancas" :key="c.id" class="list-row">
            <div class="flex1">
              <strong>{{ c.pagador }} · {{ brl(c.valor) }}</strong>
              <div class="faint">
                {{ c.descricao }}<template v-if="c.vencimento"> · vence {{ dataCurta(c.vencimento) }}</template>
                <template v-if="c.pagaEm"> · paga em {{ dataCurta(c.pagaEm) }}<template v-if="c.pagaPor === 'extrato'"> (pelo extrato)</template></template>
              </div>
            </div>
            <span v-if="c.vencida" class="chip warning">vencida</span>
            <span v-else class="chip" :class="c.situacao === 'paga' ? 'ok' : ''">{{ SITUACAO[c.situacao] }}</span>
            <template v-if="c.situacao === 'aberta'">
              <button class="btn ghost" @click="copiar(completo(c.link), `link${c.id}`)">{{ copiado === `link${c.id}` ? "Copiado" : "Copiar link" }}</button>
              <button class="btn ghost" @click="recebi(c)">Recebi</button>
              <button class="icon-btn" :aria-label="`Cancelar cobrança de ${c.pagador}`" title="Cancelar" @click="cancelar(c)"><AppIcon name="lixo" :size="16" /></button>
            </template>
          </div>
        </section>
      </template>
    </template>

    <PainelLateral v-if="painel?.modo === 'chave'" titulo="Chave Pix" @fechar="painel = null">
      <label class="field">
        <span>Tipo</span>
        <select v-model="chaveForm.tipo" class="input">
          <option v-for="(nome, t) in TIPOS" :key="t" :value="t">{{ nome }}</option>
        </select>
      </label>
      <label class="field"><span>Chave</span><input v-model="chaveForm.chave" class="input" autocomplete="off" /></label>
      <label class="field"><span>Nome do recebedor (como no banco)</span><input v-model="chaveForm.nome" class="input" maxlength="60" /></label>
      <label class="field"><span>Cidade</span><input v-model="chaveForm.cidade" class="input" maxlength="40" /></label>
      <p class="faint">O código Pix leva nome e cidade sem acento, até 25 e 15 letras. O app do banco de quem paga mostra o nome antes de confirmar.</p>
      <p v-if="erroForm" class="erro">{{ erroForm }}</p>
      <template #rodape>
        <button class="btn primary" :disabled="salvando" @click="salvarChave">{{ salvando ? "Salvando…" : "Salvar chave" }}</button>
        <button class="btn ghost" @click="painel = null">Cancelar</button>
      </template>
    </PainelLateral>

    <PainelLateral v-if="painel?.modo === 'nova'" titulo="Nova cobrança" @fechar="painel = null">
      <label class="field"><span>Quem paga</span><input v-model="nova.pagador" class="input" maxlength="60" placeholder="Ex.: João Silva" /></label>
      <label class="field"><span>O que é</span><input v-model="nova.descricao" class="input" maxlength="72" placeholder="Ex.: Consultoria de agosto" /></label>
      <div class="linha">
        <label class="field"><span>Valor (R$)</span><input v-model="nova.valor" class="input num" inputmode="decimal" placeholder="850,00" /></label>
        <label class="field"><span>Vencimento</span><input v-model="nova.vencimento" class="input" type="date" /></label>
      </div>
      <label class="field"><span>WhatsApp de quem paga (opcional)</span><input v-model="nova.whatsapp" class="input" type="tel" placeholder="(11) 91234-5678" /></label>
      <p v-if="erroForm" class="erro">{{ erroForm }}</p>
      <template #rodape>
        <button class="btn primary" :disabled="salvando" @click="criar">{{ salvando ? "Criando…" : "Criar cobrança" }}</button>
        <button class="btn ghost" @click="painel = null">Cancelar</button>
      </template>
    </PainelLateral>

    <PainelLateral v-if="painel?.modo === 'criada'" titulo="Cobrança criada" @fechar="painel = null">
      <div class="aviso info">
        <b>{{ painel.cobranca.pagador }}</b> · {{ brl(painel.cobranca.valor) }} · {{ painel.cobranca.descricao }}. Mande o link: o cliente vê o QR e o copia-e-cola.
      </div>
      <label class="field"><span>Link de pagamento</span><input class="input" :value="completo(painel.cobranca.link)" readonly /></label>
      <label class="field"><span>Copia-e-cola</span><textarea class="input codigo" rows="4" :value="painel.cobranca.copiaECola" readonly /></label>
      <template #rodape>
        <a class="btn primary" :href="`https://wa.me/?text=${encodeURIComponent(`${painel.cobranca.descricao}: ${brl(painel.cobranca.valor)}. Pague pelo Pix: ${completo(painel.cobranca.link)}`)}`" target="_blank" rel="noopener">Enviar no WhatsApp</a>
        <button class="btn" @click="copiar(completo(painel.cobranca.link), 'novo')">{{ copiado === "novo" ? "Copiado" : "Copiar link" }}</button>
        <button class="btn ghost" @click="copiar(painel.cobranca.copiaECola, 'codigo')">{{ copiado === "codigo" ? "Copiado" : "Copiar código" }}</button>
      </template>
    </PainelLateral>
  </div>
</template>

<style scoped>
.chave { margin: 12px 0 0; }
.chave b { color: var(--text); font-weight: 600; }
.filtros { display: flex; justify-content: flex-end; margin: 20px 0 10px; }
.filtros .input { width: auto; min-width: 160px; }
.lista { padding: 4px 20px; }
.list-row { gap: 12px; flex-wrap: wrap; }
.flex1 { flex: 1; min-width: 200px; }
.flex1 strong { display: block; }
.faint { font-size: 13px; }
.linha { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.codigo { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; resize: none; height: auto; }
.erro { color: var(--danger); margin: 0; }
p { margin: 0; }
</style>
