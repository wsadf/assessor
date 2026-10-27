<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  api,
  PERFIS,
  type Acessos,
  type ContadorDaConta,
  type Convite,
  type ConviteContador,
  type ConviteContadorCriado,
  type ConviteCriado,
  type PerfilMembro,
} from "../../api";
import AppIcon from "../../components/AppIcon.vue";
import AssessorBalao from "../../components/AssessorBalao.vue";
import EstadoVazio from "../../components/EstadoVazio.vue";
import PainelLateral from "../../components/PainelLateral.vue";
import StatusCarga from "../../components/StatusCarga.vue";
import { diaMes } from "../../format";
import { useCarregar } from "../../estado";

const { dados: a, carregando, erro, recarregar } = useCarregar(() => api.get<Acessos>("/conta/acessos"));
const convites = useCarregar(async () => (a.value?.podeGerir ? (await api.get<{ convites: Convite[] }>("/conta/convites")).convites : []), [a]);

const PERFIS_CONVITE = ["completo", "so_gastos", "agenda_tarefas"] as const satisfies readonly PerfilMembro[];
const ESTADO: Record<Convite["estado"], { rotulo: string; classe: string }> = {
  pendente: { rotulo: "aguardando", classe: "warning" },
  aceito: { rotulo: "aceito", classe: "ok" },
  cancelado: { rotulo: "cancelado", classe: "" },
  expirado: { rotulo: "vencido", classe: "danger" },
};

const pessoas = computed(() => (a.value ? a.value.membros.length + 1 : 0));
const pendentes = computed(() => (convites.dados.value ?? []).filter((c) => c.estado === "pendente").length);

const convidando = ref(false);
const form = reactive({ perfil: "completo" as PerfilMembro, rotulo: "" });
const criado = ref<ConviteCriado | null>(null);
const erroAcao = ref<string | null>(null);
const enviando = ref(false);
const copiado = ref(false);

function abrirConvite() {
  Object.assign(form, { perfil: "completo", rotulo: "" });
  criado.value = null;
  erroAcao.value = null;
  convidando.value = true;
}

async function gerar() {
  enviando.value = true;
  erroAcao.value = null;
  try {
    criado.value = await api.post<ConviteCriado>("/conta/convites", { perfil: form.perfil, rotulo: form.rotulo.trim() || null });
    await convites.recarregar();
  } catch (e) {
    erroAcao.value = (e as Error).message;
  } finally {
    enviando.value = false;
  }
}

async function copiar() {
  if (!criado.value) return;
  try {
    await navigator.clipboard.writeText(criado.value.codigo);
    copiado.value = true;
    setTimeout(() => (copiado.value = false), 2000);
  } catch {
    // Sem permissao de area de transferencia: o codigo continua visivel para copiar a mao.
  }
}

const linkWhatsapp = computed(() => (criado.value ? `https://wa.me/?text=${encodeURIComponent(criado.value.mensagemWhatsapp)}` : "#"));

async function cancelar(c: Convite) {
  if (!confirm(`Cancelar o convite que termina em ${c.final}?`)) return;
  await api.del(`/conta/convites/${c.id}`).catch((e: Error) => alert(e.message));
  await convites.recarregar();
}

const contador = useCarregar(
  async () => (a.value?.podeGerir ? api.get<{ convites: ConviteContador[]; contadores: ContadorDaConta[] }>("/conta/contador") : null),
  [a],
);
const contadorPendentes = computed(() => (contador.dados.value?.convites ?? []).filter((c) => c.estado === "pendente"));
const convidandoContador = ref(false);
const rotuloContador = ref("");
const criadoContador = ref<ConviteContadorCriado | null>(null);

function abrirContador() {
  rotuloContador.value = "";
  criadoContador.value = null;
  erroAcao.value = null;
  convidandoContador.value = true;
}

async function gerarContador() {
  enviando.value = true;
  erroAcao.value = null;
  try {
    criadoContador.value = await api.post<ConviteContadorCriado>("/conta/contador/convites", { rotulo: rotuloContador.value.trim() || null });
    await contador.recarregar();
  } catch (e) {
    erroAcao.value = (e as Error).message;
  } finally {
    enviando.value = false;
  }
}

async function copiarTexto(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    copiado.value = true;
    setTimeout(() => (copiado.value = false), 2000);
  } catch {
    // Sem permissao de area de transferencia: o texto continua visivel para copiar a mao.
  }
}

async function cancelarContador(c: ConviteContador) {
  if (!confirm(`Cancelar o convite de contador que termina em ${c.final}?`)) return;
  await api.del(`/conta/contador/convites/${c.id}`).catch((e: Error) => alert(e.message));
  await contador.recarregar();
}

async function revogar(c: ContadorDaConta) {
  if (!confirm(`Tirar o acesso de ${c.nome ?? c.rotulo ?? "contador"}? Ele deixa de ver o dossiê na hora.`)) return;
  await api.del(`/conta/contador/${c.id}`).catch((e: Error) => alert(e.message));
  await contador.recarregar();
}

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function mudarPerfil(telefone: string | null, perfil: PerfilMembro) {
  if (!telefone) return;
  await api.patch(`/conta/membros/${telefone}`, { perfil }).catch((e: Error) => alert(e.message));
  await recarregar();
}

async function remover(m: Acessos["membros"][number]) {
  if (!m.telefone || !confirm(`Remover ${m.nome ?? "esta pessoa"} da conta? O que ela lançou continua aqui.`)) return;
  await api.del(`/conta/membros/${m.telefone}`).catch((e: Error) => alert(e.message));
  await recarregar();
}
</script>

<template>
  <div>
    <div class="page-head">
      <RouterLink class="icon-btn" to="/operacao" aria-label="Voltar para Operação"><AppIcon name="voltar" /></RouterLink>
      <div>
        <h1>Equipe e acesso</h1>
        <p>Quem usa esta conta, cada um com o próprio WhatsApp.</p>
      </div>
      <span class="spacer" />
      <button v-if="a?.podeGerir" class="btn primary" @click="abrirConvite"><AppIcon name="mais" :size="16" /> Convidar alguém</button>
    </div>

    <StatusCarga :carregando="carregando && !a" :erro="erro" @tentar="recarregar" />

    <template v-if="a">
      <AssessorBalao mesa="operacao">
        <template v-if="a.podeGerir && !a.membros.length">só você por enquanto. Gere um convite para trazer alguém da família ou da equipe: cada pessoa usa o próprio WhatsApp e alimenta a mesma conta.</template>
        <template v-else-if="a.podeGerir">
          <b>{{ pessoas }} pessoas</b> nesta conta<template v-if="pendentes">, e {{ pendentes }} {{ pendentes === 1 ? "convite aguardando" : "convites aguardando" }}</template>.
        </template>
        <template v-else>só o titular, <b>{{ a.titular.nome ?? "dono da conta" }}</b>, convida pessoas e muda os acessos.</template>
      </AssessorBalao>

      <section class="card lista">
        <div class="list-row">
          <span class="iniciais">{{ (a.titular.nome ?? "T")[0] }}</span>
          <div class="flex1">
            <strong>{{ a.titular.nome ?? "Titular" }}</strong>
            <div class="faint">{{ a.titular.telefoneMascarado }}</div>
          </div>
          <span class="chip ok">{{ PERFIS.titular.nome }}</span>
        </div>
        <div v-for="m in a.membros" :key="m.telefoneMascarado + m.desde" class="list-row">
          <span class="iniciais">{{ (m.nome ?? "?")[0] }}</span>
          <div class="flex1">
            <strong>{{ m.nome ?? "Sem nome" }}<span v-if="m.voce" class="faint"> · você</span></strong>
            <div class="faint">{{ m.telefoneMascarado }} · desde {{ diaMes(m.desde) }}</div>
          </div>
          <template v-if="a.podeGerir">
            <select class="input perfil" :value="m.perfil" aria-label="Perfil" @change="mudarPerfil(m.telefone, ($event.target as HTMLSelectElement).value as PerfilMembro)">
              <option v-for="p in PERFIS_CONVITE" :key="p" :value="p">{{ PERFIS[p].nome }}</option>
            </select>
            <button class="icon-btn" :aria-label="`Remover ${m.nome ?? 'pessoa'}`" title="Remover da conta" @click="remover(m)"><AppIcon name="lixo" :size="16" /></button>
          </template>
          <span v-else class="chip">{{ PERFIS[m.perfil].nome }}</span>
        </div>
      </section>

      <template v-if="a.podeGerir">
        <div class="eyebrow secao">Convites dos últimos 30 dias</div>
        <EstadoVazio v-if="convites.dados.value && !convites.dados.value.length" titulo="Nenhum convite ainda" texto="Gere um código e mande para quem você quer na conta." />
        <section v-else-if="convites.dados.value" class="card lista">
          <div v-for="c in convites.dados.value" :key="c.id" class="list-row">
            <code class="codigo-final">…{{ c.final }}</code>
            <div class="flex1">
              <strong>{{ c.rotulo ?? PERFIS[c.perfil].nome }}</strong>
              <div class="faint">
                {{ PERFIS[c.perfil].nome }}
                <template v-if="c.estado === 'aceito' && c.aceitoPor"> · entrou {{ c.aceitoPor }}</template>
                <template v-else-if="c.estado === 'pendente'"> · vale até {{ diaMes(c.validoAte) }}</template>
              </div>
            </div>
            <span class="chip" :class="ESTADO[c.estado].classe">{{ ESTADO[c.estado].rotulo }}</span>
            <button v-if="c.estado === 'pendente'" class="btn ghost" @click="cancelar(c)">Cancelar</button>
          </div>
        </section>

        <div class="secao-cab">
          <div class="eyebrow">Contador</div>
          <button class="btn" @click="abrirContador"><AppIcon name="mais" :size="16" /> Convidar contador</button>
        </div>
        <AssessorBalao mesa="operacao">
          o contador entra com a própria conta e vê, só para leitura, os lançamentos e as notas, comprovantes e boletos de cada mês, e baixa
          tudo num arquivo. Documentos de saúde e pessoais ficam de fora. Ele não conversa comigo pela sua conta.
        </AssessorBalao>
        <section v-if="contador.dados.value && (contador.dados.value.contadores.length || contadorPendentes.length)" class="card lista">
          <div v-for="c in contador.dados.value.contadores" :key="`a${c.id}`" class="list-row">
            <span class="iniciais">{{ (c.nome ?? "C")[0] }}</span>
            <div class="flex1">
              <strong>{{ c.nome ?? "Contador" }}<span v-if="c.rotulo" class="faint"> · {{ c.rotulo }}</span></strong>
              <div class="faint">desde {{ diaMes(c.desde) }} · {{ c.ultimoAcesso ? `último acesso ${dataHora(c.ultimoAcesso)}` : "ainda não abriu o dossiê" }}</div>
            </div>
            <button class="btn ghost" @click="revogar(c)">Revogar</button>
          </div>
          <div v-for="c in contadorPendentes" :key="`c${c.id}`" class="list-row">
            <code class="codigo-final">…{{ c.final }}</code>
            <div class="flex1">
              <strong>{{ c.rotulo ?? "Convite de contador" }}</strong>
              <div class="faint">vale até {{ diaMes(c.validoAte) }}</div>
            </div>
            <span class="chip warning">aguardando</span>
            <button class="btn ghost" @click="cancelarContador(c)">Cancelar</button>
          </div>
        </section>
      </template>
    </template>

    <PainelLateral v-if="convidandoContador" titulo="Convidar contador" @fechar="convidandoContador = false">
      <template v-if="!criadoContador">
        <label class="field"><span>Quem é (opcional)</span><input v-model="rotuloContador" class="input" maxlength="40" placeholder="Ex.: Escritório Silva" /></label>
        <p class="muted">O contador usa o código em <b>Criar conta</b> (ou em <b>Clientes</b>, se já tiver conta) e passa a ver o dossiê de cada mês.</p>
        <p v-if="erroAcao" class="erro">{{ erroAcao }}</p>
      </template>
      <template v-else>
        <div class="aviso info">Código pronto. Ele aparece só agora, vale até <b>{{ diaMes(criadoContador.validoAte) }}</b> e serve uma vez.</div>
        <div class="codigo-grande num">{{ criadoContador.codigo }}</div>
        <p class="muted">{{ criadoContador.mensagemWhatsapp }}</p>
      </template>
      <template #rodape>
        <template v-if="!criadoContador">
          <button class="btn primary" :disabled="enviando" @click="gerarContador">{{ enviando ? "Gerando…" : "Gerar código" }}</button>
          <button class="btn ghost" @click="convidandoContador = false">Cancelar</button>
        </template>
        <template v-else>
          <a class="btn primary" :href="`https://wa.me/?text=${encodeURIComponent(criadoContador.mensagemWhatsapp)}`" target="_blank" rel="noopener">Enviar no WhatsApp</a>
          <button class="btn" @click="copiarTexto(criadoContador.codigo)"><AppIcon name="check" v-if="copiado" :size="16" />{{ copiado ? "Copiado" : "Copiar código" }}</button>
          <button class="btn ghost" @click="convidandoContador = false">Fechar</button>
        </template>
      </template>
    </PainelLateral>

    <PainelLateral v-if="convidando" titulo="Convidar alguém" @fechar="convidando = false">
      <template v-if="!criado">
        <div class="field">
          <span>O que a pessoa pode ver e fazer</span>
          <button
            v-for="p in PERFIS_CONVITE"
            :key="p"
            type="button"
            class="opcao"
            :class="{ escolhida: form.perfil === p }"
            :aria-pressed="form.perfil === p"
            @click="form.perfil = p"
          >
            <strong>{{ PERFIS[p].nome }}</strong>
            <small>{{ PERFIS[p].detalhe }}</small>
          </button>
        </div>
        <label class="field"><span>Quem é (opcional)</span><input v-model="form.rotulo" class="input" maxlength="40" placeholder="Ex.: Bia, sócio" /></label>
        <p v-if="erroAcao" class="erro">{{ erroAcao }}</p>
      </template>
      <template v-else>
        <div class="aviso info">Código pronto. Ele aparece só agora, vale até <b>{{ diaMes(criado.validoAte) }}</b> e serve uma vez.</div>
        <div class="codigo-grande num">{{ criado.codigo }}</div>
        <p class="muted">A pessoa usa o código em <b>Criar conta</b>, com o próprio WhatsApp, e entra com o perfil {{ PERFIS[criado.perfil].nome.toLowerCase() }}.</p>
      </template>
      <template #rodape>
        <template v-if="!criado">
          <button class="btn primary" :disabled="enviando" @click="gerar">{{ enviando ? "Gerando…" : "Gerar convite" }}</button>
          <button class="btn ghost" @click="convidando = false">Cancelar</button>
        </template>
        <template v-else>
          <a class="btn primary" :href="linkWhatsapp" target="_blank" rel="noopener">Enviar no WhatsApp</a>
          <button class="btn" @click="copiar"><AppIcon name="check" v-if="copiado" :size="16" />{{ copiado ? "Copiado" : "Copiar código" }}</button>
          <button class="btn ghost" @click="convidando = false">Fechar</button>
        </template>
      </template>
    </PainelLateral>
  </div>
</template>

<style scoped>
.lista { padding: 4px 20px; margin-top: 20px; }
.list-row { gap: 14px; }
.flex1 { flex: 1; min-width: 0; }
.flex1 strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.faint { font-size: 13px; }
.iniciais { width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--line-strong); display: grid; place-items: center; font-weight: 600; }
.perfil { width: auto; min-width: 170px; }
.secao { margin: 36px 0 0; }
.secao-cab { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 40px 0 12px; }
.codigo-final { font-size: 15px; color: var(--text-2); min-width: 44px; }
.opcao {
  display: grid;
  gap: 2px;
  text-align: left;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1.5px solid var(--line-strong);
  background: var(--surface-2);
  cursor: pointer;
}
.opcao small { color: var(--text-2); font-size: 13px; }
.opcao.escolhida { border-color: var(--mesa); background: color-mix(in srgb, var(--mesa) 12%, transparent); }
.codigo-grande { font-size: 34px; font-weight: 700; letter-spacing: 0.08em; text-align: center; padding: 18px; border: 1px dashed var(--line-strong); border-radius: 14px; user-select: all; }
.muted b { color: var(--text); }
.erro { color: var(--danger); margin: 0; }
p { margin: 0; }
@media (max-width: 600px) {
  .perfil { min-width: 0; max-width: 140px; }
}
</style>
