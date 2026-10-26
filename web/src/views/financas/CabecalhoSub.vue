<script setup lang="ts">
import AppIcon from "../../components/AppIcon.vue";

defineProps<{ titulo: string; subtitulo?: string }>();
</script>

<template>
  <div class="page-head">
    <RouterLink class="icon-btn" to="/financas" aria-label="Voltar para Finanças"><AppIcon name="voltar" /></RouterLink>
    <div>
      <h1>{{ titulo }} <slot name="selo" /></h1>
      <p v-if="subtitulo">{{ subtitulo }}</p>
    </div>
    <span class="spacer" />
    <slot />
  </div>
</template>
