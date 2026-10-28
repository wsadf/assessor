<script setup lang="ts">
import { computed } from "vue";
import { mesaPorId } from "../mesas";
import AssessorAvatar from "./AssessorAvatar.vue";

const props = defineProps<{ mesa: string }>();
const m = computed(() => mesaPorId(props.mesa));
const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
</script>

<template>
  <div class="balao-linha">
    <AssessorAvatar :mesa="mesa" :size="32" />
    <div class="balao">
      <div class="quem"><strong :style="{ color: m.cor }">{{ m.assessor }}</strong> · {{ m.cargo }}</div>
      <div class="texto"><slot /></div>
      <div class="hora">{{ hora }} ✓✓</div>
    </div>
  </div>
</template>

<style scoped>
.balao-linha { display: flex; gap: 10px; align-items: flex-start; max-width: 460px; }
.balao {
  position: relative;
  background: var(--bubble);
  color: var(--bubble-text);
  border: 1px solid var(--line);
  backdrop-filter: blur(14px);
  padding: 12px 16px 10px;
  border-radius: 6px 16px 16px 16px;
  font-size: 15px;
  line-height: 1.5;
  box-shadow: var(--shadow);
}
.quem { font-size: 12px; color: var(--text-3); margin-bottom: 4px; }
.quem strong { font-weight: 600; }
.texto :deep(b) { font-weight: 700; }
.hora { text-align: right; font-size: 11px; opacity: 0.6; margin-top: 2px; }
</style>
