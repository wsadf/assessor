<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { agendar, ApiError, type Horario, type PaginaPublica } from "../api";
import AppIcon from "../components/AppIcon.vue";
import AuthLayout from "./auth/AuthLayout.vue";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

const slug = String(useRoute().params.slug);
const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;

const pagina = ref<PaginaPublica | null>(null);
const naoAchei = ref(false);
const etapa = ref<"duracao" | "dia" | "horario" | "dados" | "confirmado">("duracao");
const duracao = ref(0);
const dia = ref("");
const horarios = ref<Horario[]>([]);
const horario = ref<Horario | null>(null);
const carregando = ref(true);
const erro = ref<string | null>(null);
const enviando = ref(false);
const form = reactive({ nome: "", email: "", whatsapp: "", aceite: false, site: "" });

const outroFuso = computed(() => !!pagina.value && fuso !== pagina.value.fusoDoProfissional);
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const diaLongo = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const quandoTexto = (h: Horario) =>
  new Date(h.inicio).toLocaleString("pt-BR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

onMounted(async () => {
  try {
    pagina.value = await agendar.pagina(slug);
    if (pagina.value.duracoes.length === 1) escolherDuracao(pagina.value.duracoes[0]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) naoAchei.value = true;
    else erro.value = (e as Error).message;
  } finally {
    carregando.value = false;
  }
});

function escolherDuracao(d: number) {
  duracao.value = d;
  etapa.value = "dia";
}

// Calendario: so os meses que tem dia disponivel, e so esses dias clicaveis.
const meses = computed(() => [...new Set(pagina.value?.dias.map((d) => d.slice(0, 7)) ?? [])]);
const mesIdx = ref(0);
const mes = computed(() => meses.value[mesIdx.value]);
const grade = computed(() => {
  if (!mes.value) return [];
  const [y, m] = mes.value.split("-").map(Number);
  const primeiro = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const livres = new Set(pagina.value!.dias);
  return [
    ...Array.from({ length: primeiro }, () => null),
    ...Array.from({ length: total }, (_, i) => {
      const data = `${mes.value}-${String(i + 1).padStart(2, "0")}`;
      return { data, n: i + 1, livre: livres.has(data) };
    }),
  ];
});

async function escolherDia(d: string) {
  dia.value = d;
  etapa.value = "horario";
  await carregarHorarios();
}

async function carregarHorarios() {
  carregando.value = true;
  horarios.value = [];
  try {
    horarios.value = (await agendar.horarios(slug, dia.value, duracao.value)).horarios;
  } catch (e) {
    erro.value = (e as Error).message;
  } finally {
    carregando.value = false;
  }
}

function escolherHorario(h: Horario) {
  horario.value = h;
  erro.value = null;
  etapa.value = "dados";
}

async function confirmar() {
  erro.value = null;
  if (form.nome.trim().length < 2) return (erro.value = "Informe seu nome.");
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return (erro.value = "Confira o e-mail.");
  const digitos = form.whatsapp.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 15) return (erro.value = "Confira o WhatsApp, com DDD.");
  if (!form.aceite) return (erro.value = "Marque que aceita receber a confirmação pelo WhatsApp.");
  enviando.value = true;
  try {
    await agendar.reservar(slug, { inicio: horario.value!.inicio, duracao: duracao.value, ...form, whatsapp: digitos, fuso });
    etapa.value = "confirmado";
  } catch (e) {
    erro.value = (e as Error).message;
    if (e instanceof ApiError && e.status === 409) {
      etapa.value = "horario";
      await carregarHorarios();
    }
  } finally {
    enviando.value = false;
  }
}

function voltar() {
  erro.value = null;
  if (etapa.value === "dados") etapa.value = "horario";
  else if (etapa.value === "horario") etapa.value = "dia";
  else if (etapa.value === "dia" && pagina.value!.duracoes.length > 1) etapa.value = "duracao";
}
const podeVoltar = computed(() => ["dados", "horario"].includes(etapa.value) || (etapa.value === "dia" && (pagina.value?.duracoes.length ?? 0) > 1));
</script>

<template>
  <AuthLayout cliente antes="Marque seu horário com" :destaque="pagina?.nome ?? 'quem te atende'" depois=".">
    <template #lado>
      <ol class="como">
        <li><span>1</span> Escolha a duração e o dia</li>
        <li><span>2</span> Escolha um horário livre</li>
        <li><span>3</span> Na véspera, a confirmação chega no seu WhatsApp</li>
      </ol>
    </template>

    <div v-if="carregando && !pagina" class="faint">Carregando…</div>

    <div v-else-if="naoAchei">
      <h2 class="auth-titulo">Página não encontrada</h2>
      <p class="auth-frase">Este link de agendamento não existe ou foi trocado. Peça o link novo a quem te atende.</p>
    </div>

    <template v-else-if="pagina">
      <div>
        <button v-if="podeVoltar" class="btn ghost voltar" type="button" @click="voltar"><AppIcon name="voltar" :size="16" /> Voltar</button>
        <h2 class="auth-titulo">
          <template v-if="etapa === 'duracao'">Quanto tempo você precisa?</template>
          <template v-else-if="etapa === 'dia'">Escolha o dia</template>
          <template v-else-if="etapa === 'horario'">{{ diaLongo(dia) }}</template>
          <template v-else-if="etapa === 'dados'">Seus dados</template>
          <template v-else>Horário marcado!</template>
        </h2>
        <p v-if="etapa !== 'confirmado'" class="auth-frase">
          {{ pagina.nome }}<template v-if="etapa !== 'duracao'"> · {{ duracao }} min</template>
          <template v-if="horario && etapa === 'dados'"> · {{ quandoTexto(horario) }}</template>
        </p>
      </div>

      <div v-if="erro" class="aviso erro" role="alert">{{ erro }}</div>

      <div v-if="etapa === 'duracao'" class="opcoes">
        <button v-for="d in pagina.duracoes" :key="d" class="btn opcao" type="button" @click="escolherDuracao(d)">{{ d }} minutos</button>
      </div>

      <div v-else-if="etapa === 'dia'" class="calendario">
        <div v-if="!meses.length" class="aviso info">Não há dias livres agora. Tente de novo mais tarde.</div>
        <template v-else>
          <div class="cal-topo">
            <button class="icon-btn" type="button" aria-label="Mês anterior" :disabled="mesIdx === 0" @click="mesIdx--"><AppIcon name="voltar" :size="16" /></button>
            <strong>{{ MESES[Number(mes.slice(5, 7)) - 1] }} de {{ mes.slice(0, 4) }}</strong>
            <button class="icon-btn" type="button" aria-label="Próximo mês" :disabled="mesIdx >= meses.length - 1" @click="mesIdx++"><AppIcon name="avancar" :size="16" /></button>
          </div>
          <div class="grade">
            <span v-for="(s, i) in SEMANA" :key="i" class="faint sem">{{ s }}</span>
            <template v-for="(c, i) in grade" :key="i">
              <span v-if="!c" />
              <button v-else class="dia" type="button" :disabled="!c.livre" @click="escolherDia(c.data)">{{ c.n }}</button>
            </template>
          </div>
        </template>
      </div>

      <div v-else-if="etapa === 'horario'">
        <p v-if="outroFuso" class="aviso info">Horários no seu fuso ({{ fuso }}).</p>
        <div v-if="carregando" class="faint">Procurando horários livres…</div>
        <div v-else-if="!horarios.length && !erro" class="aviso info">Nenhum horário livre neste dia. Volte e escolha outro.</div>
        <div v-else class="horarios">
          <button v-for="h in horarios" :key="h.inicio" class="btn opcao num" type="button" @click="escolherHorario(h)">{{ hora(h.inicio) }}</button>
        </div>
      </div>

      <form v-else-if="etapa === 'dados'" class="auth-form" novalidate @submit.prevent="confirmar">
        <label class="campo">
          <span class="rotulo-campo">Nome</span>
          <input v-model="form.nome" class="input" autocomplete="name" maxlength="80" autofocus />
        </label>
        <label class="campo">
          <span class="rotulo-campo">E-mail <em>o convite chega aqui</em></span>
          <input v-model="form.email" class="input" type="email" autocomplete="email" placeholder="voce@email.com" />
        </label>
        <label class="campo">
          <span class="rotulo-campo">WhatsApp com DDD</span>
          <input v-model="form.whatsapp" class="input" type="tel" autocomplete="tel" placeholder="(11) 91234-5678" />
        </label>
        <!-- Campo que so robo preenche: pessoa nao ve nem alcanca pelo teclado. -->
        <input v-model="form.site" class="escondido" name="site" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <label class="aceite">
          <input v-model="form.aceite" type="checkbox" />
          <span>Aceito receber a confirmação deste horário pelo WhatsApp.</span>
        </label>
        <button class="btn primary btn-largo" type="submit" :disabled="enviando">{{ enviando ? "Marcando…" : "Confirmar horário" }}</button>
      </form>

      <div v-else class="confirmado">
        <div class="aviso info">
          <b>{{ quandoTexto(horario!) }}</b> com {{ pagina.nome }}.<br />
          O convite chega no seu e-mail e, na véspera, a confirmação vem pelo WhatsApp.
        </div>
      </div>
    </template>

    <div v-else-if="erro" class="aviso erro" role="alert">{{ erro }}</div>
  </AuthLayout>
</template>

<style scoped>
.como { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; color: #d6d6dc; }
.como li { display: flex; gap: 12px; align-items: center; font-size: 15px; }
.como span { width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid #34d399; color: #34d399; display: grid; place-items: center; font-size: 12px; font-weight: 600; flex: none; }
.auth-titulo::first-letter { text-transform: uppercase; }
.voltar { padding-left: 0; margin-bottom: 8px; }
.opcoes { display: grid; gap: 10px; }
.opcao { justify-content: center; height: 46px; }
.cal-topo { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.cal-topo strong { display: inline-block; }
.cal-topo strong::first-letter { text-transform: uppercase; }
.grade { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; text-align: center; }
.sem { font-size: 12px; padding-bottom: 4px; }
.dia { height: 40px; border-radius: 10px; border: 1px solid var(--line-strong); background: transparent; color: var(--text); font: inherit; cursor: pointer; }
.dia:hover:not(:disabled) { border-color: var(--mesa); color: var(--mesa); }
.dia:disabled { border-color: transparent; color: var(--text-3); cursor: default; opacity: 0.5; }
.horarios { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px; }
.aceite { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; color: var(--text-2); }
.aceite input { margin-top: 3px; }
/* Fora da tela em vez de display:none: alguns robos pulam campos com display:none. */
.escondido { position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0; }
</style>
