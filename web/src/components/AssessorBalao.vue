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
  padding: 10px 14px 8px;
  border-radius: 4px 14px 14px 14px;
  font-size: 15px;
  line-height: 1.45;
}
.quem { font-size: 12.5px; opacity: 0.85; margin-bottom: 2px; }
.quem strong { filter: brightness(1.25); }
.texto :deep(b) { font-weight: 700; }
.hora { text-align: right; font-size: 11px; opacity: 0.6; margin-top: 2px; }
</style>
