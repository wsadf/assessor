<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, limparSessao } from "./api";
import AppIcon from "./components/AppIcon.vue";
import AssessorAvatar from "./components/AssessorAvatar.vue";
import BotaoWhatsapp from "./components/BotaoWhatsapp.vue";
import { carregarEu, eu as me, pode } from "./estado";
import { MESAS, SUBMENU_FINANCAS, mesaLiberada, mesaPorId } from "./mesas";

const route = useRoute();
const router = useRouter();
const publica = computed(() => Boolean(route.meta.publica));
const mesaAtual = computed(() => mesaPorId(String(route.meta.mesa ?? "financas")));
const menuAberto = ref(false);
const tema = ref(document.documentElement.dataset.theme === "light" ? "light" : "dark");
const mesas = computed(() => MESAS.filter((m) => mesaLiberada(m, pode)));
const emClientes = computed(() => route.path === "/contador");

watch(() => route.fullPath, () => (menuAberto.value = false));
// Carrega a conta ao entrar na area logada (inclusive logo depois do login).
watch(publica, (p) => !p && !me.value && carregarEu());
// Mesa fora do perfil (link antigo, rota digitada) leva para a primeira liberada.
watch([me, () => route.path], () => {
  if (me.value && !publica.value && !mesaLiberada(mesaAtual.value, pode)) router.replace(mesas.value[0]?.rota ?? "/operacao");
});
// Quem so e contador (sem plano proprio nem conta de outra pessoa) comeca pelos clientes, uma vez por visita.
let foiParaClientes = false;
watch(me, (m) => {
  if (!m || foiParaClientes || publica.value) return;
  foiParaClientes = true;
  if (m.clientes?.length && !m.plano && !m.conta.compartilhada && route.path !== "/contador") router.replace("/contador");
});

function alternarTema() {
  tema.value = tema.value === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = tema.value;
  try {
    localStorage.setItem("assessor-tema", tema.value);
  } catch {
    // Preferencia so desta sessao.
  }
}

async function sair() {
  await api.post("/auth/sair", {}).catch(() => undefined);
  limparSessao();
  me.value = null;
  router.replace("/entrar");
}

// Antes de o roteador resolver a primeira rota, meta.publica ainda nao reflete a pagina aberta.
onMounted(async () => {
  await router.isReady();
  if (!publica.value) carregarEu();
});
</script>

<template>
  <RouterView v-if="publica" />
  <div v-else class="shell" :style="{ '--mesa': mesaAtual.cor }">
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
        <template v-for="m in mesas" :key="m.id">
          <RouterLink :to="m.rota" class="item-mesa" :class="{ ativo: mesaAtual.id === m.id && !emClientes }">
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
        <template v-if="me?.clientes?.length">
          <div class="eyebrow secao">Contador</div>
          <RouterLink to="/contador" class="item-mesa" :class="{ ativo: route.path === '/contador' }">
            <AppIcon name="pessoas" :size="17" />
            Clientes
          </RouterLink>
        </template>
      </nav>

      <div class="rodape">
        <div class="usuario">
          <span class="iniciais">{{ (me?.nome ?? "Você")[0] }}</span>
          <div class="quem">
            <div class="nome">{{ me?.nome ?? "Você" }}</div>
            <div class="faint tel">
              {{ me?.conta.perfil && me.conta.perfil !== "titular" ? `na conta de ${me.conta.titular ?? "titular"}` : (me?.email ?? me?.telefone ?? "") }}
            </div>
          </div>
        </div>
        <button class="icon-btn sair" title="Sair" aria-label="Sair" @click="sair"><AppIcon name="sair" :size="17" /></button>
      </div>
    </aside>
    <div v-if="menuAberto" class="veu" @click="menuAberto = false" />

    <div class="principal">
      <header class="topo">
        <button class="icon-btn so-mobile" aria-label="Abrir menu" @click="menuAberto = true"><AppIcon name="menu" /></button>
        <nav class="abas">
          <RouterLink
            v-for="m in mesas"
            :key="m.id"
            :to="m.rota"
            class="aba"
            :class="{ ativa: mesaAtual.id === m.id && !emClientes }"
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
.quem { min-width: 0; }
.sair { width: 34px; height: 34px; flex: none; color: var(--text-2); }
.sair:hover { color: var(--danger); border-color: var(--danger); }
.iniciais { width: 34px; height: 34px; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--line-strong); display: grid; place-items: center; font-weight: 600; }
.nome { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tel { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
