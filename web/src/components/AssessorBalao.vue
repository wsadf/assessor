<script setup lang="ts">
import { computed } from "vue";
import { mesaPorId } from "../mesas";
import AppLogo from "./AppLogo.vue";

const props = defineProps<{ mesa: string }>();
const m = computed(() => mesaPorId(props.mesa));
const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
</script>

<template>
  <div class="msg">
    <span class="ico"><AppLogo :tamanho="20" :nome="false" /></span>
    <div class="corpo">
      <div class="cab">
        <span>{{ m.assessor }} <small>· {{ m.cargo }}</small></span>
        <time>{{ hora }}</time>
      </div>
      <div class="texto"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.msg {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  max-width: 520px;
  padding: 14px 18px 14px 14px;
  border-radius: 16px;
  background: var(--bubble);
  color: var(--bubble-text);
  border: 1px solid var(--line);
  backdrop-filter: blur(18px);
  box-shadow: 0 20px 40px -28px rgba(0, 0, 0, 0.6);
}
.ico { width: 38px; height: 38px; border-radius: 12px; border: 1px solid var(--line); display: grid; place-items: center; flex: none; background: rgba(0, 0, 0, 0.12); }
.corpo { flex: 1; min-width: 0; }
.cab { display: flex; justify-content: space-between; gap: 16px; font-size: 12.5px; color: var(--text-2); margin-bottom: 3px; }
.cab small { color: var(--text-3); font-size: 12px; }
.cab time { font-size: 11px; color: var(--text-3); }
.texto { font-size: 15px; line-height: 1.5; }
.texto :deep(b) { font-weight: 600; }
</style>
