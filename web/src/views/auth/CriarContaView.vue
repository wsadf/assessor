<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, PERFIS, salvarSessao, type ConviteValidado, type SessaoAberta } from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import AuthLayout from "./AuthLayout.vue";
import CampoSenha from "./CampoSenha.vue";
import CodigoOTP from "./CodigoOTP.vue";

const router = useRouter();

const PASSOS = [
  { titulo: "Quem é você", texto: "nome, WhatsApp e e-mail" },
  { titulo: "Seu plano", texto: "mensal ou anual" },
  { titulo: "Pagamento", texto: "7 dias grátis, sem cartão" },
  { titulo: "Ativação", texto: "código no WhatsApp" },
];
const PAISES = [
  { sigla: "BR", ddi: "55" },
  { sigla: "PT", ddi: "351" },
  { sigla: "US", ddi: "1" },
  { sigla: "AR", ddi: "54" },
  { sigla: "UY", ddi: "598" },
  { sigla: "PY", ddi: "595" },
  { sigla: "CL", ddi: "56" },
  { sigla: "CO", ddi: "57" },
  { sigla: "MX", ddi: "52" },
  { sigla: "ES", ddi: "34" },
  { sigla: "GB", ddi: "44" },
  { sigla: "AO", ddi: "244" },
  { sigla: "MZ", ddi: "258" },
];
const PLANOS = [
  { id: "mensal", nome: "Mensal", preco: "R$ 29,90", sufixo: "/mês", detalhe: "cancele quando quiser" },
  { id: "anual", nome: "Anual", preco: "R$ 24,90", sufixo: "/mês", detalhe: "R$ 298,80 por ano · economize 17%", selo: "mais escolhido" },
] as const;

const passo = ref(0);
const route = useRoute();
// A landing manda ?plano=mensal quando a pessoa clica no plano mensal.
const planoInicial = route.query.plano === "mensal" ? "mensal" : "anual";

// Quem entra por convite usa a conta (e o plano) de quem convidou: pula plano e pagamento.
const temConvite = ref(typeof route.query.convite === "string");
const convite = ref(typeof route.query.convite === "string" ? route.query.convite : "");
const conviteInfo = ref<ConviteValidado | null>(null);
watch([convite, temConvite], () => (conviteInfo.value = null));
const form = reactive({ nome: "", ddi: "55", whatsapp: "", email: "", senha: "", aceite: true, plano: planoInicial as "mensal" | "anual" });
const erro = ref<string | null>(null);
const enviando = ref(false);
const telefoneCompleto = computed(() => form.ddi + form.whatsapp.replace(/\D/g, ""));

/** Mascara brasileira; para outros paises fica so com digitos. */
function mascarar(e: Event) {
  const d = (e.target as HTMLInputElement).value.replace(/\D/g, "").slice(0, 11);
  if (form.ddi !== "55") return (form.whatsapp = d);
  form.whatsapp = d.length <= 2 ? d : d.length <= 7 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function validarPasso1(): string | null {
  if (form.nome.trim().length < 2) return "Diga como podemos te chamar.";
  const digitos = form.whatsapp.replace(/\D/g, "");
  if (form.ddi === "55" ? digitos.length < 10 : digitos.length < 6) return "Confira o número do WhatsApp, com DDD.";
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return "Confira o e-mail.";
  if (form.senha.length < 8) return "A senha precisa de pelo menos 8 caracteres.";
  if (!form.aceite) return "Para continuar, aceite os Termos de Uso e a Política de Privacidade.";
  return null;
}

async function avancar() {
  erro.value = passo.value === 0 ? validarPasso1() : null;
  if (erro.value) return;
  if (passo.value === 0 && temConvite.value) {
    if (!convite.value.trim()) return (erro.value = "Digite o código de convite ou desmarque a opção.");
    if (conviteInfo.value) return criarConta();
    enviando.value = true;
    try {
      conviteInfo.value = await api.post<ConviteValidado>("/auth/convite", { codigo: convite.value, telefone: telefoneCompleto.value });
    } catch (e) {
      erro.value = (e as Error).message;
    } finally {
      enviando.value = false;
    }
    return;
  }
  passo.value++;
}

const canal = ref<"whatsapp" | "terminal">("whatsapp");
const telefoneMascarado = ref("");
const codigo = ref("");
const espera = ref(0);
let relogio: ReturnType<typeof setInterval> | undefined;
function contarEspera() {
  espera.value = 30;
  clearInterval(relogio);
  relogio = setInterval(() => (espera.value = Math.max(0, espera.value - 1)), 1000);
}
onBeforeUnmount(() => clearInterval(relogio));

async function criarConta() {
  erro.value = null;
  enviando.value = true;
  try {
    const r = await api.post<{ telefoneMascarado: string; canal: "whatsapp" | "terminal" }>("/auth/cadastro", {
      nome: form.nome,
      telefone: telefoneCompleto.value,
      email: form.email,
      senha: form.senha,
      ...(temConvite.value ? { convite: convite.value } : { plano: form.plano }),
    });
    canal.value = r.canal;
    telefoneMascarado.value = r.telefoneMascarado;
    passo.value = 3;
    contarEspera();
  } catch (e) {
    erro.value = (e as Error).message;
  } finally {
    enviando.value = false;
  }
}

async function reenviar() {
  erro.value = null;
  try {
    const r = await api.post<{ canal: "whatsapp" | "terminal" }>("/auth/reenviar", { telefone: telefoneCompleto.value });
    canal.value = r.canal;
    codigo.value = "";
    contarEspera();
  } catch (e) {
    erro.value = (e as Error).message;
  }
}

async function ativar() {
  if (enviando.value) return;
  if (codigo.value.length !== 6) return (erro.value = "Digite os 6 números do código.");
  erro.value = null;
  enviando.value = true;
  try {
    const s = await api.post<SessaoAberta>("/auth/ativar", { telefone: telefoneCompleto.value, codigo: codigo.value });
    salvarSessao(s.token);
    if (s.aviso) alert(s.aviso);
    router.replace("/financas");
  } catch (e) {
    erro.value = (e as Error).message;
  } finally {
    enviando.value = false;
  }
}

const FRASES = [
  { titulo: "Vamos montar sua equipe.", frase: "Me conta quem você é, <b>o resto é com a gente</b>." },
  { titulo: "Escolha seu plano.", frase: "Os dois liberam <b>todos os assessores</b>, sem limite." },
  { titulo: "Pagamento", frase: "Primeiro você testa, <b>depois decide</b>." },
  { titulo: "Ative pelo WhatsApp.", frase: "Um código confirma que <b>o número é seu</b>." },
];
</script>

<template>
  <AuthLayout antes="Sua rotina" destaque="sob controle" depois=", direto do WhatsApp.">
    <template #lado>
      <ol class="passos">
        <li v-for="(p, i) in PASSOS" :key="p.titulo" :class="{ atual: i === passo, feito: i < passo }">
          <span class="num">
            <AppIcon v-if="i < passo" name="check" :size="12" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <div><strong>{{ p.titulo }}</strong><span>{{ p.texto }}</span></div>
        </li>
      </ol>
    </template>

    <div class="progresso" :aria-label="`Passo ${passo + 1} de 4`">
      <span v-for="i in 4" :key="i" :class="{ cheio: i <= passo + 1 }" />
      <small>passo {{ passo + 1 }}/4</small>
    </div>

    <div>
      <h2 class="auth-titulo">{{ FRASES[passo].titulo }}</h2>
      <p class="auth-frase" v-html="`“${FRASES[passo].frase}”`" />
    </div>

    <!-- Passo 1: quem e voce -->
    <form v-if="passo === 0" class="auth-form" novalidate @submit.prevent="avancar">
      <label class="campo">
        <span class="rotulo-campo">Seu nome</span>
        <input v-model="form.nome" class="input" placeholder="Como podemos te chamar?" autocomplete="given-name" autofocus />
      </label>
      <label class="campo">
        <span class="rotulo-campo">WhatsApp <em>é onde seu assessor trabalha</em></span>
        <span class="telefone">
          <select v-model="form.ddi" class="input ddi" aria-label="País">
            <option v-for="p in PAISES" :key="p.sigla" :value="p.ddi">{{ p.sigla }} +{{ p.ddi }}</option>
          </select>
          <input :value="form.whatsapp" class="input" inputmode="tel" :placeholder="form.ddi === '55' ? '(11) 99999-0000' : 'número com código de área'" autocomplete="tel-national" @input="mascarar" />
        </span>
      </label>
      <label class="campo">
        <span class="rotulo-campo">E-mail <em>seu acesso ao painel</em></span>
        <input v-model="form.email" class="input" type="email" placeholder="voce@exemplo.com" autocomplete="email" />
      </label>
      <div class="campo">
        <label class="rotulo-campo" for="senha-nova">Crie sua senha <em>para entrar no painel</em></label>
        <CampoSenha id="senha-nova" v-model="form.senha" placeholder="Mínimo 8 caracteres" mostrar-forca autocomplete="new-password" />
      </div>
      <label class="aceite">
        <input v-model="form.aceite" type="checkbox" />
        <span>Ao continuar, você aceita os Termos de Uso e a Política de Privacidade.</span>
      </label>
      <label class="aceite">
        <input v-model="temConvite" type="checkbox" />
        <span>Tenho um código de convite para entrar na conta de alguém</span>
      </label>
      <label v-if="temConvite" class="campo">
        <span class="rotulo-campo">Código de convite <em>quem te convidou mandou</em></span>
        <input v-model="convite" class="input codigo" placeholder="CONV-XXXXXX" autocapitalize="characters" autocomplete="off" />
      </label>
      <div v-if="conviteInfo" class="aviso info">
        Você vai entrar na conta de <b>{{ conviteInfo.titular ?? "quem te convidou" }}</b> com o perfil
        <b>{{ PERFIS[conviteInfo.perfil].nome.toLowerCase() }}</b>: {{ PERFIS[conviteInfo.perfil].detalhe }}. Sem plano nem pagamento.
        <template v-if="conviteInfo.temDadosProprios">
          O que você já registrou com este WhatsApp fica guardado à parte e volta se você sair da conta.
        </template>
      </div>
      <div v-if="erro" class="aviso erro" role="alert">{{ erro }}</div>
      <button class="btn primary btn-largo" type="submit" :disabled="enviando">
        <template v-if="conviteInfo">{{ enviando ? "Criando…" : "Criar conta e receber código" }}</template>
        <template v-else>{{ enviando ? "Conferindo…" : "Continuar" }} <AppIcon name="seta" :size="16" /></template>
      </button>
    </form>

    <!-- Passo 2: plano -->
    <div v-else-if="passo === 1" class="auth-form">
      <button
        v-for="p in PLANOS"
        :key="p.id"
        type="button"
        class="plano"
        :class="{ escolhido: form.plano === p.id }"
        :aria-pressed="form.plano === p.id"
        @click="form.plano = p.id"
      >
        <span class="radio" />
        <span class="corpo">
          <strong>{{ p.nome }} <span v-if="'selo' in p" class="chip ok">{{ p.selo }}</span></strong>
          <small>{{ p.detalhe }}</small>
        </span>
        <span class="preco"><b class="num">{{ p.preco }}</b>{{ p.sufixo }}</span>
      </button>
      <ul class="inclui">
        <li><AppIcon name="check" :size="14" /> Todos os assessores no seu WhatsApp</li>
        <li><AppIcon name="check" :size="14" /> Painel completo com as seis mesas</li>
        <li><AppIcon name="check" :size="14" /> Família ou sócio na mesma conta, sem custo extra</li>
      </ul>
      <div class="acoes">
        <button class="btn ghost" type="button" @click="passo = 0">Voltar</button>
        <button class="btn primary btn-largo" type="button" @click="avancar">Continuar <AppIcon name="seta" :size="16" /></button>
      </div>
    </div>

    <!-- Passo 3: pagamento -->
    <div v-else-if="passo === 2" class="auth-form">
      <div class="card teste">
        <span class="chip ok">7 dias grátis</span>
        <strong>Comece sem cartão</strong>
        <p class="muted">
          Você usa tudo por 7 dias. A cobrança ainda não está ligada neste MVP, então nenhum dado de pagamento é pedido agora.
          Depois do teste, você escolhe entre cartão ou Pix.
        </p>
        <div class="resumo">
          <span>Plano {{ form.plano }}</span>
          <b class="num">{{ PLANOS.find((p) => p.id === form.plano)?.preco }}{{ PLANOS.find((p) => p.id === form.plano)?.sufixo }}</b>
        </div>
        <div class="resumo"><span>Hoje</span><b class="num pos">R$ 0,00</b></div>
      </div>
      <div v-if="erro" class="aviso erro" role="alert">{{ erro }}</div>
      <div class="acoes">
        <button class="btn ghost" type="button" @click="passo = 1">Voltar</button>
        <button class="btn primary btn-largo" type="button" :disabled="enviando" @click="criarConta">
          {{ enviando ? "Criando…" : "Criar conta e receber código" }}
        </button>
      </div>
    </div>

    <!-- Passo 4: ativacao -->
    <form v-else class="auth-form" novalidate @submit.prevent="ativar">
      <div v-if="canal === 'whatsapp'" class="aviso info">Enviamos um código de 6 números no WhatsApp <b class="num">{{ telefoneMascarado }}</b>.</div>
      <div v-else class="aviso info">
        O WhatsApp ainda não está configurado neste servidor, então o código para <b class="num">{{ telefoneMascarado }}</b> apareceu no
        <b>terminal onde o painel está rodando</b>.
      </div>
      <CodigoOTP v-model="codigo" @completo="ativar" />
      <div v-if="erro" class="aviso erro" role="alert">{{ erro }}</div>
      <button class="btn primary btn-largo" type="submit" :disabled="enviando">{{ enviando ? "Ativando…" : "Ativar e entrar" }}</button>
      <p class="reenviar">
        Não chegou?
        <button type="button" :disabled="espera > 0" @click="reenviar">{{ espera ? `Reenviar em ${espera}s` : "Reenviar código" }}</button>
      </p>
    </form>

    <p class="auth-rodape">Já tem conta? <RouterLink to="/entrar">Entrar no painel</RouterLink></p>
  </AuthLayout>
</template>

<style scoped>
.passos { list-style: none; margin: 0; padding: 0; display: grid; gap: 18px; }
.passos li { display: flex; gap: 14px; align-items: flex-start; opacity: 0.5; transition: opacity 0.2s; }
.passos li.atual, .passos li.feito { opacity: 1; }
.passos div { display: grid; gap: 2px; }
.passos strong { font-size: 15px; }
.passos div span { font-size: 13px; color: #a4a4ae; }
.num { width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid #4a4a52; display: grid; place-items: center; font-size: 12px; font-weight: 600; flex: none; }
.passos li.atual .num { border-color: #34d399; color: #34d399; box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.15); }
.passos li.feito .num { background: #10b981; border-color: #10b981; color: #06140f; }
.progresso { display: grid; grid-template-columns: repeat(4, 1fr) auto; gap: 8px; align-items: center; }
.progresso span { height: 4px; border-radius: 4px; background: var(--line-strong); transition: background 0.25s; }
.progresso span.cheio { background: var(--accent); }
.progresso small { color: var(--text-3); font-size: 12px; padding-left: 6px; }
.telefone { display: grid; grid-template-columns: 112px 1fr; gap: 8px; }
.ddi { padding: 0 8px; }
.codigo { text-transform: uppercase; letter-spacing: 0.08em; }
.aceite { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; color: var(--text-2); cursor: pointer; }
.aceite input { margin-top: 2px; accent-color: var(--accent); width: 16px; height: 16px; }
.plano {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 18px;
  border-radius: 14px;
  border: 1.5px solid var(--line-strong);
  background: var(--surface);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
.plano:hover { border-color: var(--text-3); }
.plano.escolhido { border-color: var(--accent); background: var(--accent-soft); }
.radio { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--line-strong); }
.plano.escolhido .radio { border-color: var(--accent); box-shadow: inset 0 0 0 4px var(--surface), inset 0 0 0 9px var(--accent); }
.corpo { display: grid; gap: 2px; }
.corpo strong { display: flex; align-items: center; gap: 8px; font-size: 16px; }
.corpo small { color: var(--text-2); }
.preco { font-size: 13px; color: var(--text-2); white-space: nowrap; }
.preco b { font-size: 20px; color: var(--text); }
.inclui { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: 14px; color: var(--text-2); }
.inclui li { display: flex; gap: 8px; align-items: center; }
.inclui :deep(svg) { color: var(--accent); }
.acoes { display: grid; grid-template-columns: auto 1fr; gap: 10px; }
.acoes .btn-largo { width: 100%; }
.acoes .ghost { height: 48px; }
.teste { padding: 20px; display: grid; gap: 10px; }
.teste .chip { justify-self: start; }
.teste p { margin: 0; font-size: 14px; }
.resumo { display: flex; justify-content: space-between; gap: 12px; padding-top: 10px; border-top: 1px solid var(--line); font-size: 14px; }
.resumo span { text-transform: capitalize; }
.resumo b,
.aviso b { white-space: nowrap; }
.reenviar { margin: 0; text-align: center; font-size: 14px; color: var(--text-2); }
.reenviar button { border: 0; background: none; color: var(--accent); cursor: pointer; font-weight: 600; padding: 0 0 0 4px; }
.reenviar button:disabled { color: var(--text-3); cursor: default; font-weight: 400; }
</style>
