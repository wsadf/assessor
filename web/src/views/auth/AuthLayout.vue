<script setup lang="ts">
/** `cliente`: pagina vista por quem nao e usuario, sem a assinatura e o rodape de venda. */
withDefaults(defineProps<{ antes: string; destaque: string; depois?: string; cliente?: boolean; rodape?: string }>(), {
  rodape: "Seus dados só servem para este horário",
});
</script>

<template>
  <div class="auth">
    <aside class="vitrine">
      <div class="logo">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <rect width="32" height="32" rx="9" fill="#10b981" />
          <path d="M9 22l7-13 7 13" stroke="#06140f" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        assessor
      </div>

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
      <div class="caixa">
        <div class="logo-mobile">
          <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="#10b981" />
            <path d="M9 22l7-13 7 13" stroke="#06140f" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          assessor
        </div>
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); min-height: 100vh; }
.vitrine {
  /* Sempre escura, nos dois temas: e a "vitrine" da marca. */
  color: #f2f2f4;
  background:
    radial-gradient(120% 80% at 0% 0%, rgba(16, 185, 129, 0.22), transparent 55%),
    radial-gradient(90% 70% at 100% 100%, rgba(169, 139, 245, 0.18), transparent 60%),
    #0b0b0d;
  padding: 40px 48px;
  display: flex;
  flex-direction: column;
  gap: 48px;
}
.logo, .logo-mobile { display: flex; align-items: center; gap: 10px; font-size: 21px; font-weight: 600; letter-spacing: -0.01em; }
/* Ocupa o espaco entre logo e rodape e centraliza, na mesma altura do formulario. */
.centro { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 40px; }
h1 { font-size: 40px; line-height: 1.15; margin: 0 0 18px; letter-spacing: -0.02em; font-weight: 700; max-width: 460px; }
h1 span { color: #34d399; }
.assinatura { margin: 0; color: #a4a4ae; font-family: Georgia, "Times New Roman", serif; font-style: italic; font-size: 15px; display: flex; align-items: center; gap: 12px; }
.assinatura::before { content: ""; width: 28px; height: 1px; background: #4a4a52; }
footer { display: flex; gap: 20px; flex-wrap: wrap; font-size: 12.5px; color: #8b8b93; }
.formulario { display: grid; place-items: center; padding: 40px 24px; background: var(--bg); }
.caixa { width: min(420px, 100%); display: grid; gap: 18px; }
.logo-mobile { display: none; }
@media (max-width: 900px) {
  .auth { grid-template-columns: 1fr; }
  .vitrine { display: none; }
  .logo-mobile { display: flex; margin-bottom: 8px; }
  .formulario { place-items: start center; padding-top: 32px; }
}
</style>
