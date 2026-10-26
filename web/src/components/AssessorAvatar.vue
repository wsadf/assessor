<script setup lang="ts">
import { computed } from "vue";
import { mesaPorId } from "../mesas";

const props = defineProps<{ mesa: string; size?: number }>();
const m = computed(() => mesaPorId(props.mesa));
</script>

<template>
  <span
    class="avatar"
    :style="{ width: `${size ?? 34}px`, height: `${size ?? 34}px`, fontSize: `${(size ?? 34) * 0.42}px`, '--c': m.cor }"
    :title="`${m.assessor} · ${m.cargo}`"
  >
    {{ m.assessor[0] }}
  </span>
</template>

<style scoped>
.avatar {
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 50%;
  font-weight: 700;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 16%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--c) 55%, transparent);
}
</style>
