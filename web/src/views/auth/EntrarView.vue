<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, ApiError, salvarSessao, type SessaoAberta } from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import AuthLayout from "./AuthLayout.vue";
import CampoSenha from "./CampoSenha.vue";

const route = useRoute();
const router = useRouter();
const email = ref(typeof route.query.email === "string" ? route.query.email : "");
const senha = ref("");
const erro = ref<string | null>(null);
const naoAtivada = ref(false);
const enviando = ref(false);

const BENEFICIOS = [
  { titulo: "Equipe de assessores no WhatsApp", texto: "gastos, lembretes e tarefas por mensagem, áudio ou foto" },
  { titulo: "Pessoas, lojas e parcelas", texto: "para quem foi cada Pix e o que já está comprometido" },
  { titulo: "Painel completo", texto: "finanças, agenda, tarefas e operação em um lugar" },
];

async function entrar() {
  erro.value = null;
  naoAtivada.value = false;
  if (!email.value.trim() || !senha.value) return (erro.value = "Preencha e-mail e senha.");
  enviando.value = true;
  try {
    const s = await api.post<SessaoAberta>("/auth/entrar", { email: email.value, senha: senha.value });
    salvarSessao(s.token);
    const volta = typeof route.query.volta === "string" && route.query.volta.startsWith("/") ? route.query.volta : "/financas";
    router.replace(volta);
  } catch (e) {
    erro.value = (e as Error).message;
    naoAtivada.value = e instanceof ApiError && e.status === 403;
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <AuthLayout antes="Bem-vindo de volta." destaque="Sua equipe já está trabalhando.">
    <template #lado>
      <ul class="beneficios">
        <li v-for="b in BENEFICIOS" :key="b.titulo">
          <span class="check"><AppIcon name="check" :size="13" /></span>
          <div><strong>{{ b.titulo }}</strong><span>{{ b.texto }}</span></div>
        </li>
      </ul>
    </template>

    <div>
      <h2 class="auth-titulo">Entrar</h2>
      <p class="sub">Use o e-mail e a senha da sua conta.</p>
    </div>

    <form class="auth-form" novalidate @submit.prevent="entrar">
      <label class="campo">
        <span class="rotulo-campo">E-mail</span>
        <input v-model="email" class="input" type="email" placeholder="voce@email.com" autocomplete="email" autofocus />
      </label>
      <div class="campo">
        <span class="rotulo-campo">
          <label for="senha-entrar">Senha</label>
          <RouterLink :to="{ path: '/esqueci', query: email ? { email } : {} }">Esqueceu?</RouterLink>
        </span>
        <CampoSenha id="senha-entrar" v-model="senha" placeholder="Sua senha" />
      </div>

      <div v-if="erro" class="aviso erro" role="alert">
        {{ erro }}
        <template v-if="naoAtivada">
          <br />
          <RouterLink class="link-aviso" :to="{ path: '/esqueci', query: { email } }">Receber um código no WhatsApp para ativar</RouterLink>
        </template>
      </div>

      <button class="btn primary btn-largo" type="submit" :disabled="enviando">{{ enviando ? "Entrando…" : "Entrar" }}</button>
    </form>

    <p class="auth-rodape">Ainda não tem conta? <RouterLink to="/criar-conta">Criar conta</RouterLink></p>
  </AuthLayout>
</template>

<style scoped>
.sub { margin: 6px 0 0; color: var(--text-2); font-size: 15px; }
.beneficios { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; }
.beneficios li { display: flex; gap: 12px; align-items: flex-start; }
.beneficios div { display: grid; gap: 2px; }
.beneficios strong { font-size: 14.5px; font-weight: 500; }
.beneficios span:not(.check) { font-size: 13px; color: var(--text-2); }
.check { width: 22px; height: 22px; border-radius: 8px; border: 1px solid var(--line-strong); color: var(--accent); display: grid; place-items: center; flex: none; margin-top: 1px; }
.link-aviso { color: inherit; text-decoration: underline; font-weight: 600; }
</style>
