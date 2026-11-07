<script setup lang="ts">
import { computed } from "vue";
import type { AcaoCompromisso, CompromissoFilho } from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import { dataCurta, rotuloDia } from "../../format";
import { HOJE } from "../../estado";
import { ROTULO } from "./tipos";

const props = defineProps<{ c: CompromissoFilho; acoes?: boolean }>();
const emit = defineEmits<{ acao: [c: CompromissoFilho, acao: AcaoCompromisso]; editar: [c: CompromissoFilho]; apagar: [c: CompromissoFilho] }>();

const quando = computed(() => {
  if (!props.c.data) return "a marcar";
  const rel = rotuloDia(props.c.data, HOJE);
  const dia = rel === "hoje" || rel === "amanhã" ? `${rel}, ${dataCurta(props.c.data)}` : dataCurta(props.c.data);
  return props.c.hora ? `${dia} · ${props.c.hora}` : dia;
});
const festa = computed(() => props.c.tipo === "aniversario_amigo");
const aberto = computed(() => props.c.situacao === "aberto");
</script>

<template>
  <div class="list-row" :class="{ apagado: !aberto }">
    <span class="chip tipo" :class="{ aniv: c.virtual }">{{ ROTULO[c.tipo] }}</span>
    <div class="flex1">
      <strong>{{ c.titulo }}</strong>
      <div class="faint">
        {{ c.filhoNome }} · {{ quando }}<template v-if="c.local"> · {{ c.local }}</template
        ><template v-if="c.disciplina"> · {{ c.disciplina }}</template>
      </div>
      <div v-if="festa" class="presente">
        Presente: {{ c.presente ?? "a definir" }}
        <span class="chip" :class="c.presenteSituacao === 'comprado' ? 'ok' : 'warning'">{{ c.presenteSituacao === "comprado" ? "comprado" : "por comprar" }}</span>
      </div>
    </div>
    <span v-if="!aberto" class="chip">{{ c.situacao }}</span>
    <template v-if="acoes && !c.virtual">
      <button v-if="festa && aberto && c.presenteSituacao !== 'comprado'" class="btn" @click="emit('acao', c, 'presente_comprado')">Comprei</button>
      <button v-if="aberto" class="icon-btn" aria-label="Concluir" title="Concluir" @click="emit('acao', c, 'concluir')"><AppIcon name="check" :size="16" /></button>
      <button v-else class="btn ghost" @click="emit('acao', c, 'reabrir')">Reabrir</button>
      <button class="icon-btn" aria-label="Editar" title="Editar" @click="emit('editar', c)"><AppIcon name="editar" :size="16" /></button>
      <button class="icon-btn" aria-label="Apagar" title="Apagar" @click="emit('apagar', c)"><AppIcon name="lixo" :size="16" /></button>
    </template>
  </div>
</template>

<style scoped>
.list-row { gap: 12px; }
.flex1 { flex: 1; min-width: 0; }
.flex1 strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.faint { font-size: 13px; }
.presente { font-size: 13px; color: var(--text-2); margin-top: 4px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tipo { flex: none; }
.tipo.aniv { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.apagado { opacity: 0.6; }
/* No celular o conteudo ocupa a linha toda; tipo em cima e botoes embaixo. */
@media (max-width: 600px) {
  .list-row { flex-wrap: wrap; gap: 8px 12px; }
  .tipo { order: -1; }
  .flex1 { flex: 1 1 100%; }
  .flex1 strong { white-space: normal; }
}
</style>
