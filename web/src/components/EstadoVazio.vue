<script setup lang="ts">
defineProps<{ titulo: string; texto?: string }>();
</script>

<template>
  <div class="vazio">
    <div class="titulo">{{ titulo }}</div>
    <p v-if="texto" class="muted">{{ texto }}</p>
    <slot />
  </div>
</template>

<style scoped>
.vazio {
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius);
  padding: 36px 24px;
  text-align: center;
  display: grid;
  gap: 8px;
  justify-items: center;
}
.titulo { font-size: 18px; font-weight: 500; }
p { margin: 0; max-width: 420px; }
</style>
