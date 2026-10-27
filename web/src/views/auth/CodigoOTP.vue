<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";

const codigo = defineModel<string>({ required: true });
const emit = defineEmits<{ completo: [codigo: string] }>();
const caixas = ref<HTMLInputElement[]>([]);
const digitos = ref<string[]>(Array.from({ length: 6 }, (_, i) => codigo.value[i] ?? ""));

function atualizar() {
  // O defineModel so reflete a atribuicao depois que o pai rerenderiza; por isso usa o valor local.
  const valor = digitos.value.join("");
  codigo.value = valor;
  if (valor.length === 6) emit("completo", valor);
}

function digitar(i: number, e: Event) {
  const valor = (e.target as HTMLInputElement).value.replace(/\D/g, "");
  // Colar o codigo inteiro numa caixa preenche as seis.
  if (valor.length > 1) {
    valor.slice(0, 6).split("").forEach((d, j) => (digitos.value[j] = d));
    atualizar();
    nextTick(() => caixas.value[Math.min(valor.length, 6) - 1]?.focus());
    return;
  }
  digitos.value[i] = valor;
  atualizar();
  if (valor && i < 5) caixas.value[i + 1]?.focus();
}

function tecla(i: number, e: KeyboardEvent) {
  if (e.key === "Backspace" && !digitos.value[i] && i > 0) caixas.value[i - 1]?.focus();
  if (e.key === "ArrowLeft" && i > 0) caixas.value[i - 1]?.focus();
  if (e.key === "ArrowRight" && i < 5) caixas.value[i + 1]?.focus();
}

onMounted(() => caixas.value[0]?.focus());
</script>

<template>
  <div class="otp" role="group" aria-label="Código de 6 números">
    <input
      v-for="(_, i) in 6"
      :key="i"
      :ref="(el) => (caixas[i] = el as HTMLInputElement)"
      :value="digitos[i]"
      inputmode="numeric"
      autocomplete="one-time-code"
      maxlength="6"
      :aria-label="`Dígito ${i + 1}`"
      @input="digitar(i, $event)"
      @keydown="tecla(i, $event)"
      @focus="($event.target as HTMLInputElement).select()"
    />
  </div>
</template>

<style scoped>
.otp { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
/* Sem width explicito o input usa o tamanho padrao de ~20 caracteres e estoura a grade. */
input {
  width: 100%;
  min-width: 0;
  height: 56px;
  text-align: center;
  font-size: 24px;
  font-weight: 700;
  border-radius: 12px;
  border: 1px solid var(--line-strong);
  background: var(--surface-2);
  outline: none;
  font-variant-numeric: tabular-nums;
}
input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
</style>
