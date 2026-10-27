<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, salvarSessao, type SessaoAberta } from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import AuthLayout from "./AuthLayout.vue";
import CampoSenha from "./CampoSenha.vue";
import CodigoOTP from "./CodigoOTP.vue";

const route = useRoute();
const router = useRouter();
const etapa = ref<"email" | "codigo">("email");
const email = ref(typeof route.query.email === "string" ? route.query.email : "");
const codigo = ref("");
const senha = ref("");
const erro = ref<string | null>(null);
const enviando = ref(false);

async function pedirCodigo() {
  erro.value = null;
  if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) return (erro.value = "Confira o e-mail.");
  enviando.value = true;
  try {
    await api.post("/auth/esqueci", { email: email.value });
    etapa.value = "codigo";
  } catch (e) {
    erro.value = (e as Error).message;
  } finally {
    enviando.value = false;
  }
}

async function redefinir() {
  erro.value = null;
  if (codigo.value.length !== 6) return (erro.value = "Digite os 6 números do código.");
  if (senha.value.length < 8) return (erro.value = "A nova senha precisa de pelo menos 8 caracteres.");
  enviando.value = true;
  try {
    const s = await api.post<SessaoAberta>("/auth/redefinir", { email: email.value, codigo: codigo.value, senha: senha.value });
    salvarSessao(s.token);
    router.replace("/financas");
  } catch (e) {
    erro.value = (e as Error).message;
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <AuthLayout antes="Acontece com todo mundo." destaque="A gente resolve pelo WhatsApp.">
    <template #lado>
      <ol class="como">
        <li><span>1</span> Você informa o e-mail da conta</li>
        <li><span>2</span> O código chega no WhatsApp cadastrado</li>
        <li><span>3</span> Você cria uma senha nova e já entra</li>
      </ol>
    </template>

    <div>
      <h2 class="auth-titulo">{{ etapa === "email" ? "Esqueceu a senha?" : "Crie uma senha nova" }}</h2>
      <p class="auth-frase">
        <template v-if="etapa === 'email'">“Me diz o e-mail que <b>eu mando um código</b> no seu WhatsApp.”</template>
        <template v-else>“Se o e-mail tiver conta, o código <b>já está a caminho</b>.”</template>
      </p>
    </div>

    <form v-if="etapa === 'email'" class="auth-form" novalidate @submit.prevent="pedirCodigo">
      <label class="campo">
        <span class="rotulo-campo">E-mail da conta</span>
        <input v-model="email" class="input" type="email" placeholder="voce@email.com" autocomplete="email" autofocus />
      </label>
      <div v-if="erro" class="aviso erro" role="alert">{{ erro }}</div>
      <button class="btn primary btn-largo" type="submit" :disabled="enviando">
        {{ enviando ? "Enviando…" : "Enviar código no WhatsApp" }} <AppIcon name="seta" :size="16" />
      </button>
    </form>

    <form v-else class="auth-form" novalidate @submit.prevent="redefinir">
      <div class="aviso info">
        Digite o código de 6 números. Sem o WhatsApp configurado no servidor, ele aparece no terminal onde o painel está rodando.
      </div>
      <CodigoOTP v-model="codigo" />
      <div class="campo">
        <label class="rotulo-campo" for="senha-redefinir">Nova senha</label>
        <CampoSenha id="senha-redefinir" v-model="senha" placeholder="Mínimo 8 caracteres" mostrar-forca autocomplete="new-password" />
      </div>
      <div v-if="erro" class="aviso erro" role="alert">{{ erro }}</div>
      <button class="btn primary btn-largo" type="submit" :disabled="enviando">{{ enviando ? "Salvando…" : "Salvar e entrar" }}</button>
      <button class="btn ghost" type="button" @click="etapa = 'email'">Usar outro e-mail</button>
    </form>

    <p class="auth-rodape">Lembrou? <RouterLink to="/entrar">Voltar para entrar</RouterLink></p>
  </AuthLayout>
</template>

<style scoped>
.como { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; color: #d6d6dc; }
.como li { display: flex; gap: 12px; align-items: center; font-size: 15px; }
.como span { width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid #34d399; color: #34d399; display: grid; place-items: center; font-size: 12px; font-weight: 600; flex: none; }
</style>
