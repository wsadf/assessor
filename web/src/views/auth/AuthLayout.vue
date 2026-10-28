<script setup lang="ts">
import AppLogo from "../../components/AppLogo.vue";

/** `cliente`: pagina vista por quem nao e usuario, sem a assinatura e o rodape de venda. */
withDefaults(defineProps<{ antes: string; destaque: string; depois?: string; cliente?: boolean; rodape?: string }>(), {
  rodape: "Seus dados só servem para este horário",
});
</script>

<template>
  <div class="auth">
    <aside class="vitrine">
      <RouterLink to="/" aria-label="assessor, início"><AppLogo :tamanho="28" /></RouterLink>

      <div class="centro">
        <div class="chamada">
          <h1>{{ antes }} <span>{{ destaque }}</span>{{ depois ?? "" }}</h1>
          <p v-if="!cliente" class="assinatura">Bento, Lia e Davi · sua equipe te esperando no WhatsApp</p>
        </div>
        <div class="lado"><slot name="lado" /></div>
      </div>

      <footer v-if="cliente">
        <span>{{ rodape }}</span>
      </footer>
      <footer v-else>
        <span>Dados protegidos pela LGPD</span>
        <span>Sem fidelidade</span>
        <span>7 dias grátis</span>
      </footer>
    </aside>

    <main class="formulario">
      <div class="caixa card">
        <div class="logo-mobile"><AppLogo :tamanho="24" /></div>
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); min-height: 100vh; }
.vitrine {
  /* Sempre escura, nos dois temas: e a "vitrine" da marca. */
  color: #f4f1ee;
  background:
    radial-gradient(90% 60% at 30% 35%, rgba(201, 120, 74, 0.32), transparent 65%),
    radial-gradient(70% 50% at 100% 100%, rgba(201, 120, 74, 0.14), transparent 70%),
    #08090d;
  padding: 40px 48px;
  display: flex;
  flex-direction: column;
  gap: 48px;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}
/* Ocupa o espaco entre logo e rodape e centraliza, na mesma altura do formulario. */
.centro { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 40px; }
h1 { font-size: 42px; line-height: 1.12; margin: 0 0 18px; letter-spacing: -0.035em; font-weight: 400; max-width: 480px; }
h1 span { color: #f0c09c; }
.assinatura { margin: 0; color: #a9a5a3; font-size: 14px; display: flex; align-items: center; gap: 12px; }
.assinatura::before { content: ""; width: 28px; height: 1px; background: rgba(255, 255, 255, 0.2); }
footer { display: flex; gap: 20px; flex-wrap: wrap; font-size: 12.5px; color: #8f8a85; }
.formulario { display: grid; place-items: center; padding: 40px 24px; }
.caixa { width: min(460px, 100%); display: grid; gap: 18px; padding: 32px; }
.logo-mobile { display: none; }
@media (max-width: 900px) {
  .auth { grid-template-columns: 1fr; }
  .vitrine { display: none; }
  .logo-mobile { display: flex; margin-bottom: 8px; }
  .formulario { place-items: start center; padding: 24px 16px; }
  .caixa { padding: 24px 20px; }
}
</style>
