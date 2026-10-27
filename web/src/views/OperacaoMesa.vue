<script setup lang="ts">
import { computed } from "vue";
import { api, PERFIS, type Acessos, type Operacao } from "../api";
import AssessorAvatar from "../components/AssessorAvatar.vue";
import AssessorBalao from "../components/AssessorBalao.vue";
import BlocoMesa from "../components/BlocoMesa.vue";
import GraficoBarras from "../components/graficos/GraficoBarras.vue";
import StatusCarga from "../components/StatusCarga.vue";
import ValorGrande from "../components/ValorGrande.vue";
import { mesCurto } from "../format";
import { useCarregar } from "../estado";
import { MESAS } from "../mesas";

const { dados: o, carregando, erro, recarregar } = useCarregar(() => api.get<Operacao>("/operacao"));
const { dados: acessos } = useCarregar(() => api.get<Acessos>("/conta/acessos"));
const pessoas = computed(() => (acessos.value ? acessos.value.membros.length + 1 : 0));

const inteiro = (v: number) => v.toLocaleString("pt-BR");
const serie = computed(() => ({
  rotulos: (o.value?.porMes ?? []).map((p) => mesCurto(p.mes)),
  series: [
    { nome: "Lançamentos", cor: "#10b981", valores: (o.value?.porMes ?? []).map((p) => p.lancamentos) },
    { nome: "Lembretes", cor: "#5b9cf6", valores: (o.value?.porMes ?? []).map((p) => p.lembretes) },
    { nome: "Tarefas", cor: "#f3b23c", valores: (o.value?.porMes ?? []).map((p) => p.tarefas) },
  ],
}));

// Fiscal e Pesquisas ainda nao tem backend; a mesa mostra isso em vez de fingir atividade.
const EM_PREPARACAO = new Set(["fiscal", "pesquisas"]);
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Operação</h1>
        <p>Tudo o que a equipe registrou por você, mês a mês.</p>
      </div>
    </div>

    <StatusCarga :carregando="carregando && !o" :erro="erro" @tentar="recarregar" />

    <template v-if="o">
      <BlocoMesa titulo="O movimento">
        <ValorGrande :valor="o.registrosNoMes" :moeda="false" sufixo="registros este mês" />
        <div class="mini">
          <div><span class="eyebrow">Últimos 12m</span><strong class="num">{{ inteiro(o.ultimos12) }}</strong></div>
          <div><span class="eyebrow">Média por mês</span><strong class="num">{{ inteiro(o.mediaMensal) }}</strong></div>
          <div><span class="eyebrow">Tarefas abertas</span><strong class="num">{{ o.tarefasAbertas }}</strong></div>
          <div><span class="eyebrow">Concluídas</span><strong class="num">{{ o.tarefasConcluidas }}</strong></div>
          <div><span class="eyebrow">Lembretes ativos</span><strong class="num">{{ o.lembretesAtivos }}</strong></div>
          <div><span class="eyebrow">Mensagens no mês</span><strong class="num">{{ o.mensagensNoMes }}</strong></div>
        </div>
        <AssessorBalao mesa="operacao">
          a equipe manteve o registro vivo: <b>{{ inteiro(o.ultimos12) }} registros em 12 meses</b>, sem você abrir planilha.
        </AssessorBalao>
        <template #lado>
          <GraficoBarras :rotulos="serie.rotulos" :series="serie.series" empilhado :altura="260" :formatar="inteiro" />
          <div class="eyebrow faint rodape">Registros por mês: lançamentos pela data do gasto, lembretes e tarefas pela data de criação</div>
        </template>
      </BlocoMesa>

      <BlocoMesa v-if="acessos" titulo="Quem usa esta conta">
        <ValorGrande :valor="pessoas" :moeda="false" :sufixo="pessoas === 1 ? 'pessoa' : 'pessoas'" />
        <AssessorBalao mesa="operacao">
          <template v-if="acessos.podeGerir">cada pessoa conversa pelo próprio WhatsApp e alimenta a mesma conta. Você decide o que cada uma vê.</template>
          <template v-else>você está na conta de <b>{{ acessos.titular.nome ?? "titular" }}</b>. Só o titular muda os acessos.</template>
        </AssessorBalao>
        <RouterLink class="btn primary" to="/operacao/acessos">Equipe e acesso →</RouterLink>
        <template #lado>
          <div class="equipe">
            <div class="membro">
              <span class="iniciais">{{ (acessos.titular.nome ?? "T")[0] }}</span>
              <div class="flex1"><strong>{{ acessos.titular.nome ?? "Titular" }}</strong></div>
              <span class="chip ok">{{ PERFIS.titular.nome }}</span>
            </div>
            <div v-for="m in acessos.membros" :key="m.telefoneMascarado" class="membro">
              <span class="iniciais">{{ (m.nome ?? "?")[0] }}</span>
              <div class="flex1"><strong>{{ m.nome ?? "Sem nome" }}</strong></div>
              <span class="chip">{{ PERFIS[m.perfil].nome }}</span>
            </div>
          </div>
        </template>
      </BlocoMesa>

      <BlocoMesa titulo="Sua equipe">
        <AssessorBalao mesa="operacao">
          eu coordeno as mesas. Quando um pedido mistura assuntos, divido entre a equipe e você recebe uma resposta só. A IA de hoje é o <b>{{ o.ia }}</b>.
        </AssessorBalao>
        <template #lado>
          <div class="equipe">
            <RouterLink v-for="m in MESAS" :key="m.id" :to="m.rota" class="membro">
              <AssessorAvatar :mesa="m.id" :size="40" />
              <div class="flex1">
                <strong>{{ m.assessor }}</strong>
                <div class="faint">{{ m.cargo }} · {{ m.nome }}</div>
              </div>
              <span class="chip" :class="EM_PREPARACAO.has(m.id) ? 'warning' : 'ok'">{{ EM_PREPARACAO.has(m.id) ? "em preparação" : "ativo 24h" }}</span>
            </RouterLink>
          </div>
        </template>
      </BlocoMesa>
    </template>
  </div>
</template>

<style scoped>
.mini { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px 16px; }
.mini > div { display: grid; gap: 4px; }
.mini strong { font-size: 20px; }
.rodape { margin-top: 16px; font-size: 10.5px; }
.equipe { display: grid; gap: 4px; }
.membro { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 12px; }
.membro:hover { background: var(--surface); }
.flex1 { flex: 1; min-width: 0; }
.faint { font-size: 13px; }
.iniciais { width: 40px; height: 40px; flex: none; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--line-strong); display: grid; place-items: center; font-weight: 600; }
</style>
