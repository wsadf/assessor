<script setup lang="ts">
import QRCode from "qrcode";
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { ApiError, pagar, type CobrancaPublica } from "../api";
import { brl, dataCurta } from "../format";
import AuthLayout from "./auth/AuthLayout.vue";

const slug = String(useRoute().params.slug);
const cobranca = ref<CobrancaPublica | null>(null);
const qr = ref<string | null>(null);
const naoAchei = ref(false);
const erro = ref<string | null>(null);
const copiado = ref(false);

onMounted(async () => {
  try {
    cobranca.value = await pagar(slug);
    if (cobranca.value.copiaECola) qr.value = await QRCode.toDataURL(cobranca.value.copiaECola, { margin: 1, width: 260 });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) naoAchei.value = true;
    else erro.value = (e as Error).message;
  }
});

async function copiar() {
  try {
    await navigator.clipboard.writeText(cobranca.value!.copiaECola!);
    copiado.value = true;
    setTimeout(() => (copiado.value = false), 2000);
  } catch {
    // Sem permissao de area de transferencia: o codigo continua visivel para copiar a mao.
  }
}
</script>

<template>
  <AuthLayout
    cliente
    antes="Pagamento por Pix para"
    :destaque="cobranca?.recebedor || 'quem te cobrou'"
    depois="."
    rodape="O Pix vai direto do seu banco para o de quem cobrou"
  >
    <template #lado>
      <ol class="como">
        <li><span>1</span> Abra o app do seu banco na área Pix</li>
        <li><span>2</span> Leia o QR ou cole o código</li>
        <li><span>3</span> Confira o nome e o valor e confirme</li>
      </ol>
    </template>

    <div v-if="naoAchei">
      <h2 class="auth-titulo">Cobrança não encontrada</h2>
      <p class="auth-frase">Este link não existe. Confira com quem te cobrou.</p>
    </div>

    <div v-else-if="erro" class="aviso erro" role="alert">{{ erro }}</div>

    <template v-else-if="cobranca">
      <div>
        <h2 class="auth-titulo">{{ cobranca.descricao }}</h2>
        <p class="auth-frase">{{ cobranca.recebedor }}</p>
      </div>

      <div v-if="cobranca.situacao === 'paga'" class="aviso info">Esta cobrança já foi paga. Obrigado!</div>
      <div v-else-if="cobranca.situacao === 'cancelada'" class="aviso info">Esta cobrança foi cancelada. Fale com {{ cobranca.recebedor }} se tiver dúvida.</div>

      <template v-else>
        <div class="valor num">{{ brl(cobranca.valor ?? 0) }}</div>
        <p v-if="cobranca.vencimento" class="faint centro">Vence {{ dataCurta(cobranca.vencimento) }}</p>
        <img v-if="qr" class="qr" :src="qr" alt="QR code do Pix" width="260" height="260" />
        <label class="campo">
          <span class="rotulo-campo">Pix copia-e-cola</span>
          <textarea class="input codigo" rows="4" :value="cobranca.copiaECola" readonly />
        </label>
        <button class="btn primary btn-largo" @click="copiar">{{ copiado ? "Código copiado" : "Copiar código Pix" }}</button>
        <p class="faint aviso-pix">O pagamento vai direto para {{ cobranca.recebedor }} pelo Pix. Este site não recebe dinheiro.</p>
      </template>
    </template>

    <div v-else class="faint">Carregando…</div>
  </AuthLayout>
</template>

<style scoped>
.como { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; color: #d6d6dc; }
.como li { display: flex; gap: 12px; align-items: center; font-size: 15px; }
.como span { width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid var(--accent); color: var(--accent); display: grid; place-items: center; font-size: 12px; font-weight: 600; flex: none; }
.valor { font-size: 36px; font-weight: 700; text-align: center; }
.centro { text-align: center; margin: 0; }
.qr { display: block; margin: 0 auto; border-radius: 12px; background: #fff; padding: 8px; max-width: 100%; height: auto; }
.codigo { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; resize: none; height: auto; }
.aviso-pix { text-align: center; margin: 0; }
</style>
