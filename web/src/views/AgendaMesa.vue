<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { api, type Agenda, type GoogleStatus, type Lembrete } from "../api";
import AppIcon from "../components/AppIcon.vue";
import AssessorBalao from "../components/AssessorBalao.vue";
import BlocoMesa from "../components/BlocoMesa.vue";
import EstadoVazio from "../components/EstadoVazio.vue";
import StatusCarga from "../components/StatusCarga.vue";
import ValorGrande from "../components/ValorGrande.vue";
import { addDias, dataLocal, horaLocal, rotuloDia } from "../format";
import { HOJE, useCarregar } from "../estado";

const dia = ref(HOJE);
const { dados: ag, carregando, erro, recarregar } = useCarregar(() => api.get<Agenda>("/agenda", { dia: dia.value }), [dia]);

const { dados: google, recarregar: recarregarGoogle } = useCarregar(() => api.get<GoogleStatus>("/google"));
const eventos = computed(() => ag.value?.google?.eventos ?? []);
const totalDoDia = computed(() => (ag.value?.doDia.length ?? 0) + eventos.value.length);
const erroGoogle = ref<string | null>(null);
const conectando = ref(false);

async function conectarGoogle() {
  conectando.value = true;
  erroGoogle.value = null;
  try {
    const { url } = await api.post<{ url: string }>("/google/conectar", {});
    location.assign(url);
  } catch (e) {
    erroGoogle.value = (e as Error).message;
    conectando.value = false;
  }
}

async function desconectarGoogle() {
  if (!confirm("Desconectar o Google Agenda? Seus compromissos continuam no Google, mas a Lia para de ler e marcar.")) return;
  await api.del("/google");
  await Promise.all([recarregarGoogle(), recarregar()]);
}

const REC = { diario: "todo dia", semanal: "toda semana", mensal: "todo mês" } as const;
const quando = (l: Lembrete) => `${rotuloDia(dataLocal(l.quando), HOJE)} · ${horaLocal(l.quando)}`;
const proximo = computed(() => ag.value?.proximos[0]);
const proximoDia = computed(() => (proximo.value ? rotuloDia(dataLocal(proximo.value.quando), HOJE) : "—"));

const semana = computed(() =>
  Array.from({ length: 14 }, (_, i) => {
    const d = addDias(HOJE, i);
    return { data: d, qtd: ag.value?.porDia.find((p) => p.data === d)?.qtd ?? 0 };
  }),
);
const maxSemana = computed(() => Math.max(...semana.value.map((s) => s.qtd), 1));

const form = reactive({ texto: "", data: HOJE, hora: "09:00", recorrencia: "" as "" | "diario" | "semanal" | "mensal" });
const erroForm = ref<string | null>(null);
const salvando = ref(false);

async function criar() {
  if (!form.texto.trim()) return (erroForm.value = "Escreva o que lembrar.");
  salvando.value = true;
  erroForm.value = null;
  try {
    await api.post("/lembretes", { texto: form.texto, dataHora: `${form.data}T${form.hora}`, recorrencia: form.recorrencia || null });
    form.texto = "";
    await recarregar();
  } catch (e) {
    erroForm.value = (e as Error).message;
  } finally {
    salvando.value = false;
  }
}

async function cancelar(l: Lembrete) {
  if (!confirm(`Cancelar o lembrete “${l.texto}”?`)) return;
  await api.del(`/lembretes/${l.id}`);
  await recarregar();
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Agenda</h1>
        <p>Compromissos e lembretes que a Lia avisa no seu WhatsApp.</p>
      </div>
    </div>

    <StatusCarga :carregando="carregando && !ag" :erro="erro" @tentar="recarregar" />

    <template v-if="ag">
      <BlocoMesa titulo="Compromissos por dia">
        <div class="nav-dia">
          <button class="icon-btn" aria-label="Dia anterior" @click="dia = addDias(dia, -1)"><AppIcon name="voltar" :size="16" /></button>
          <span class="rotulo">{{ rotuloDia(dia, HOJE) }}</span>
          <button class="icon-btn" aria-label="Próximo dia" @click="dia = addDias(dia, 1)"><AppIcon name="avancar" :size="16" /></button>
        </div>
        <ValorGrande :valor="totalDoDia" :moeda="false" :sufixo="rotuloDia(dia, HOJE)" />
        <div class="mini">
          <div><span class="eyebrow">Próximo</span><strong>{{ proximoDia }}</strong></div>
          <div><span class="eyebrow">Ativos</span><strong class="num">{{ ag.ativos }}</strong></div>
          <div><span class="eyebrow">Recorrentes</span><strong class="num">{{ ag.recorrentes }}</strong></div>
        </div>
        <AssessorBalao mesa="agenda">
          <template v-if="totalDoDia">{{ rotuloDia(dia, HOJE) }} você tem <b>{{ totalDoDia }}</b> {{ totalDoDia === 1 ? "compromisso" : "compromissos" }}.</template>
          <template v-else>dia livre.</template>
          <template v-if="proximo"> O próximo lembrete é <b>{{ proximo.texto }}</b>, {{ quando(proximo) }}.</template>
        </AssessorBalao>
        <p v-if="ag.google?.erro" class="faint">Não consegui ler o Google Agenda agora.</p>
        <ul v-if="totalDoDia" class="do-dia">
          <li v-for="e in eventos" :key="e.id">
            <span class="hora num">{{ e.diaInteiro ? "dia todo" : horaLocal(e.inicio) }}</span>
            <span class="flex1">{{ e.titulo }}<template v-if="e.convidados.length"> · com {{ e.convidados.length }}</template></span>
            <a v-if="e.linkVideo" class="chip ok" :href="e.linkVideo" target="_blank" rel="noopener">Meet</a>
            <span class="chip">Google</span>
          </li>
          <li v-for="l in ag.doDia" :key="l.id"><span class="hora num">{{ horaLocal(l.quando) }}</span> {{ l.texto }}</li>
        </ul>
        <template #lado>
          <div class="eyebrow">Próximos compromissos</div>
          <EstadoVazio v-if="!ag.proximos.length" titulo="Nada agendado" texto="Peça no WhatsApp, como “me lembra do dentista quinta às 15h”, ou crie abaixo." />
          <div v-for="l in ag.proximos" :key="l.id" class="list-row">
            <span class="dot" style="background: var(--mesa)" />
            <div class="flex1">
              <div class="titulo">{{ l.texto }}</div>
              <div class="eyebrow meta">{{ quando(l) }}<template v-if="l.recorrencia"> · {{ REC[l.recorrencia] }}</template></div>
            </div>
            <span v-if="l.recorrencia" class="chip"><AppIcon name="repetir" :size="12" /> {{ REC[l.recorrencia] }}</span>
            <button class="icon-btn mini" title="Cancelar lembrete" @click="cancelar(l)"><AppIcon name="lixo" :size="15" /></button>
          </div>
        </template>
      </BlocoMesa>

      <BlocoMesa v-if="google" titulo="Google Agenda">
        <AssessorBalao mesa="agenda">
          <template v-if="!google.configurado">a agenda do Google não está configurada neste servidor. Os lembretes continuam chegando no WhatsApp.</template>
          <template v-else-if="google.status === 'expirada'">o acesso ao seu Google Agenda venceu. Reconecte para eu voltar a marcar e ler seus compromissos.</template>
          <template v-else-if="google.conectada">marco seus compromissos direto no Google Agenda de <b>{{ google.email ?? "sua conta" }}</b>, com convidados e link do Meet quando você pedir.</template>
          <template v-else>conecte o Google Agenda e eu marco seus compromissos lá, com convidados e Meet. Pelo WhatsApp também dá: “conecta minha agenda do Google”.</template>
        </AssessorBalao>
        <template #lado>
          <div v-if="google.configurado" class="google">
            <span class="chip" :class="google.conectada ? 'ok' : google.status === 'expirada' ? 'warning' : ''">
              {{ google.conectada ? "conectada" : google.status === "expirada" ? "acesso vencido" : "não conectada" }}
            </span>
            <span v-if="google.email" class="faint">{{ google.email }}</span>
            <span class="spacer" />
            <button v-if="google.conectada" class="btn ghost" @click="desconectarGoogle">Desconectar</button>
            <button v-else class="btn primary" :disabled="conectando" @click="conectarGoogle">
              {{ conectando ? "Abrindo o Google…" : google.status === "expirada" ? "Reconectar" : "Conectar Google Agenda" }}
            </button>
          </div>
          <p v-if="erroGoogle" class="erro">{{ erroGoogle }}</p>
        </template>
      </BlocoMesa>

      <BlocoMesa titulo="As próximas duas semanas">
        <AssessorBalao mesa="agenda">cada coluna é um dia; as mais altas são onde a agenda aperta.</AssessorBalao>
        <template #lado>
          <div class="semana">
            <button v-for="s in semana" :key="s.data" class="col" :class="{ ativa: s.data === dia }" @click="dia = s.data">
              <span class="barra"><span :style="{ height: `${(s.qtd / maxSemana) * 100}%` }" /></span>
              <span class="num qtd">{{ s.qtd || "" }}</span>
              <span class="faint d">{{ s.data.slice(8) }}</span>
            </button>
          </div>
        </template>
      </BlocoMesa>

      <BlocoMesa titulo="Novo lembrete">
        <AssessorBalao mesa="agenda">o aviso chega no WhatsApp na hora marcada. Pelo WhatsApp é só falar: “me lembra do remédio todo dia 20h”.</AssessorBalao>
        <template #lado>
          <form class="form" @submit.prevent="criar">
            <label class="field"><span>O que lembrar</span><input v-model="form.texto" class="input" placeholder="Ex.: Dentista" /></label>
            <div class="linha-form">
              <label class="field"><span>Data</span><input v-model="form.data" class="input" type="date" :min="HOJE" /></label>
              <label class="field"><span>Hora</span><input v-model="form.hora" class="input" type="time" /></label>
              <label class="field">
                <span>Repetir</span>
                <select v-model="form.recorrencia" class="input">
                  <option value="">não repete</option>
                  <option value="diario">todo dia</option>
                  <option value="semanal">toda semana</option>
                  <option value="mensal">todo mês</option>
                </select>
              </label>
            </div>
            <p v-if="erroForm" class="erro">{{ erroForm }}</p>
            <button class="btn primary" :disabled="salvando" type="submit"><AppIcon name="mais" :size="16" /> Criar lembrete</button>
          </form>
        </template>
      </BlocoMesa>
    </template>
  </div>
</template>

<style scoped>
.nav-dia { display: inline-flex; align-items: center; gap: 12px; }
.nav-dia .icon-btn { width: 34px; height: 34px; }
.rotulo { font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mesa); min-width: 110px; text-align: center; }
.mini { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.mini > div { display: grid; gap: 4px; }
.mini strong { font-size: 18px; }
.do-dia { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.do-dia li { display: flex; gap: 12px; align-items: center; }
.google { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.google .spacer { flex: 1; }
.hora { color: var(--mesa); font-weight: 600; }
.flex1 { flex: 1; min-width: 0; }
.titulo { font-weight: 600; }
.meta { font-size: 10.5px; margin-top: 2px; }
.icon-btn.mini { width: 30px; height: 30px; border-color: transparent; color: var(--text-3); }
.icon-btn.mini:hover { color: var(--danger); border-color: var(--line-strong); }
.semana { display: grid; grid-template-columns: repeat(14, 1fr); gap: 6px; height: 200px; }
.col { display: grid; grid-template-rows: 1fr auto auto; gap: 4px; border: 0; background: transparent; cursor: pointer; padding: 0; border-radius: 8px; }
.barra { display: flex; align-items: flex-end; background: var(--surface); border-radius: 8px; overflow: hidden; }
.barra span { display: block; width: 100%; background: var(--mesa); border-radius: 8px; min-height: 0; }
.col.ativa .barra { outline: 2px solid var(--mesa); outline-offset: 2px; }
.qtd { font-size: 12px; font-weight: 600; }
.d { font-size: 11px; }
.form { display: grid; gap: 14px; }
.linha-form { display: grid; grid-template-columns: 1fr 120px 150px; gap: 12px; }
.form .btn { justify-self: start; }
.erro { color: var(--danger); margin: 0; }
@media (max-width: 600px) {
  .linha-form { grid-template-columns: 1fr 1fr; }
}
</style>
