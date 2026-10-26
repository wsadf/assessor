<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import AppIcon from "./AppIcon.vue";

defineProps<{ titulo: string }>();
const emit = defineEmits<{ fechar: [] }>();

const tecla = (e: KeyboardEvent) => e.key === "Escape" && emit("fechar");
onMounted(() => addEventListener("keydown", tecla));
onBeforeUnmount(() => removeEventListener("keydown", tecla));
</script>

<template>
  <div class="veu" @click.self="emit('fechar')">
    <aside class="painel" role="dialog" :aria-label="titulo">
      <header>
        <h2>{{ titulo }}</h2>
        <button class="icon-btn" aria-label="Fechar" @click="emit('fechar')"><AppIcon name="fechar" /></button>
      </header>
      <div class="corpo"><slot /></div>
      <footer v-if="$slots.rodape"><slot name="rodape" /></footer>
    </aside>
  </div>
</template>

<style scoped>
.veu { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); z-index: 40; display: flex; justify-content: flex-end; }
.painel {
  width: min(460px, 100%);
  height: 100%;
  background: var(--surface);
  border-left: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  animation: entra 0.18s ease-out;
}
@keyframes entra { from { transform: translateX(24px); opacity: 0; } }
header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--line); }
h2 { margin: 0; font-size: 20px; }
.corpo { flex: 1; overflow: auto; padding: 20px 24px; display: grid; gap: 16px; align-content: start; }
footer { padding: 16px 24px; border-top: 1px solid var(--line); display: flex; gap: 10px; flex-wrap: wrap; }
</style>
