<script setup lang="ts">
import { ref } from "vue";
import { api, type Aviso, type Avisos } from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import AssessorBalao from "../../components/AssessorBalao.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import { useCarregar } from "../../estado";

const { dados: a, carregando, erro, recarregar } = useCarregar(() => api.get<Avisos>("/avisos"));
const salvando = ref<string | null>(null);
const erroAcao = ref<string | null>(null);
const HORAS = Array.from({ length: 24 }, (_, h) => h);

async function salvar(aviso: Aviso, mudanca: { ligado?: boolean; hora?: number }) {
  salvando.value = aviso.tipo;
  erroAcao.value = null;
  try {
    await api.put(`/avisos/${aviso.tipo}`, { ligado: mudanca.ligado ?? aviso.ligado, hora: mudanca.hora ?? aviso.hora });
    await recarregar();
  } catch (e) {
    erroAcao.value = (e as Error).message;
  } finally {
    salvando.value = null;
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <RouterLink class="icon-btn" to="/operacao" aria-label="Voltar para Operação"><AppIcon name="voltar" /></RouterLink>
      <div>
        <h1>Avisos</h1>
        <p>O que a equipe manda para o seu WhatsApp sem você pedir. Vale só para você.</p>
      </div>
    </div>

    <StatusCarga :carregando="carregando && !a" :erro="erro" @tentar="recarregar" />

    <template v-if="a">
      <div v-if="!a.modeloAprovado" class="aviso info">
        Sem modelo aprovado na Meta, os avisos só chegam se você falou com o assessor nas últimas 24 horas. Os que não chegarem
        aparecem na sua próxima conversa.
      </div>
      <AssessorBalao mesa="operacao">
        cada aviso sai uma vez, no horário que você escolher. No WhatsApp também dá: “para de me avisar de categoria”.
      </AssessorBalao>

      <section class="card lista">
        <div v-for="aviso in a.avisos" :key="aviso.tipo" class="list-row" :class="{ inativo: !aviso.disponivel }">
          <div class="flex1">
            <strong>{{ aviso.nome }}</strong>
            <div class="faint">{{ aviso.disponivel ? aviso.descricao : "Seu acesso nesta conta não inclui esta área." }}</div>
          </div>
          <select
            class="input hora"
            :value="aviso.hora"
            :disabled="!aviso.disponivel || salvando === aviso.tipo"
            aria-label="Horário"
            @change="salvar(aviso, { hora: Number(($event.target as HTMLSelectElement).value) })"
          >
            <option v-for="h in HORAS" :key="h" :value="h">{{ String(h).padStart(2, "0") }}h</option>
          </select>
          <label class="chave" :title="aviso.ligado ? 'Desligar' : 'Ligar'">
            <input
              type="checkbox"
              :checked="aviso.ligado"
              :disabled="!aviso.disponivel || salvando === aviso.tipo"
              :aria-label="`${aviso.nome}: ${aviso.ligado ? 'ligado' : 'desligado'}`"
              @change="salvar(aviso, { ligado: ($event.target as HTMLInputElement).checked })"
            />
            <span />
          </label>
        </div>
      </section>
      <p v-if="erroAcao" class="erro">{{ erroAcao }}</p>
    </template>
  </div>
</template>

<style scoped>
.aviso { margin-bottom: 16px; }
.lista { padding: 4px 20px; margin-top: 20px; }
.list-row { gap: 14px; }
.list-row.inativo { opacity: 0.55; }
.flex1 { flex: 1; min-width: 0; }
.faint { font-size: 13px; }
.hora { width: auto; min-width: 80px; }
.chave { position: relative; width: 42px; height: 24px; flex: none; cursor: pointer; }
.chave input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: inherit; }
.chave span { position: absolute; inset: 0; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--line-strong); transition: background 0.15s; }
.chave span::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--text-3); transition: transform 0.15s, background 0.15s; }
.chave input:checked + span { background: color-mix(in srgb, var(--mesa) 35%, transparent); border-color: var(--mesa); }
.chave input:checked + span::after { transform: translateX(18px); background: var(--mesa); }
.chave input:focus-visible + span { outline: 2px solid var(--mesa); outline-offset: 2px; }
.chave input:disabled + span { cursor: default; }
.erro { color: var(--danger); }
</style>
