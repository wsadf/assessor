<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppIcon from "../../components/AppIcon.vue";
import AppLogo from "../../components/AppLogo.vue";

/** `cliente`: pagina vista por quem nao e usuario, sem os links de conta e os selos de venda. */
const props = withDefaults(defineProps<{ antes: string; destaque: string; depois?: string; cliente?: boolean; rodape?: string }>(), {
  rodape: "Seus dados só servem para este horário",
});

const route = useRoute();
const naEntrada = computed(() => route.path === "/entrar");
const selos = computed(() =>
  props.cliente
    ? [{ icone: "olho", texto: props.rodape }]
    : [
        { icone: "olho", texto: "Protegido pela LGPD" },
        { icone: "check", texto: "Sem fidelidade" },
        { icone: "relogio", texto: "7 dias grátis" },
      ],
);
</script>

<template>
  <div class="auth">
    <header class="topo">
      <AppLogo v-if="cliente" />
      <RouterLink v-else to="/" aria-label="assessor, início"><AppLogo /></RouterLink>
      <template v-if="!cliente">
        <RouterLink v-if="naEntrada" to="/criar-conta" class="link-seta">Criar conta <AppIcon name="seta" :size="15" class="diag" /></RouterLink>
        <RouterLink v-else to="/entrar" class="link-seta">Entrar <AppIcon name="seta" :size="15" class="diag" /></RouterLink>
      </template>
    </header>

    <section class="chamada">
      <span class="eyebrow">{{ cliente ? "Assessor" : "Sua equipe no WhatsApp" }}</span>
      <h1>{{ antes }}<br /><span>{{ destaque }}{{ depois ?? "" }}</span></h1>
    </section>

    <div class="palco">
      <aside v-if="$slots.lado" class="lado">
        <div class="vidro passos-lado"><slot name="lado" /></div>
        <span class="liga" aria-hidden="true" />
      </aside>

      <main class="caixa">
        <slot />
      </main>

      <aside class="selos">
        <span class="liga" aria-hidden="true" />
        <div class="lista-selos">
          <span v-for="s in selos" :key="s.texto" class="selo"><AppIcon :name="s.icone" :size="14" /> {{ s.texto }}</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* Sempre escura, nos dois temas, como a landing. */
.auth {
  --bg: #07080c;
  --surface: #111217;
  --surface-2: #17181e;
  --text: #f4f1ee;
  --text-2: #a9a5a3;
  --text-3: #75716f;
  --line: rgba(255, 255, 255, 0.08);
  --line-strong: rgba(255, 255, 255, 0.16);
  --glass: rgba(255, 255, 255, 0.045);
  --glass-2: rgba(255, 255, 255, 0.07);
  --accent: #e3a57c;
  --accent-soft: rgba(227, 165, 124, 0.14);
  --botao: #ffffff;
  --botao-texto: #0b0b0f;
  --bubble: rgba(255, 255, 255, 0.06);
  --bubble-text: #f4f1ee;
  min-height: 100vh;
  color: var(--text);
  background:
    radial-gradient(34% 40% at 50% 62%, rgba(201, 120, 74, 0.42), transparent 70%),
    radial-gradient(60% 30% at 50% 20%, rgba(201, 120, 74, 0.12), transparent 70%),
    #07080c;
  padding: 24px 24px 64px;
}
.diag { transform: rotate(-45deg); }
.vidro { background: var(--glass); border: 1px solid var(--line); border-radius: 18px; backdrop-filter: blur(16px); }

.topo {
  width: min(1240px, 100%);
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 68px;
  padding: 0 24px;
  border-radius: 22px;
  background: rgba(22, 22, 28, 0.72);
  border: 1px solid var(--line);
  backdrop-filter: blur(18px);
}
.link-seta { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 500; }

.chamada { text-align: center; padding: 56px 0 40px; }
.chamada .eyebrow { color: var(--text-2); }
h1 { font-size: clamp(32px, 4.4vw, 52px); line-height: 1.1; letter-spacing: -0.04em; font-weight: 400; margin: 16px auto 0; max-width: 900px; }
h1 span { color: var(--text-2); }

/* Formulario no centro, os passos a esquerda e os selos a direita, ligados por linhas pontilhadas. */
.palco { display: grid; grid-template-columns: minmax(0, 1fr) min(460px, 100%) minmax(0, 1fr); align-items: center; width: min(1240px, 100%); margin: 0 auto; }
.caixa {
  grid-column: 2;
  display: grid;
  gap: 18px;
  padding: 32px;
  border-radius: 24px;
  background: rgba(20, 20, 26, 0.72);
  border: 1px solid var(--line-strong);
  backdrop-filter: blur(20px);
  box-shadow: 0 40px 80px -40px rgba(0, 0, 0, 0.8);
}
.lado, .selos { display: flex; align-items: center; min-width: 0; }
.lado { grid-column: 1; grid-row: 1; justify-content: flex-end; }
.passos-lado { padding: 22px 24px; max-width: 320px; }
.liga { flex: 0 0 48px; border-top: 1px dashed rgba(255, 255, 255, 0.28); }
.selos { grid-column: 3; grid-row: 1; }
.lista-selos { display: grid; justify-items: start; gap: 12px; }
.selo { display: inline-flex; align-items: center; gap: 8px; padding: 11px 16px; border-radius: 14px; background: rgba(255, 255, 255, 0.06); border: 1px solid var(--line); backdrop-filter: blur(16px); font-size: 13.5px; color: var(--text-2); }
.selo:nth-child(2) { margin-left: 36px; }

@media (max-width: 1100px) {
  .palco { grid-template-columns: min(460px, 100%); justify-content: center; gap: 20px; }
  .caixa { grid-column: 1; grid-row: 1; }
  .lado { grid-column: 1; grid-row: 2; justify-content: center; }
  .passos-lado { max-width: none; width: 100%; }
  .selos { grid-column: 1; grid-row: 3; justify-content: center; }
  .lista-selos { display: flex; flex-wrap: wrap; justify-content: center; }
  .selo:nth-child(2) { margin-left: 0; }
  .liga { display: none; }
}
@media (max-width: 600px) {
  .auth { padding: 12px 16px 48px; }
  .topo { height: 60px; padding: 0 16px; border-radius: 18px; }
  .chamada { padding: 36px 0 28px; }
  .caixa { padding: 24px 20px; }
}
</style>
