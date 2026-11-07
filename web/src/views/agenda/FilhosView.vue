<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  api,
  type AcaoCompromisso,
  type CompromissoFilho,
  type CompromissosFilhos,
  type Filho,
  type FilhosResposta,
  type TipoCompromisso,
  type VacinasResposta,
} from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import AssessorBalao from "../../components/AssessorBalao.vue";
import EstadoVazio from "../../components/EstadoVazio.vue";
import PainelLateral from "../../components/PainelLateral.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import { dataCurta, diaMes } from "../../format";
import { HOJE, useCarregar } from "../../estado";
import LinhaCompromisso from "./LinhaCompromisso.vue";
import { ANTECEDENCIAS, MESES_DE_REPETICAO, ROTULO, TIPOS } from "./tipos";

const filtro = reactive({ filho: "", tipo: "" });
const filhos = useCarregar(() => api.get<FilhosResposta>("/filhos"));
const lista = useCarregar(
  () => api.get<CompromissosFilhos>("/filhos/compromissos", { filho: filtro.filho || undefined, tipo: filtro.tipo || undefined }),
  [() => filtro.filho, () => filtro.tipo],
);

const cartoes = computed(() => filhos.dados.value?.filhos ?? []);
const semana = computed(() => lista.dados.value?.semana ?? []);
const proximos = computed(() => lista.dados.value?.compromissos ?? []);
const aMarcar = computed(() => lista.dados.value?.aMarcar ?? []);
const presentes = computed(() => (lista.dados.value?.compromissos ?? []).filter((c) => c.tipo === "aniversario_amigo" && c.presenteSituacao === "por_comprar"));
const noLimite = computed(() => cartoes.value.length >= (filhos.dados.value?.limite ?? 10));

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const idadeTexto = (f: Filho) => (f.idade === null ? "idade não informada" : `${plural(f.idade, "ano", "anos")}${f.idadeAproximada ? " (aprox.)" : ""}`);
const quandoCurto = (c: CompromissoFilho) => (c.data ? `${dataCurta(c.data)}${c.hora ? ` · ${c.hora}` : ""}` : "a marcar");
const alternarFiltro = (f: Filho) => (filtro.filho = filtro.filho === String(f.id) ? "" : String(f.id));

// Historico de vacinas de um filho por vez, carregado ao abrir.
const vacinasDe = ref<Filho | null>(null);
const vacinas = ref<VacinasResposta | null>(null);

async function carregarVacinas() {
  if (!vacinasDe.value) return;
  vacinas.value = await api.get<VacinasResposta>(`/filhos/${vacinasDe.value.id}/vacinas`);
}

async function alternarVacinas(f: Filho) {
  if (vacinasDe.value?.id === f.id) {
    vacinasDe.value = null;
    return;
  }
  vacinasDe.value = f;
  vacinas.value = null;
  try {
    await carregarVacinas();
  } catch (e) {
    erro.value = (e as Error).message;
  }
}

type Painel = { modo: "filho"; filho?: Filho } | { modo: "compromisso"; atual?: CompromissoFilho } | { modo: "vacina"; filho: Filho };
const painel = ref<Painel | null>(null);
const erro = ref<string | null>(null);
const salvando = ref(false);
const formFilho = reactive({ nome: "", modo: "nascimento" as "nascimento" | "idade", nascimento: "", idade: "" });
const formComp = reactive({
  filhoId: "",
  tipo: "escola" as TipoCompromisso,
  titulo: "",
  data: "",
  hora: "",
  local: "",
  observacao: "",
  disciplina: "",
  amigo: "",
  presente: "",
  antecedencia: "",
  repetir: "",
  jaAconteceu: false,
});
const formVacina = reactive({ vacina: "", dose: "", data: HOJE, proxima: "nenhuma" as "nenhuma" | "meses" | "data", meses: "6", proximaData: "" });

function abrirFilho(f?: Filho) {
  erro.value = null;
  Object.assign(
    formFilho,
    f
      ? { nome: f.nome, modo: !f.nascimento && f.idadeAproximada ? "idade" : "nascimento", nascimento: f.nascimento ?? "", idade: f.idadeAproximada && f.idade !== null ? String(f.idade) : "" }
      : { nome: "", modo: "nascimento", nascimento: "", idade: "" },
  );
  painel.value = { modo: "filho", filho: f };
}

function abrirCompromisso(c?: CompromissoFilho) {
  erro.value = null;
  Object.assign(
    formComp,
    c
      ? {
          filhoId: String(c.filhoId),
          tipo: c.tipo as TipoCompromisso,
          titulo: c.titulo,
          data: c.data ?? "",
          hora: c.hora ?? "",
          local: c.local ?? "",
          observacao: c.observacao ?? "",
          disciplina: c.disciplina ?? "",
          amigo: c.amigo ?? "",
          presente: c.presente ?? "",
          antecedencia: c.antecedenciaDias === null ? "" : String(c.antecedenciaDias),
          repetir: c.repetirMeses === null || c.tipo !== "consulta" ? "" : String(c.repetirMeses),
          jaAconteceu: false,
        }
      : {
          filhoId: filtro.filho || String(cartoes.value[0]?.id ?? ""),
          tipo: "escola",
          titulo: "",
          data: "",
          hora: "",
          local: "",
          observacao: "",
          disciplina: "",
          amigo: "",
          presente: "",
          antecedencia: "",
          repetir: "",
          jaAconteceu: false,
        },
  );
  painel.value = { modo: "compromisso", atual: c };
}

function abrirVacina(f: Filho) {
  erro.value = null;
  Object.assign(formVacina, { vacina: "", dose: "", data: HOJE, proxima: "nenhuma", meses: "6", proximaData: "" });
  painel.value = { modo: "vacina", filho: f };
}

async function executar(acao: () => Promise<unknown>) {
  salvando.value = true;
  erro.value = null;
  try {
    await acao();
    painel.value = null;
    await Promise.all([filhos.recarregar(), lista.recarregar(), carregarVacinas()]);
  } catch (e) {
    erro.value = (e as Error).message;
  } finally {
    salvando.value = false;
  }
}

function salvarFilho() {
  const nome = formFilho.nome.trim();
  if (!nome) return (erro.value = "Informe o nome do filho.");
  const idade = formFilho.modo === "idade" ? Number(formFilho.idade) : null;
  if (formFilho.modo === "idade" && (!formFilho.idade.trim() || !Number.isInteger(idade))) return (erro.value = "Informe a idade em anos.");
  const corpo = { nome, nascimento: formFilho.modo === "nascimento" ? formFilho.nascimento || null : null, idadeAproximada: idade };
  const atual = painel.value?.modo === "filho" ? painel.value.filho : undefined;
  return executar(() => (atual ? api.patch(`/filhos/${atual.id}`, corpo) : api.post("/filhos", corpo)));
}

function salvarCompromisso() {
  const atual = painel.value?.modo === "compromisso" ? painel.value.atual : undefined;
  if (!atual && !formComp.filhoId) return (erro.value = "Escolha o filho.");
  if (!formComp.titulo.trim()) return (erro.value = "Dê um título ao compromisso.");
  if (formComp.hora && !formComp.data) return (erro.value = "A hora precisa de uma data.");
  const tipo = atual ? (atual.tipo as TipoCompromisso) : formComp.tipo;
  const texto = (s: string) => s.trim() || null;
  const corpo = {
    titulo: formComp.titulo.trim(),
    data: formComp.data || null,
    hora: formComp.hora || null,
    local: texto(formComp.local),
    observacao: texto(formComp.observacao),
    disciplina: tipo === "escola" ? texto(formComp.disciplina) : null,
    amigo: tipo === "aniversario_amigo" ? texto(formComp.amigo) : null,
    presente: tipo === "aniversario_amigo" ? texto(formComp.presente) : null,
    antecedenciaDias: formComp.antecedencia === "" ? null : Number(formComp.antecedencia),
    repetirMeses: tipo === "consulta" && formComp.repetir !== "" ? Number(formComp.repetir) : null,
  };
  return executar(() =>
    atual
      ? api.patch(`/filhos/compromissos/${atual.id}`, corpo)
      : api.post("/filhos/compromissos", { ...corpo, filhoId: Number(formComp.filhoId), tipo, situacao: formComp.jaAconteceu ? "concluido" : undefined }),
  );
}

function salvarVacina() {
  if (painel.value?.modo !== "vacina") return;
  if (!formVacina.vacina.trim()) return (erro.value = "Informe o nome da vacina.");
  if (formVacina.proxima === "data" && !formVacina.proximaData) return (erro.value = "Informe a data da próxima dose.");
  const corpo = {
    filhoId: painel.value.filho.id,
    vacina: formVacina.vacina.trim(),
    dose: formVacina.dose.trim() || null,
    data: formVacina.data,
    proximaEmMeses: formVacina.proxima === "meses" ? Number(formVacina.meses) : null,
    proximaData: formVacina.proxima === "data" ? formVacina.proximaData : null,
  };
  return executar(() => api.post("/filhos/vacinas", corpo));
}

const acionar = (c: CompromissoFilho, acao: AcaoCompromisso) => executar(() => api.patch(`/filhos/compromissos/${c.id}`, { acao }));

function apagar(c: CompromissoFilho) {
  if (!confirm(`Apagar "${c.titulo}" de ${c.filhoNome}? Para guardar o histórico, cancele em vez de apagar.`)) return;
  return executar(() => api.del(`/filhos/compromissos/${c.id}`));
}

function cancelarAberto() {
  const atual = painel.value?.modo === "compromisso" ? painel.value.atual : undefined;
  if (!atual || !confirm(`Cancelar "${atual.titulo}"? A Lia não avisa mais dele.`)) return;
  return executar(() => api.patch(`/filhos/compromissos/${atual.id}`, { acao: "cancelar" }));
}

function removerFilho(f: Filho) {
  if (!confirm(`Remover ${f.nome}? Os compromissos e as vacinas dele também são apagados. Não tem volta.`)) return;
  if (filtro.filho === String(f.id)) filtro.filho = "";
  if (vacinasDe.value?.id === f.id) vacinasDe.value = null;
  return executar(() => api.del(`/filhos/${f.id}`));
}
</script>

<template>
  <div>
    <div class="page-head">
      <RouterLink class="icon-btn" to="/agenda" aria-label="Voltar para Agenda"><AppIcon name="voltar" /></RouterLink>
      <div>
        <h1>Filhos</h1>
        <p>Provas, vacinas, consultas e aniversários de amiguinhos. A Lia avisa na véspera, no seu WhatsApp.</p>
      </div>
      <span class="spacer" />
      <button class="btn" :disabled="noLimite" :title="noLimite ? 'Limite de filhos por conta' : undefined" @click="abrirFilho()"><AppIcon name="mais" :size="16" /> Filho</button>
      <button class="btn primary" :disabled="!cartoes.length" @click="abrirCompromisso()"><AppIcon name="mais" :size="16" /> Compromisso</button>
    </div>

    <StatusCarga :carregando="filhos.carregando.value && !filhos.dados.value" :erro="filhos.erro.value" @tentar="filhos.recarregar" />
    <div v-if="erro && !painel" class="aviso erro" role="alert">{{ erro }}</div>

    <EstadoVazio
      v-if="filhos.dados.value && !cartoes.length"
      titulo="Nenhum filho cadastrado"
      texto="Cadastre o primeiro e a Lia passa a avisar os compromissos dele. No WhatsApp: “tenho a Marina, 8 anos” e depois “a Marina tem prova de ciências sexta”."
    >
      <button class="btn primary" @click="abrirFilho()">Cadastrar o primeiro filho</button>
    </EstadoVazio>

    <template v-else-if="filhos.dados.value">
      <AssessorBalao mesa="agenda">
        <template v-if="semana.length">
          <b>{{ plural(semana.length, "compromisso", "compromissos") }}</b> nos próximos 7 dias<template v-if="presentes.length">
            e falta comprar o presente de <b>{{ presentes.map((c) => c.amigo ?? c.titulo).join(", ") }}</b></template>.
        </template>
        <template v-else>nada marcado para os próximos 7 dias. No WhatsApp: “a Marina tem prova de ciências sexta”.</template>
      </AssessorBalao>

      <section class="cartoes">
        <article v-for="f in cartoes" :key="f.id" class="card cartao" :class="{ ativo: filtro.filho === String(f.id) }">
          <div class="cab">
            <div>
              <strong>{{ f.nome }}</strong>
              <span class="idade">{{ idadeTexto(f) }}</span>
            </div>
            <div class="icones">
              <button class="icon-btn" aria-label="Editar filho" title="Editar" @click="abrirFilho(f)"><AppIcon name="editar" :size="16" /></button>
              <button class="icon-btn" aria-label="Remover filho" title="Remover" @click="removerFilho(f)"><AppIcon name="lixo" :size="16" /></button>
            </div>
          </div>
          <div class="prox">
            <template v-if="f.proximo">
              <span class="eyebrow">Próximo</span>
              <b>{{ f.proximo.titulo }}</b>
              <span class="faint">{{ quandoCurto(f.proximo) }}</span>
            </template>
            <span v-else class="faint">Nada marcado.</span>
          </div>
          <div class="botoes">
            <button class="btn ghost" @click="alternarFiltro(f)">{{ filtro.filho === String(f.id) ? "Ver todos" : `Ver só ${f.nome}` }}</button>
            <button class="btn ghost" :aria-expanded="vacinasDe?.id === f.id" @click="alternarVacinas(f)">Vacinas</button>
          </div>
        </article>
      </section>

      <section v-if="vacinasDe" class="card vacinas">
        <div class="cab">
          <div>
            <strong>Vacinas de {{ vacinasDe.nome }}</strong>
            <div class="faint">Só o que você registrou. Não indico vacinas, doses nem prazos: isso é com o calendário oficial e o pediatra.</div>
          </div>
          <button class="btn" @click="abrirVacina(vacinasDe)"><AppIcon name="mais" :size="16" /> Vacina aplicada</button>
        </div>
        <p v-if="!vacinas" class="faint">Carregando…</p>
        <template v-else>
          <p v-if="!vacinas.vacinas.length && !vacinas.proximas.length" class="muted">
            Nenhuma vacina registrada. No WhatsApp: “o {{ vacinasDe.nome }} tomou a 2ª dose da gripe hoje, a próxima é em 6 meses”.
          </p>
          <div v-if="vacinas.vacinas.length">
            <div class="eyebrow">Aplicadas</div>
            <div v-for="v in vacinas.vacinas" :key="v.id" class="list-row">
              <div class="flex1">
                <strong>{{ v.vacina }}</strong><span v-if="v.dose" class="faint"> · {{ v.dose }}</span>
              </div>
              <span class="faint">{{ diaMes(v.aplicadaEm) }}/{{ v.aplicadaEm.slice(0, 4) }}</span>
            </div>
          </div>
          <div v-if="vacinas.proximas.length">
            <div class="eyebrow">Próximas doses</div>
            <LinhaCompromisso v-for="c in vacinas.proximas" :key="c.id ?? c.titulo" :c="c" acoes @acao="acionar" @editar="abrirCompromisso" @apagar="apagar" />
          </div>
        </template>
      </section>

      <div class="eyebrow secao">Esta semana</div>
      <p v-if="!semana.length" class="muted">Nada marcado nos próximos 7 dias.</p>
      <section v-else class="card lista">
        <LinhaCompromisso v-for="c in semana" :key="`${c.id}-${c.data}-${c.filhoId}`" :c="c" acoes @acao="acionar" @editar="abrirCompromisso" @apagar="apagar" />
      </section>

      <div class="eyebrow secao">
        Próximos 30 dias
        <span class="filtros">
          <select v-model="filtro.filho" class="input" aria-label="Filtrar por filho">
            <option value="">Todos os filhos</option>
            <option v-for="f in cartoes" :key="f.id" :value="String(f.id)">{{ f.nome }}</option>
          </select>
          <select v-model="filtro.tipo" class="input" aria-label="Filtrar por tipo">
            <option value="">Todos os tipos</option>
            <option v-for="t in TIPOS" :key="t" :value="t">{{ ROTULO[t] }}</option>
            <option value="aniversario">{{ ROTULO.aniversario }} do filho</option>
          </select>
        </span>
      </div>
      <StatusCarga :carregando="lista.carregando.value && !lista.dados.value" :erro="lista.erro.value" @tentar="lista.recarregar" />
      <p v-if="lista.dados.value && !proximos.length" class="muted">Nenhum compromisso nesse período.</p>
      <section v-else-if="lista.dados.value" class="card lista">
        <LinhaCompromisso v-for="c in proximos" :key="`${c.id}-${c.data}-${c.filhoId}`" :c="c" acoes @acao="acionar" @editar="abrirCompromisso" @apagar="apagar" />
      </section>

      <template v-if="aMarcar.length">
        <div class="eyebrow secao">A marcar</div>
        <section class="card lista">
          <LinhaCompromisso v-for="c in aMarcar" :key="c.id ?? c.titulo" :c="c" acoes @acao="acionar" @editar="abrirCompromisso" @apagar="apagar" />
        </section>
        <p class="faint dica">Sem data não há aviso de dia. A Lia lembra disso uma vez por semana.</p>
      </template>
    </template>

    <PainelLateral
      v-if="painel"
      :titulo="
        painel.modo === 'filho'
          ? painel.filho ? 'Editar filho' : 'Novo filho'
          : painel.modo === 'vacina' ? `Vacina aplicada de ${painel.filho.nome}` : painel.atual ? 'Editar compromisso' : 'Novo compromisso'
      "
      @fechar="painel = null"
    >
      <template v-if="painel.modo === 'filho'">
        <label class="field"><span>Nome ou apelido</span><input v-model="formFilho.nome" class="input" maxlength="40" placeholder="Ex.: Marina" autofocus /></label>
        <div class="segmentos">
          <button type="button" :class="{ ativo: formFilho.modo === 'nascimento' }" @click="formFilho.modo = 'nascimento'">Data de nascimento</button>
          <button type="button" :class="{ ativo: formFilho.modo === 'idade' }" @click="formFilho.modo = 'idade'">Só a idade</button>
        </div>
        <label v-if="formFilho.modo === 'nascimento'" class="field"><span>Nascimento</span><input v-model="formFilho.nascimento" class="input" type="date" :max="HOJE" /></label>
        <template v-else>
          <label class="field"><span>Idade em anos</span><input v-model="formFilho.idade" class="input" inputmode="numeric" placeholder="Ex.: 8" /></label>
          <p class="faint">Sem a data de nascimento, a Lia não avisa o aniversário do filho.</p>
        </template>
      </template>

      <template v-else-if="painel.modo === 'vacina'">
        <label class="field"><span>Vacina</span><input v-model="formVacina.vacina" class="input" maxlength="60" placeholder="Ex.: Gripe" autofocus /></label>
        <div class="duas">
          <label class="field"><span>Dose</span><input v-model="formVacina.dose" class="input" maxlength="20" placeholder="Ex.: 2ª dose, reforço" /></label>
          <label class="field"><span>Aplicada em</span><input v-model="formVacina.data" class="input" type="date" :max="HOJE" /></label>
        </div>
        <div class="segmentos">
          <button type="button" :class="{ ativo: formVacina.proxima === 'nenhuma' }" @click="formVacina.proxima = 'nenhuma'">Sem próxima dose</button>
          <button type="button" :class="{ ativo: formVacina.proxima === 'meses' }" @click="formVacina.proxima = 'meses'">Em N meses</button>
          <button type="button" :class="{ ativo: formVacina.proxima === 'data' }" @click="formVacina.proxima = 'data'">Numa data</button>
        </div>
        <label v-if="formVacina.proxima === 'meses'" class="field">
          <span>Próxima dose daqui a</span>
          <select v-model="formVacina.meses" class="input">
            <option v-for="m in MESES_DE_REPETICAO" :key="m" :value="String(m)">{{ m }} {{ m === 1 ? "mês" : "meses" }}</option>
          </select>
        </label>
        <label v-else-if="formVacina.proxima === 'data'" class="field"><span>Data da próxima dose</span><input v-model="formVacina.proximaData" class="input" type="date" :min="HOJE" /></label>
        <p class="faint">A próxima dose vira um compromisso com aviso. Eu não indico vacinas, doses nem prazos: use as datas que o pediatra ou a carteirinha disseram.</p>
      </template>

      <template v-else-if="painel.modo === 'compromisso'">
        <label class="field">
          <span>Filho</span>
          <select v-model="formComp.filhoId" class="input" :disabled="!!painel.atual">
            <option v-for="f in cartoes" :key="f.id" :value="String(f.id)">{{ f.nome }}</option>
          </select>
        </label>
        <label class="field">
          <span>Tipo</span>
          <select v-model="formComp.tipo" class="input" :disabled="!!painel.atual">
            <option v-for="t in TIPOS" :key="t" :value="t">{{ ROTULO[t] }}</option>
          </select>
        </label>
        <label class="field"><span>Título</span><input v-model="formComp.titulo" class="input" maxlength="80" placeholder="Ex.: Prova de ciências, Dentista" autofocus /></label>
        <div class="duas">
          <label class="field"><span>Data (vazio = a marcar)</span><input v-model="formComp.data" class="input" type="date" /></label>
          <label class="field"><span>Hora</span><input v-model="formComp.hora" class="input" type="time" /></label>
        </div>
        <label v-if="formComp.tipo === 'escola'" class="field"><span>Disciplina</span><input v-model="formComp.disciplina" class="input" maxlength="40" placeholder="Ex.: Ciências" /></label>
        <template v-if="formComp.tipo === 'aniversario_amigo'">
          <label class="field"><span>Nome do amigo</span><input v-model="formComp.amigo" class="input" maxlength="40" /></label>
          <label class="field"><span>Ideia de presente</span><input v-model="formComp.presente" class="input" maxlength="80" placeholder="Ex.: quebra-cabeça" /></label>
        </template>
        <label class="field"><span>Local</span><input v-model="formComp.local" class="input" maxlength="80" /></label>
        <label class="field">
          <span>Avisar</span>
          <select v-model="formComp.antecedencia" class="input">
            <option v-for="a in ANTECEDENCIAS" :key="a.valor" :value="a.valor">{{ a.texto }}</option>
          </select>
        </label>
        <label v-if="formComp.tipo === 'consulta'" class="field">
          <span>Repetir depois de concluída</span>
          <select v-model="formComp.repetir" class="input">
            <option value="">Não repete</option>
            <option v-for="m in MESES_DE_REPETICAO" :key="m" :value="String(m)">A cada {{ m }} {{ m === 1 ? "mês" : "meses" }}</option>
          </select>
        </label>
        <label class="field"><span>Observação</span><textarea v-model="formComp.observacao" class="input" rows="2" maxlength="300" /></label>
        <label v-if="!painel.atual" class="marcar"><input v-model="formComp.jaAconteceu" type="checkbox" /> Já aconteceu (só registrar, sem aviso)</label>
      </template>

      <p v-if="erro" class="erro">{{ erro }}</p>
      <template #rodape>
        <button class="btn primary" :disabled="salvando" @click="painel.modo === 'filho' ? salvarFilho() : painel.modo === 'vacina' ? salvarVacina() : salvarCompromisso()">{{ salvando ? "Salvando…" : "Salvar" }}</button>
        <button v-if="painel.modo === 'compromisso' && painel.atual && painel.atual.situacao === 'aberto'" class="btn danger" :disabled="salvando" @click="cancelarAberto">Cancelar compromisso</button>
        <button class="btn ghost" @click="painel = null">Fechar</button>
      </template>
    </PainelLateral>
  </div>
</template>

<style scoped>
.secao { margin: 32px 0 10px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.filtros { display: flex; gap: 8px; margin-left: auto; text-transform: none; letter-spacing: 0; }
.filtros .input { height: 34px; padding: 0 10px; font-size: 13px; }
.lista { padding: 4px 20px; }
.cartoes { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; margin-top: 20px; }
.cartao { padding: 18px 20px; display: grid; gap: 14px; align-content: start; }
.cartao.ativo { border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
.cab { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
.cab strong { font-size: 18px; font-weight: 500; }
.idade { margin-left: 8px; font-size: 13px; color: var(--text-3); }
.botoes { display: flex; gap: 8px; flex-wrap: wrap; }
.vacinas { margin-top: 14px; padding: 18px 20px; display: grid; gap: 14px; }
.vacinas .cab strong { font-size: 16px; }
.vacinas .cab .faint { margin-top: 4px; max-width: 520px; }
.flex1 { flex: 1; min-width: 0; }
.icones { display: flex; gap: 6px; }
.icones .icon-btn { width: 32px; height: 32px; }
.prox { display: grid; gap: 2px; min-height: 52px; }
.prox b { font-weight: 500; }
.faint { font-size: 13px; }
.dica { margin-top: 10px; }
.muted { margin: 0; }
.duas { display: grid; grid-template-columns: 1fr 120px; gap: 12px; }
.marcar { display: flex; gap: 10px; align-items: center; font-size: 14px; color: var(--text-2); }
.marcar input { accent-color: var(--accent); width: 16px; height: 16px; }
.segmentos { display: flex; background: var(--glass); border: 1px solid var(--line); border-radius: 999px; padding: 3px; }
.segmentos button { flex: 1; border: 0; background: transparent; padding: 6px 14px; border-radius: 999px; cursor: pointer; color: var(--text-2); font-size: 14px; }
.segmentos button.ativo { background: var(--glass-2); color: var(--text); box-shadow: inset 0 0 0 1px var(--line-strong); }
.erro { color: var(--danger); margin: 0; }
p { margin: 0; }
@media (max-width: 600px) {
  .filtros { margin-left: 0; width: 100%; }
  .filtros .input { flex: 1; min-width: 0; }
  .duas { grid-template-columns: 1fr; }
}
</style>
