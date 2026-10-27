import { ref, shallowRef, watch, type Ref, type WatchSource } from "vue";
import { api, type Capacidade, type Me } from "./api";

const p = (n: number) => String(n).padStart(2, "0");
const agora = new Date();
export const HOJE = `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;

/** Mes escolhido nas telas de Financas e Fiscal; compartilhado para nao voltar ao atual a cada troca de tela. */
export const mesSelecionado = ref(HOJE.slice(0, 7));

/** Quem esta logado e o que o perfil dele libera nesta conta. */
export const eu = ref<Me | null>(null);

export async function carregarEu() {
  try {
    eu.value = await api.get<Me>("/me");
  } catch {
    eu.value = null;
  }
}

// Antes de /me responder, mostra tudo: o servidor recusa o que o perfil nao libera.
export const pode = (cap: Capacidade) => !eu.value || eu.value.conta.capacidades.includes(cap);

export function useCarregar<T>(buscar: () => Promise<T>, deps: WatchSource[] = []) {
  const dados = shallowRef<T | null>(null) as Ref<T | null>;
  const carregando = ref(true);
  const erro = ref<string | null>(null);

  async function recarregar() {
    carregando.value = true;
    erro.value = null;
    try {
      dados.value = await buscar();
    } catch (e) {
      erro.value = (e as Error).message;
    } finally {
      carregando.value = false;
    }
  }

  watch(deps, recarregar, { immediate: true });
  return { dados, carregando, erro, recarregar };
}
