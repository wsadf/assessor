<script setup lang="ts">
defineProps<{ carregando: boolean; erro: string | null }>();
defineEmits<{ tentar: [] }>();
</script>

<template>
  <div v-if="erro" class="status erro">
    Não foi possível carregar: {{ erro }}
    <button class="btn" @click="$emit('tentar')">Tentar de novo</button>
  </div>
  <div v-else-if="carregando" class="status">
    <span class="spinner" /> Carregando…
  </div>
</template>

<style scoped>
.status { display: flex; align-items: center; gap: 12px; color: var(--text-2); padding: 24px 0; }
.erro { color: var(--danger); }
.spinner { width: 16px; height: 16px; border: 2px solid var(--line-strong); border-top-color: var(--mesa); border-radius: 50%; animation: gira 0.8s linear infinite; }
@keyframes gira { to { transform: rotate(360deg); } }
</style>
