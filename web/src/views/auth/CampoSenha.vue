<script setup lang="ts">
import { computed, ref } from "vue";
import AppIcon from "../../components/AppIcon.vue";

const senha = defineModel<string>({ required: true });
const props = defineProps<{ placeholder?: string; mostrarForca?: boolean; autocomplete?: string; id?: string }>();
const visivel = ref(false);

const forca = computed(() => {
  const s = senha.value;
  if (!s) return 0;
  let pontos = 0;
  if (s.length >= 8) pontos++;
  if (s.length >= 12) pontos++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) pontos++;
  if (/\d/.test(s) && /[^A-Za-z0-9]/.test(s)) pontos++;
  return s.length < 8 ? Math.min(pontos, 1) : Math.max(pontos, 1);
});
const ROTULOS = ["", "fraca", "razoável", "boa", "forte"];
const CORES = ["", "var(--danger)", "var(--warning)", "#84cc16", "var(--accent)"];
</script>

<template>
  <div class="campo-senha">
    <div class="caixa-input">
      <input
        :id="id"
        v-model="senha"
        class="input"
        :type="visivel ? 'text' : 'password'"
        :placeholder="placeholder ?? 'Sua senha'"
        :autocomplete="autocomplete ?? 'current-password'"
      />
      <button type="button" class="olho" :aria-label="visivel ? 'Esconder senha' : 'Mostrar senha'" @click="visivel = !visivel">
        <AppIcon :name="visivel ? 'olho-fechado' : 'olho'" :size="17" />
      </button>
    </div>
    <div v-if="props.mostrarForca" class="forca" :aria-label="`Força da senha: ${ROTULOS[forca] || 'vazia'}`">
      <span v-for="i in 4" :key="i" :style="{ background: i <= forca ? CORES[forca] : undefined }" />
      <small v-if="forca" :style="{ color: CORES[forca] }">{{ ROTULOS[forca] }}</small>
    </div>
  </div>
</template>

<style scoped>
.caixa-input { position: relative; }
.caixa-input .input { width: 100%; padding-right: 44px; }
.olho { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 0; background: transparent; color: var(--text-3); cursor: pointer; padding: 6px; display: grid; }
.olho:hover { color: var(--text); }
.forca { display: grid; grid-template-columns: repeat(4, 1fr) auto; gap: 6px; align-items: center; margin-top: 8px; }
.forca span { height: 4px; border-radius: 4px; background: var(--line-strong); transition: background 0.2s; }
.forca small { font-size: 11.5px; min-width: 54px; text-align: right; }
</style>
