import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/financas" },
    { path: "/financas", component: () => import("./views/financas/FinancasPainel.vue"), meta: { mesa: "financas" } },
    { path: "/financas/transacoes", component: () => import("./views/financas/TransacoesView.vue"), meta: { mesa: "financas" } },
    { path: "/financas/categorias", component: () => import("./views/financas/CategoriasView.vue"), meta: { mesa: "financas" } },
    { path: "/financas/pagamentos", component: () => import("./views/financas/PagamentosView.vue"), meta: { mesa: "financas" } },
    { path: "/financas/analises", component: () => import("./views/financas/AnalisesView.vue"), meta: { mesa: "financas" } },
    { path: "/fiscal", component: () => import("./views/FiscalMesa.vue"), meta: { mesa: "fiscal" } },
    { path: "/agenda", component: () => import("./views/AgendaMesa.vue"), meta: { mesa: "agenda" } },
    { path: "/tarefas", component: () => import("./views/TarefasMesa.vue"), meta: { mesa: "tarefas" } },
    { path: "/operacao", component: () => import("./views/OperacaoMesa.vue"), meta: { mesa: "operacao" } },
    { path: "/pesquisas", component: () => import("./views/PesquisasMesa.vue"), meta: { mesa: "pesquisas" } },
    { path: "/:pathMatch(.*)*", redirect: "/financas" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
