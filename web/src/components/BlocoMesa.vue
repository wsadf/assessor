<script setup lang="ts">
defineProps<{ titulo: string }>();
</script>

<template>
  <section class="bloco">
    <div class="titulo">
      <h2>{{ titulo }}</h2>
      <slot name="acoes" />
    </div>
    <div class="grade">
      <div class="esq"><slot /></div>
      <div v-if="$slots.lado" class="dir"><slot name="lado" /></div>
    </div>
  </section>
</template>

<style scoped>
.bloco {
  padding: 28px;
  margin-bottom: 16px;
  border-radius: 22px;
  border: 1px solid var(--line);
  background: var(--glass);
  backdrop-filter: blur(16px);
}
.titulo { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
h2 { margin: 0; font-size: 19px; }
.grade { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 40px; align-items: start; }
.esq { display: grid; gap: 20px; align-content: start; }
@media (max-width: 960px) {
  .grade { grid-template-columns: 1fr; gap: 28px; }
}
@media (max-width: 600px) {
  .bloco { padding: 22px 18px; }
}
</style>
