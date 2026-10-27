<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api, precisaToken, salvarToken } from "./api";
import AppIcon from "./components/AppIcon.vue";
import AssessorAvatar from "./components/AssessorAvatar.vue";
import BotaoWhatsapp from "./components/BotaoWhatsapp.vue";
import { MESAS, SUBMENU_FINANCAS, mesaPorId } from "./mesas";

const route = useRoute();
const mesaAtual = computed(() => mesaPorId(String(route.meta.mesa ?? "financas")));
const menuAberto = ref(false);
const tema = ref(document.documentElement.dataset.theme === "light" ? "light" : "dark");
const me = ref<{ nome: string | null; telefone: string; ia: string; whatsapp: string | null } | null>(null);
const tokenDigitado = ref("");

watch(() => route.fullPath, () => (menuAberto.value = false));

function alternarTema() {
  tema.value = tema.value === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = tema.value;
  try {
    localStorage.setItem("assessor-tema", tema.value);
  } catch {
    // Preferencia so desta sessao.
  }
}

async function carregarMe() {
  try {
    me.value = await api.get("/me");
  } catch {
    me.value = null;
  }
}

function entrar() {
  if (!tokenDigitado.value.trim()) return;
  salvarToken(tokenDigitado.value);
  location.reload();
}

onMounted(carregarMe);
</script>

<template>
  <div class="shell" :style="{ '--mesa': mesaAtual.cor }">
    <aside class="lateral" :class="{ aberto: menuAberto }">
      <div class="marca">
        <span class="logo">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="var(--accent)" />
            <path d="M9 22l7-13 7 13" stroke="#06140f" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          assessor
        </span>
      </div>

      <nav>
        <div class="eyebrow secao">Mesas</div>
        <template v-for="m in MESAS" :key="m.id">
          <RouterLink :to="m.rota" class="item-mesa" :class="{ ativo: mesaAtual.id === m.id }">
            <span class="dot" :style="{ background: m.cor }" />
            {{ m.nome }}
          </RouterLink>
          <div v-if="m.id === 'financas' && mesaAtual.id === 'financas'" class="sub">
            <RouterLink v-for="s in SUBMENU_FINANCAS" :key="s.rota" :to="s.rota" class="item-sub" exact-active-class="ativo">
              <AppIcon :name="s.icone" :size="17" />
              {{ s.nome }}
            </RouterLink>
          </div>
        </template>
      </nav>

      <div class="rodape">
        <div class="usuario">
          <span class="iniciais">{{ (me?.nome ?? "Você")[0] }}</span>
          <div>
            <div class="nome">{{ me?.nome ?? "Você" }}</div>
            <div class="faint tel num">{{ me?.telefone ?? "" }}</div>
          </div>
        </div>
        <span v-if="me" class="chip ok">IA {{ me.ia }}</span>
      </div>
    </aside>
    <div v-if="menuAberto" class="veu" @click="menuAberto = false" />

    <div class="principal">
      <header class="topo">
        <button class="icon-btn so-mobile" aria-label="Abrir menu" @click="menuAberto = true"><AppIcon name="menu" /></button>
        <nav class="abas">
          <RouterLink
            v-for="m in MESAS"
            :key="m.id"
            :to="m.rota"
            class="aba"
            :class="{ ativa: mesaAtual.id === m.id }"
            :style="{ '--c': m.cor }"
          >
            <AssessorAvatar :mesa="m.id" :size="28" />
            <span>
              <span class="aba-nome">{{ m.nome }}</span>
              <span class="aba-por">por {{ m.assessor }}</span>
            </span>
          </RouterLink>
        </nav>
        <button class="icon-btn" :aria-label="tema === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'" @click="alternarTema">
          <AppIcon :name="tema === 'dark' ? 'lua' : 'sol'" />
        </button>
        <BotaoWhatsapp :numero="me?.whatsapp ?? null" :mesa="mesaAtual.id" />
      </header>

      <main class="conteudo">
        <RouterView v-slot="{ Component }">
          <component :is="Component" :key="route.path" />
        </RouterView>
      </main>
    </div>

    <div v-if="precisaToken" class="token-veu">
      <form class="card token" @submit.prevent="entrar">
        <h2>Token do painel</h2>
        <p class="muted">A API pede o <code>PAINEL_TOKEN</code> do arquivo <code>.env</code>. Ele fica salvo só neste navegador.</p>
        <input v-model="tokenDigitado" class="input" type="password" placeholder="Cole o token" autofocus />
        <button class="btn primary" type="submit">Entrar</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: 100%; }

.lateral {
  width: 248px;
  flex: none;
  border-right: 1px solid var(--line);
  background: var(--bg);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 20px 14px;
}
.marca { padding: 4px 8px 18px; border-bottom: 1px solid var(--line); margin-bottom: 14px; }
.logo { display: flex; align-items: center; gap: 10px; font-size: 21px; font-weight: 600; letter-spacing: -0.01em; }
nav { flex: 1; overflow: auto; }
.secao { padding: 8px 10px; }
.item-mesa {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  border-radius: 10px;
  color: var(--text-2);
  font-weight: 500;
}
.item-mesa:hover { background: var(--surface); color: var(--text); }
.item-mesa.ativo { color: var(--text); }
.sub { display: grid; gap: 2px; padding: 2px 0 8px 18px; }
.item-sub {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 10px;
  color: var(--text-2);
  font-size: 14px;
}
.item-sub:hover { color: var(--text); background: var(--surface); }
.item-sub.ativo { color: var(--text); background: var(--surface-2); }
.item-sub.ativo :deep(svg) { color: var(--mesa); }
.rodape { border-top: 1px solid var(--line); padding-top: 14px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.usuario { display: flex; align-items: center; gap: 10px; min-width: 0; }
.iniciais { width: 34px; height: 34px; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--line-strong); display: grid; place-items: center; font-weight: 600; }
.nome { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tel { font-size: 12px; }

.principal { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topo {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 28px;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.topo::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--mesa), transparent);
  opacity: 0.6;
}
.abas { flex: 1; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.aba {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 6px 6px;
  border-radius: 999px;
  white-space: nowrap;
  opacity: 0.62;
  transition: opacity 0.15s, background 0.15s;
}
.aba:hover { opacity: 1; background: var(--surface); }
.aba.ativa { opacity: 1; }
.aba > span:last-child { display: grid; line-height: 1.15; }
.aba-nome { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
.aba.ativa .aba-nome { color: var(--c); }
.aba-por { font-size: 12px; color: var(--text-3); }

.conteudo { padding: 32px 28px 64px; max-width: 1240px; width: 100%; margin: 0 auto; }

.so-mobile { display: none; }
.veu { display: none; }

.token-veu { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: grid; place-items: center; z-index: 50; padding: 16px; }
.token { width: min(420px, 100%); padding: 24px; display: grid; gap: 14px; }
.token h2 { margin: 0; }
.token p { margin: 0; }

@media (max-width: 900px) {
  .lateral { position: fixed; left: 0; top: 0; z-index: 40; transform: translateX(-100%); transition: transform 0.2s; }
  .lateral.aberto { transform: none; }
  .veu { display: block; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 30; }
  .so-mobile { display: grid; }
  .topo { padding: 10px 16px; }
  .conteudo { padding: 24px 16px 48px; }
  .aba-por { display: none; }
}
</style>
