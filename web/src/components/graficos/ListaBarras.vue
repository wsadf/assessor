<script setup lang="ts">
import { computed } from "vue";
import { brl } from "../../format";

const props = defineProps<{ itens: { nome: string; valor: number; cor?: string; detalhe?: string }[]; formatar?: (v: number) => string; numerar?: boolean }>();
const max = computed(() => Math.max(...props.itens.map((i) => i.valor), 1));
const fmt = (v: number) => (props.formatar ?? brl)(v);
</script>

<template>
  <ol class="lista" :class="{ numerada: numerar }">
    <li v-for="(it, i) in itens" :key="it.nome">
      <span v-if="numerar" class="pos faint num">{{ i + 1 }}</span>
      <div class="corpo">
        <div class="topo">
          <span class="nome">{{ it.nome }}</span>
          <strong class="num">{{ fmt(it.valor) }}</strong>
        </div>
        <div class="trilho"><span :style="{ width: `${(it.valor / max) * 100}%`, background: it.cor ?? 'var(--mesa)' }" /></div>
        <div v-if="it.detalhe" class="faint detalhe">{{ it.detalhe }}</div>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
li { display: flex; gap: 12px; align-items: flex-start; }
.pos { width: 18px; font-size: 13px; padding-top: 1px; }
.corpo { flex: 1; min-width: 0; }
.topo { display: flex; justify-content: space-between; gap: 12px; font-size: 14.5px; }
.nome { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trilho { height: 4px; border-radius: 4px; background: var(--surface-2); margin-top: 7px; overflow: hidden; }
.trilho span { display: block; height: 100%; border-radius: 4px; }
.detalhe { font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; margin-top: 5px; }
</style>
