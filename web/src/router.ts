import { createRouter, createWebHistory } from "vue-router";
import { sessao } from "./api";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: () => import("./views/LandingView.vue"), meta: { publica: true } },
    { path: "/entrar", component: () => import("./views/auth/EntrarView.vue"), meta: { publica: true } },
    { path: "/criar-conta", component: () => import("./views/auth/CriarContaView.vue"), meta: { publica: true } },
    { path: "/esqueci", component: () => import("./views/auth/EsqueciView.vue"), meta: { publica: true } },
    { path: "/financas", component: () => import("./views/financas/FinancasPainel.vue"), meta: { mesa: "financas" } },
    { path: "/financas/transacoes", component: () => import("./views/financas/TransacoesView.vue"), meta: { mesa: "financas" } },
    { path: "/financas/contas", component: () => import("./views/financas/ContasView.vue"), meta: { mesa: "financas" } },
    { path: "/financas/categorias", component: () => import("./views/financas/CategoriasView.vue"), meta: { mesa: "financas" } },
    { path: "/financas/contrapartes", component: () => import("./views/financas/ContrapartesView.vue"), meta: { mesa: "financas" } },
    { path: "/financas/pagamentos", component: () => import("./views/financas/PagamentosView.vue"), meta: { mesa: "financas" } },
    { path: "/financas/analises", component: () => import("./views/financas/AnalisesView.vue"), meta: { mesa: "financas" } },
    { path: "/fiscal", component: () => import("./views/FiscalMesa.vue"), meta: { mesa: "fiscal" } },
    { path: "/agenda", component: () => import("./views/AgendaMesa.vue"), meta: { mesa: "agenda" } },
    { path: "/tarefas", component: () => import("./views/TarefasMesa.vue"), meta: { mesa: "tarefas" } },
    { path: "/tarefas/documentos", component: () => import("./views/tarefas/DocumentosView.vue"), meta: { mesa: "tarefas" } },
    { path: "/operacao", component: () => import("./views/OperacaoMesa.vue"), meta: { mesa: "operacao" } },
    { path: "/operacao/avisos", component: () => import("./views/operacao/AvisosView.vue"), meta: { mesa: "operacao" } },
    { path: "/operacao/acessos", component: () => import("./views/operacao/AcessosView.vue"), meta: { mesa: "operacao" } },
    { path: "/pesquisas", component: () => import("./views/PesquisasMesa.vue"), meta: { mesa: "pesquisas" } },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior: (to) => (to.hash ? { el: to.hash, behavior: "smooth", top: 72 } : { top: 0 }),
});

router.beforeEach((to) => {
  if (!to.meta.publica && !sessao()) return { path: "/entrar", query: { volta: to.fullPath } };
  if (to.path === "/entrar" && sessao()) return "/financas";
});
