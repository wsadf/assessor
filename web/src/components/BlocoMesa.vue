<script setup lang="ts">
defineProps<{ titulo: string }>();
</script>

<template>
  <section class="bloco">
    <div class="titulo">
      <span class="eyebrow">{{ titulo }}</span>
      <span class="linha" />
      <slot name="acoes" />
    </div>
    <div class="grade">
      <div class="esq"><slot /></div>
      <div v-if="$slots.lado" class="dir"><slot name="lado" /></div>
    </div>
  </section>
</template>

<style scoped>
.bloco { padding: 40px 0; border-bottom: 1px solid var(--line); }
.bloco:first-child { padding-top: 8px; }
.bloco:last-child { border-bottom: 0; }
.titulo { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
.titulo .eyebrow { color: var(--mesa); }
.linha { flex: 1; height: 1px; background: var(--line); }
.grade { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 48px; align-items: start; }
.esq { display: grid; gap: 22px; align-content: start; }
@media (max-width: 960px) {
  .grade { grid-template-columns: 1fr; gap: 28px; }
}
</style>
