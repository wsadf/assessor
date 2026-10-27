<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { api, type Agenda, type Agendamento, type EnvioContato, type GoogleStatus, type Lembrete, type MensagemContato, type MinhaPagina } from "../api";
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

const { dados: minha, recarregar: recarregarPagina } = useCarregar(() => api.get<MinhaPagina>("/agendamento/pagina"));
const { dados: lista, recarregar: recarregarLista } = useCarregar(() => api.get<{ agendamentos: Agendamento[] }>("/agendamento"));
const DURACOES = [15, 30, 45, 60, 90, 120];
const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const SITUACAO = { agendado: "agendado", confirmado: "confirmado", remarcando: "esperando o cliente escolher", cancelado: "cancelado" } as const;
const pag = reactive({ nome: "", duracoes: [30] as number[], dias: [1, 2, 3, 4, 5] as number[], inicio: "09:00", fim: "18:00", antecedenciaHoras: 12, horizonteDias: 30, ativa: true });
const editandoPagina = ref(false);
const erroPagina = ref<string | null>(null);
const salvandoPagina = ref(false);
const copiado = ref(false);

function editarPagina() {
  const p = minha.value?.pagina;
  Object.assign(pag, p ? { ...p, duracoes: [...p.duracoes], dias: [...p.dias] } : { nome: "" });
  erroPagina.value = null;
  editandoPagina.value = true;
}

const alternar = (lista: number[], v: number) => {
  const i = lista.indexOf(v);
  if (i >= 0) lista.splice(i, 1);
  else lista.push(v);
};

async function salvarPagina() {
  salvandoPagina.value = true;
  erroPagina.value = null;
  try {
    await api.put("/agendamento/pagina", pag);
    editandoPagina.value = false;
    await recarregarPagina();
  } catch (e) {
    erroPagina.value = (e as Error).message;
  } finally {
    salvandoPagina.value = false;
  }
}

async function novoLink() {
  if (!confirm("Gerar um link novo? O link atual para de funcionar na hora; quem já marcou continua marcado.")) return;
  await api.post("/agendamento/pagina/novo-link", {});
  await recarregarPagina();
}

// Sem PAINEL_URL no servidor o link vem relativo; o cliente precisa do endereco inteiro.
const linkCompleto = computed(() => {
  const l = minha.value?.link ?? "";
  return l.startsWith("/") ? `${location.origin}${l}` : l;
});

async function copiarLink() {
  await navigator.clipboard.writeText(linkCompleto.value);
  copiado.value = true;
  setTimeout(() => (copiado.value = false), 2000);
}

const erroLista = ref<string | null>(null);
async function remarcarCliente(b: Agendamento) {
  if (!confirm(`Mandar para ${b.cliente} até três horários livres para escolher?`)) return;
  erroLista.value = null;
  try {
    await api.post(`/agendamento/${b.id}/remarcar`, {});
  } catch (e) {
    erroLista.value = (e as Error).message;
  }
  await recarregarLista();
}

async function cancelarCliente(b: Agendamento) {
  if (!confirm(`Cancelar o horário de ${b.cliente}? O evento sai do Google Agenda e o cliente recebe o aviso com o link para marcar outro.`)) return;
  erroLista.value = null;
  try {
    await api.del(`/agendamento/${b.id}`);
  } catch (e) {
    erroLista.value = (e as Error).message;
  }
  await Promise.all([recarregarLista(), recarregar()]);
}

const { dados: recados, recarregar: recarregarRecados } = useCarregar(() =>
  api.get<{ envios: EnvioContato[]; mensagens: MensagemContato[] }>("/contatos/mensagens"),
);
const SITUACAO_RECADO = { enviada: "enviada", entregue: "entregue", lida: "lida", falhou: "não entregue", pulada: "não saiu (limite do dia)" } as const;
const erroRecado = ref<string | null>(null);

async function cancelarRecado(e: EnvioContato) {
  if (!confirm(`Parar de mandar “${e.texto}” para ${e.contato}?`)) return;
  erroRecado.value = null;
  try {
    await api.del(`/contatos/envios/${e.id}`);
  } catch (err) {
    erroRecado.value = (err as Error).message;
  }
  await recarregarRecados();
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

      <BlocoMesa v-if="minha" titulo="Página de agendamento">
        <AssessorBalao mesa="agenda">
          <template v-if="google && !google.configurado">a página de agendamento depende do Google Agenda, que não está configurado neste servidor.</template>
          <template v-else-if="!minha.googleConectado">a página de agendamento usa o seu Google Agenda para mostrar só horários livres. Conecte o Google acima e volte aqui.</template>
          <template v-else-if="!minha.pagina">seus clientes escolhem um horário livre num link seu, sem precisar falar com você. Eu confirmo com eles na véspera pelo WhatsApp.</template>
          <template v-else-if="minha.pagina.ativa">sua página está no ar. Mande o link para os clientes; cada horário marcado entra no seu Google Agenda.</template>
          <template v-else>sua página está pausada: o link mostra “página não encontrada” até você reativar.</template>
        </AssessorBalao>
        <template #lado>
          <template v-if="minha.googleConectado">
            <form v-if="editandoPagina" class="form" @submit.prevent="salvarPagina">
              <label class="field"><span>Nome que o cliente vê</span><input v-model="pag.nome" class="input" maxlength="60" placeholder="Ex.: Dra. Julia Andrade" /></label>
              <div class="field">
                <span>Durações</span>
                <div class="escolhas">
                  <button v-for="d in DURACOES" :key="d" type="button" class="chip escolha" :class="{ ok: pag.duracoes.includes(d) }" @click="alternar(pag.duracoes, d)">{{ d }} min</button>
                </div>
              </div>
              <div class="field">
                <span>Dias de atendimento</span>
                <div class="escolhas">
                  <button v-for="(s, i) in SEMANA_CURTA" :key="s" type="button" class="chip escolha" :class="{ ok: pag.dias.includes(i) }" @click="alternar(pag.dias, i)">{{ s }}</button>
                </div>
              </div>
              <div class="linha-form">
                <label class="field"><span>Das</span><input v-model="pag.inicio" class="input" type="time" step="900" /></label>
                <label class="field"><span>Até</span><input v-model="pag.fim" class="input" type="time" step="900" /></label>
                <label class="field"><span>Antecedência (h)</span><input v-model.number="pag.antecedenciaHoras" class="input" type="number" min="0" max="168" /></label>
              </div>
              <div class="linha-form">
                <label class="field"><span>Até quantos dias à frente</span><input v-model.number="pag.horizonteDias" class="input" type="number" min="1" max="90" /></label>
                <label class="field check"><input v-model="pag.ativa" type="checkbox" /> <span>Página no ar</span></label>
              </div>
              <p v-if="erroPagina" class="erro">{{ erroPagina }}</p>
              <div class="acoes">
                <button class="btn primary" :disabled="salvandoPagina" type="submit">{{ salvandoPagina ? "Salvando…" : "Salvar página" }}</button>
                <button class="btn ghost" type="button" @click="editandoPagina = false">Cancelar</button>
              </div>
            </form>
            <div v-else-if="minha.pagina" class="pagina">
              <div class="link">
                <span class="chip" :class="minha.pagina.ativa ? 'ok' : 'warning'">{{ minha.pagina.ativa ? "no ar" : "pausada" }}</span>
                <a class="flex1 url" :href="linkCompleto" target="_blank" rel="noopener">{{ linkCompleto }}</a>
              </div>
              <p class="faint">
                {{ minha.pagina.nome }} · {{ minha.pagina.duracoes.join(", ") }} min ·
                {{ minha.pagina.dias.map((d) => SEMANA_CURTA[d]).join(", ") }} · {{ minha.pagina.inicio }} às {{ minha.pagina.fim }}
              </p>
              <div class="acoes">
                <button class="btn primary" type="button" @click="copiarLink">{{ copiado ? "Copiado!" : "Copiar link" }}</button>
                <button class="btn ghost" type="button" @click="editarPagina">Editar</button>
                <button class="btn ghost" type="button" @click="novoLink">Gerar novo link</button>
              </div>
            </div>
            <button v-else class="btn primary" type="button" @click="editarPagina"><AppIcon name="mais" :size="16" /> Criar minha página</button>
          </template>
          <p v-else class="faint">Disponível depois de conectar o Google Agenda.</p>
          <template v-if="lista?.agendamentos.length">
            <div class="eyebrow agendados">Próximos agendamentos</div>
            <div v-for="b in lista.agendamentos" :key="b.id" class="list-row">
              <span class="dot" style="background: var(--mesa)" />
              <div class="flex1">
                <div class="titulo">{{ b.cliente }}</div>
                <div class="eyebrow meta">{{ rotuloDia(dataLocal(b.inicio), HOJE) }} · {{ horaLocal(b.inicio) }} · {{ SITUACAO[b.situacao] }}</div>
                <div v-if="b.confirmacaoFalhou" class="aviso-linha">Confirmação não enviada pelo WhatsApp; confirme direto com o cliente.</div>
              </div>
              <button v-if="b.situacao !== 'remarcando'" class="icon-btn mini" title="Remarcar" @click="remarcarCliente(b)"><AppIcon name="repetir" :size="15" /></button>
              <button class="icon-btn mini" title="Cancelar horário" @click="cancelarCliente(b)"><AppIcon name="lixo" :size="15" /></button>
            </div>
            <p v-if="erroLista" class="erro">{{ erroLista }}</p>
          </template>
        </template>
      </BlocoMesa>

      <BlocoMesa v-if="recados" titulo="Mensagens para outras pessoas">
        <AssessorBalao mesa="agenda">
          peça pelo WhatsApp, como “lembra o João de pagar o personal todo dia 5”. Eu mostro a mensagem antes, mando em seu nome com a opção de parar
          e te conto quando a pessoa responder.
        </AssessorBalao>
        <template #lado>
          <EstadoVazio v-if="!recados.envios.length && !recados.mensagens.length" titulo="Nenhuma mensagem ainda" texto="Os recados agendados e as respostas aparecem aqui." />
          <template v-if="recados.envios.length">
            <div class="eyebrow">Agendadas</div>
            <div v-for="e in recados.envios" :key="e.id" class="list-row">
              <span class="dot" style="background: var(--mesa)" />
              <div class="flex1">
                <div class="titulo">{{ e.contato }}</div>
                <div class="faint recado">{{ e.texto }}</div>
                <div class="eyebrow meta">
                  <template v-if="e.proximo">{{ rotuloDia(dataLocal(e.proximo), HOJE) }} · {{ horaLocal(e.proximo) }}</template>
                  <template v-if="e.recorrencia"> · {{ REC[e.recorrencia] }}</template>
                  <template v-if="e.pedidoPor"> · pedido por {{ e.pedidoPor }}</template>
                </div>
              </div>
              <button class="icon-btn mini" title="Parar de mandar" @click="cancelarRecado(e)"><AppIcon name="lixo" :size="15" /></button>
            </div>
          </template>
          <template v-if="recados.mensagens.length">
            <div class="eyebrow agendados">Últimas mensagens</div>
            <div v-for="m in recados.mensagens" :key="m.id" class="list-row">
              <div class="flex1">
                <div class="titulo">{{ m.contato }}</div>
                <div class="eyebrow meta">{{ rotuloDia(dataLocal(m.enviadaEm), HOJE) }} · {{ horaLocal(m.enviadaEm) }}</div>
                <div v-if="m.resposta" class="resposta">“{{ m.resposta }}”</div>
              </div>
              <span class="chip" :class="m.situacao === 'falhou' || m.situacao === 'pulada' ? 'warning' : m.resposta ? 'ok' : ''" :title="m.erro ?? undefined">
                {{ m.resposta ? "respondeu" : SITUACAO_RECADO[m.situacao] }}
              </span>
            </div>
          </template>
          <p v-if="erroRecado" class="erro">{{ erroRecado }}</p>
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
.linha-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.form .btn { justify-self: start; }
.erro { color: var(--danger); margin: 0; }
.escolhas { display: flex; flex-wrap: wrap; gap: 6px; }
.escolha { cursor: pointer; background: transparent; font: inherit; }
.check { display: flex; align-items: center; gap: 8px; align-self: end; height: 40px; }
.acoes { display: flex; gap: 8px; flex-wrap: wrap; }
.pagina { display: grid; gap: 10px; }
.link { display: flex; align-items: center; gap: 10px; min-width: 0; }
.url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--mesa); }
.agendados { margin-top: 18px; }
.recado { font-size: 13px; margin-top: 2px; }
.resposta { font-size: 13px; margin-top: 4px; color: var(--text-2); font-style: italic; }
.aviso-linha { font-size: 12.5px; color: var(--warning); margin-top: 2px; }
@media (max-width: 600px) {
  .linha-form { grid-template-columns: 1fr 1fr; }
}
</style>
