<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, limparSessao } from "./api";
import AppIcon from "./components/AppIcon.vue";
import AppLogo from "./components/AppLogo.vue";
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
const pagina = computed(() => (emClientes.value ? "Clientes" : SUBMENU_FINANCAS.find((s) => s.rota === route.path)?.nome));

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
  <div v-else class="shell">
    <aside class="lateral" :class="{ aberto: menuAberto }">
      <div class="marca">
        <RouterLink to="/" aria-label="assessor, início"><AppLogo /></RouterLink>
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
        <div class="trilha">
          <span>{{ emClientes ? "Contador" : mesaAtual.nome }}</span>
          <template v-if="pagina">
            <span class="barra">/</span>
            <b>{{ pagina }}</b>
          </template>
        </div>
        <span class="spacer" />
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
.shell { display: flex; gap: 16px; min-height: 100%; padding: 16px; }

/* Barra lateral flutuante, em vidro, como o menu da landing. */
.lateral {
  width: 244px;
  flex: none;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--glass);
  backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 16px;
  height: calc(100vh - 32px);
  padding: 20px 12px 14px;
}
.marca { padding: 2px 10px 20px; }
nav { flex: 1; overflow: auto; }
.secao { padding: 8px 12px; color: var(--text-3); }
.item-mesa {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  color: var(--text-2);
  font-weight: 500;
}
.item-mesa:hover { background: var(--glass); color: var(--text); }
.item-mesa.ativo { color: var(--text); background: var(--glass-2); border-color: var(--line); }
.sub { display: grid; gap: 2px; padding: 4px 0 8px 22px; margin-left: 14px; border-left: 1px dashed var(--line-strong); }
.item-sub {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 10px;
  color: var(--text-3);
  font-size: 14px;
}
.item-sub:hover { color: var(--text); }
.item-sub.ativo { color: var(--text); background: var(--glass); }
.item-sub.ativo :deep(svg) { color: var(--accent); }
.rodape { border-top: 1px solid var(--line); padding: 14px 4px 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.usuario { display: flex; align-items: center; gap: 10px; min-width: 0; }
.quem { min-width: 0; }
.sair { width: 34px; height: 34px; flex: none; color: var(--text-2); }
.sair:hover { color: var(--danger); border-color: var(--danger); }
.iniciais { width: 34px; height: 34px; border-radius: 11px; background: linear-gradient(135deg, #f0c09c, #c9784a); color: #0b0b0f; display: grid; place-items: center; font-weight: 600; }
.nome { font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tel { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.principal { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topo {
  position: sticky;
  top: 16px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 64px;
  padding: 0 12px 0 22px;
  border-radius: 20px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  backdrop-filter: blur(18px);
}
.trilha { display: flex; align-items: center; gap: 10px; font-size: 15px; color: var(--text-2); min-width: 0; white-space: nowrap; }
.trilha b { color: var(--text); font-weight: 500; }
.barra { color: var(--text-3); }

.conteudo { padding: 40px 12px 64px; max-width: 1200px; width: 100%; margin: 0 auto; }

.so-mobile { display: none; }
.veu { display: none; }

@media (max-width: 900px) {
  .shell { padding: 10px; }
  .lateral { position: fixed; left: 10px; top: 10px; z-index: 40; height: calc(100vh - 20px); background: var(--surface); transform: translateX(calc(-100% - 20px)); transition: transform 0.2s; }
  .lateral.aberto { transform: none; }
  .veu { display: block; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 30; }
  .so-mobile { display: grid; }
  .topo { top: 10px; height: 58px; padding: 0 10px; border-radius: 18px; }
  .conteudo { padding: 28px 6px 48px; }
}
</style>