<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { mesaPorId } from "../mesas";

const props = defineProps<{ numero: string | null; mesa: string }>();

// Logo oficial do WhatsApp (Simple Icons, CC0), sem alteracao de forma.
const LOGO =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";

// Mensagem inicial ja falando com o assessor da mesa aberta.
const ASSUNTO: Record<string, string> = {
  financas: "minhas finanças",
  fiscal: "notas e faturamento",
  agenda: "minha agenda",
  tarefas: "minhas tarefas",
  operacao: "a minha conta",
  pesquisas: "uma pesquisa",
};

const link = computed(() => {
  if (!props.numero) return null;
  const m = mesaPorId(props.mesa);
  const texto = `Oi, ${m.assessor}! Quero falar sobre ${ASSUNTO[m.id] ?? "o assessor"}.`;
  return `https://wa.me/${props.numero}?text=${encodeURIComponent(texto)}`;
});

const ajuda = ref(false);
const raiz = ref<HTMLElement | null>(null);
const fora = (e: MouseEvent) => {
  if (ajuda.value && raiz.value && !raiz.value.contains(e.target as Node)) ajuda.value = false;
};
onMounted(() => document.addEventListener("click", fora));
onBeforeUnmount(() => document.removeEventListener("click", fora));
</script>

<template>
  <div ref="raiz" class="wa">
    <component
      :is="link ? 'a' : 'button'"
      class="btn-wa"
      v-bind="link ? { href: link, target: '_blank', rel: 'noopener' } : { type: 'button', 'aria-expanded': ajuda }"
      :title="link ? 'Abrir a conversa com o assessor no WhatsApp' : 'Configurar o número do WhatsApp'"
      @click="!link && (ajuda = !ajuda)"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" :d="LOGO" /></svg>
      <span class="rotulo">Conversar no WhatsApp</span>
    </component>

    <div v-if="ajuda && !link" class="ajuda card" role="dialog" aria-label="Como ligar o botão do WhatsApp">
      <strong>Falta o número do assessor</strong>
      <p>Coloque o número do WhatsApp do assessor no <code>.env</code>, só com dígitos, e reinicie o painel:</p>
      <code class="bloco">WHATSAPP_NUMERO=5511999999999</code>
      <p class="faint">Com o app da Meta configurado (<code>WHATSAPP_TOKEN</code> e <code>WHATSAPP_PHONE_NUMBER_ID</code>), o número é descoberto sozinho.</p>
    </div>
  </div>
</template>

<style scoped>
.wa { position: relative; flex: none; }
/* Cores da marca WhatsApp: verde #25D366, escurecendo no hover e no clique. */
.btn-wa {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 18px 0 14px;
  border-radius: 999px;
  border: 0;
  background: #25d366;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.01em;
  white-space: nowrap;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s, transform 0.1s;
}
.btn-wa:hover { background: #1ebe5d; }
.btn-wa:active { background: #128c7e; transform: translateY(1px); }
.btn-wa:focus-visible { outline: 2px solid #25d366; outline-offset: 3px; }
.ajuda {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  width: min(340px, 86vw);
  padding: 16px 18px;
  display: grid;
  gap: 8px;
  z-index: 20;
  font-size: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}
.ajuda p { margin: 0; color: var(--text-2); }
.ajuda .bloco { display: block; padding: 8px 10px; border-radius: 8px; background: var(--surface-2); font-size: 13px; }
@media (max-width: 1100px) {
  .rotulo { display: none; }
  .btn-wa { width: 40px; padding: 0; justify-content: center; }
}
</style>
