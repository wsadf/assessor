import { ref, shallowRef, watch, type Ref, type WatchSource } from "vue";

const p = (n: number) => String(n).padStart(2, "0");
const agora = new Date();
export const HOJE = `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;

/** Mes escolhido nas telas de Financas e Fiscal; compartilhado para nao voltar ao atual a cada troca de tela. */
export const mesSelecionado = ref(HOJE.slice(0, 7));

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
