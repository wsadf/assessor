<script setup lang="ts">
import { onMounted } from "vue";
import { sessao } from "../api";
import AppIcon from "../components/AppIcon.vue";
import AssessorAvatar from "../components/AssessorAvatar.vue";
import { MESAS } from "../mesas";

const logado = Boolean(sessao());

const FUNCOES: Record<string, { texto: string; breve?: boolean }> = {
  financas: { texto: "Registra gastos e receitas, separa por categoria e mostra para onde foi o dinheiro." },
  fiscal: { texto: "Acompanha o que entra como receita e deixa pronta a base para as notas fiscais." },
  agenda: { texto: "Transforma uma frase ou um áudio em lembrete e avisa na hora certa." },
  tarefas: { texto: "Anota tarefas com prazo e prioridade e cobra o que ficou para trás." },
  operacao: { texto: "Manda o resumo da manhã e mostra tudo o que a equipe resolveu no mês." },
  pesquisas: { texto: "Pesquisa um assunto por você e devolve um resumo com as fontes.", breve: true },
};

const DIA = [
  { hora: "07:00", mesa: "operacao", titulo: "O resumo do dia chega antes do café.", texto: "Compromissos, tarefas que vencem e como está o mês, numa mensagem só." },
  { hora: "09:15", mesa: "agenda", titulo: "Um áudio no caminho vira lembrete.", texto: "“Me lembra do dentista quinta às 15h.” A Lia entende o dia e a hora e avisa antes." },
  { hora: "12:30", mesa: "financas", titulo: "Pagou o almoço? Já está anotado.", texto: "Uma frase basta. O Bento coloca na categoria certa e diz quanto já foi no mês." },
  { hora: "15:40", mesa: "tarefas", titulo: "Aquela pendência não fica esquecida.", texto: "O Davi guarda o prazo e a prioridade e lembra você do que está atrasado." },
  { hora: "21:00", mesa: "financas", titulo: "Uma pergunta e a conta fecha.", texto: "“Quanto gastei de mercado esse mês?” A resposta vem em segundos, com os lançamentos." },
];

const PEDIDOS = [
  "bom dia! o que eu tenho hoje?",
  "gastei 62 na farmácia",
  "recebi 800 do freela",
  "paguei 120 de luz no pix",
  "quanto foi de mercado em outubro?",
  "me lembra de pagar o aluguel todo dia 5",
  "cria a tarefa revisar contrato pra sexta",
  "quanto mandei pra Ana esse mês?",
  "comprei uma tv em 10x de 280",
  "quais tarefas estão atrasadas?",
  "apaga o último gasto",
  "como fechou o mês passado?",
];

const PLANOS = [
  { id: "mensal", nome: "Mensal", preco: "29,90", nota: "cobrado todo mês, cancele quando quiser" },
  { id: "anual", nome: "Anual", preco: "24,90", nota: "R$ 298,80 por ano, economize 17%", destaque: true },
];

const INCLUI = [
  "Todos os assessores no seu WhatsApp",
  "Mensagens de texto, áudio e foto",
  "Lembretes, tarefas e lançamentos sem limite",
  "Painel completo com as seis mesas",
  "Resumo da manhã todos os dias",
];

const PERGUNTAS = [
  {
    p: "O que acontece depois que eu crio a conta?",
    r: "Você confirma o número com um código de 6 números e já pode mandar mensagem para o assessor no WhatsApp. O painel abre na mesma hora, com as mesmas informações da conversa.",
  },
  { p: "Preciso instalar algum aplicativo?", r: "Não. Tudo acontece no WhatsApp que você já usa. O painel abre no navegador, no computador ou no celular." },
  {
    p: "Como eu peço as coisas?",
    r: "Do jeito que você falaria com uma pessoa, por texto ou áudio. Não existe comando certo: “gastei 40 no uber” e “uber 40” funcionam igual.",
  },
  {
    p: "Meus dados estão seguros?",
    r: "A senha é guardada com criptografia, cada conta só enxerga os próprios dados e nada é compartilhado com terceiros. O assessor não movimenta dinheiro, só anota o que você conta.",
  },
  { p: "Posso cancelar quando quiser?", r: "Sim. Não tem fidelidade, e os 7 primeiros dias são grátis, sem pedir cartão." },
  { p: "Esqueci a senha do painel. E agora?", r: "Em “Esqueceu?”, na tela de entrada, você informa o e-mail e recebe um código no WhatsApp cadastrado para criar uma senha nova." },
];

onMounted(() => (document.title = "Assessor · Sua equipe no WhatsApp"));
</script>

<template>
  <div class="landing">
    <header class="topo">
      <div class="faixa topo-faixa">
        <RouterLink to="/" class="logo" aria-label="assessor, início">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="#10b981" />
            <path d="M9 22l7-13 7 13" stroke="#06140f" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          assessor
        </RouterLink>
        <nav class="links">
          <a href="#como-funciona">Como funciona</a>
          <a href="#equipe">Equipe</a>
          <a href="#painel">Painel</a>
          <a href="#planos">Planos</a>
          <a href="#perguntas">Perguntas</a>
        </nav>
        <div class="acoes">
          <template v-if="logado">
            <RouterLink to="/financas" class="btn primary">Abrir painel <AppIcon name="seta" :size="16" /></RouterLink>
          </template>
          <template v-else>
            <RouterLink to="/entrar" class="btn ghost">Entrar</RouterLink>
            <RouterLink to="/criar-conta" class="btn primary">Começar agora</RouterLink>
          </template>
        </div>
      </div>
    </header>

    <section class="hero faixa">
      <div class="hero-texto">
        <span class="pilula">7 dias grátis · sem cartão</span>
        <h1>Sua rotina organizada começa <span>numa conversa.</span></h1>
        <p class="lead">
          Uma equipe de assessores no seu WhatsApp cuida do seu dinheiro, da sua agenda e das suas tarefas. Você só manda mensagem.
        </p>
        <div class="ctas">
          <RouterLink to="/criar-conta" class="btn primary grande">Montar minha equipe <AppIcon name="seta" :size="16" /></RouterLink>
          <RouterLink :to="logado ? '/financas' : '/entrar'" class="btn ghost grande">{{ logado ? "Abrir painel" : "Já tenho conta" }}</RouterLink>
        </div>
        <ul class="selos">
          <li><AppIcon name="check" :size="15" /> Texto, áudio e foto</li>
          <li><AppIcon name="check" :size="15" /> Sem fidelidade</li>
          <li><AppIcon name="check" :size="15" /> Dados protegidos pela LGPD</li>
        </ul>
      </div>

      <div class="celular" aria-hidden="true">
        <div class="cel-topo">
          <span class="cel-logo">A</span>
          <div>
            <b>Assessor</b>
            <small>online</small>
          </div>
        </div>
        <div class="conversa">
          <div class="msg eu">gastei 62 na farmácia<time>12:31</time></div>
          <div class="msg ele" style="--c: #10b981">
            <span class="quem">Bento · Gerente financeiro</span>
            Anotado ✅ R$ 62,00 em Saúde. No mês já são R$ 214,00.<time>12:31</time>
          </div>
          <div class="msg eu">me lembra do dentista quinta às 15h<time>12:33</time></div>
          <div class="msg ele" style="--c: #5b9cf6">
            <span class="quem">Lia · Secretária executiva</span>
            Combinado. Te aviso quinta às 14h. 📅<time>12:33</time>
          </div>
          <div class="msg ele digitando" style="--c: #f3b23c">
            <span class="quem">Davi · Gerente de projetos</span>
            <span class="pontos"><i /><i /><i /></span>
          </div>
        </div>
      </div>
    </section>

    <div class="tira">
      <div class="faixa tira-faixa">
        <span>WhatsApp Business API oficial</span>
        <span>Senha com criptografia</span>
        <span>Cada conta vê só os próprios dados</span>
        <span>O assessor não movimenta seu dinheiro</span>
      </div>
    </div>

    <section id="equipe" class="faixa bloco">
      <div class="cabeca">
        <span class="eyebrow">Sua equipe</span>
        <h2>Pare de organizar tudo sozinho. Tenha um assessor para cada parte da rotina.</h2>
        <p>Cada um é especialista numa área, e todos trabalham na mesma conversa.</p>
      </div>
      <div class="equipe">
        <article v-for="m in MESAS" :key="m.id" class="membro" :style="{ '--c': m.cor }">
          <div class="membro-topo">
            <AssessorAvatar :mesa="m.id" :size="44" />
            <div>
              <b>{{ m.assessor }}</b>
              <small>{{ m.cargo }}</small>
            </div>
            <span v-if="FUNCOES[m.id]?.breve" class="breve">em breve</span>
          </div>
          <p>{{ FUNCOES[m.id]?.texto }}</p>
          <span class="mesa">Mesa de {{ m.nome }}</span>
        </article>
      </div>
    </section>

    <section id="como-funciona" class="faixa bloco">
      <div class="cabeca">
        <span class="eyebrow">Como funciona</span>
        <h2>Um dia normal. Só que alguém cuidou de tudo.</h2>
        <p>Cinco momentos de um dia comum e o que a sua equipe resolve em cada um deles.</p>
      </div>
      <ol class="dia">
        <li v-for="d in DIA" :key="d.hora">
          <time>{{ d.hora }}</time>
          <AssessorAvatar :mesa="d.mesa" :size="36" />
          <div>
            <h3>{{ d.titulo }}</h3>
            <p>{{ d.texto }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="faixa bloco">
      <div class="cabeca">
        <span class="eyebrow">Sem manual</span>
        <h2>Se você sabe mandar mensagem no WhatsApp, já sabe usar.</h2>
        <p>Peça com as palavras que vierem à cabeça. A equipe entende o que você precisa.</p>
      </div>
      <ul class="pedidos">
        <li v-for="p in PEDIDOS" :key="p">{{ p }}</li>
      </ul>
    </section>

    <section id="painel" class="faixa bloco painel">
      <div class="cabeca">
        <span class="eyebrow">Painel</span>
        <h2>Tudo o que você pede fica organizado para consultar depois.</h2>
        <p>Saldo, categorias, pessoas e lojas, agenda e tarefas. No computador ou no celular, sem digitar nada.</p>
        <RouterLink :to="logado ? '/financas' : '/entrar'" class="btn ghost">
          {{ logado ? "Abrir meu painel" : "Entrar no painel" }} <AppIcon name="seta" :size="16" />
        </RouterLink>
      </div>
      <div class="janela" aria-hidden="true">
        <div class="janela-abas">
          <span v-for="m in MESAS.slice(0, 4)" :key="m.id" :class="{ ativa: m.id === 'financas' }" :style="{ '--c': m.cor }">
            {{ m.nome }}<small>por {{ m.assessor }}</small>
          </span>
        </div>
        <div class="janela-corpo">
          <div>
            <span class="eyebrow">Saldo do período</span>
            <div class="saldo">R$ <b>2.013</b>,74</div>
            <div class="numeros">
              <span>Recebido<b class="pos">R$ 9.615,13</b></span>
              <span>Pago<b>R$ 8.871,77</b></span>
            </div>
            <div class="fala"><b>Bento</b> seu saldo está em R$ 2.013,74, com Moradia puxando os gastos.</div>
          </div>
          <svg viewBox="0 0 300 140" class="grafico">
            <defs>
              <linearGradient id="landing-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stop-color="#10b981" stop-opacity="0.35" />
                <stop offset="1" stop-color="#10b981" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 110 L30 104 L60 98 L90 30 L120 34 L150 52 L180 60 L210 66 L240 74 L270 80 L300 86 L300 140 L0 140 Z" fill="url(#landing-area)" />
            <path d="M0 110 L30 104 L60 98 L90 30 L120 34 L150 52 L180 60 L210 66 L240 74 L270 80 L300 86" fill="none" stroke="#10b981" stroke-width="2.5" />
          </svg>
        </div>
      </div>
    </section>

    <section id="planos" class="faixa bloco">
      <div class="cabeca centro">
        <span class="eyebrow">Planos</span>
        <h2>Contrate a equipe completa.</h2>
        <p>Assessores trabalhando 24 horas por dia, por menos de R$ 1 por dia. Os dois planos liberam tudo.</p>
      </div>
      <div class="planos">
        <article v-for="p in PLANOS" :key="p.id" class="plano" :class="{ destaque: p.destaque }">
          <div class="plano-topo">
            <h3>{{ p.nome }}</h3>
            <span v-if="p.destaque" class="selo">mais escolhido</span>
          </div>
          <div class="preco">R$ <b>{{ p.preco }}</b>/mês</div>
          <small>{{ p.nota }}</small>
          <ul>
            <li v-for="i in INCLUI" :key="i"><AppIcon name="check" :size="15" /> {{ i }}</li>
          </ul>
          <RouterLink :to="{ path: '/criar-conta', query: { plano: p.id } }" class="btn btn-largo" :class="p.destaque ? 'primary' : 'ghost'">
            Começar com o {{ p.nome.toLowerCase() }}
          </RouterLink>
        </article>
      </div>
      <p class="garantia">7 dias para testar, sem cartão. Não gostou, é só não continuar.</p>
    </section>

    <section id="perguntas" class="faixa bloco faq">
      <div class="cabeca">
        <span class="eyebrow">Dúvidas</span>
        <h2>Perguntas frequentes.</h2>
        <p>Não achou a sua? Pergunte direto para o assessor no WhatsApp.</p>
      </div>
      <div class="lista-faq">
        <details v-for="(q, i) in PERGUNTAS" :key="q.p" :open="i === 0">
          <summary>{{ q.p }}</summary>
          <p>{{ q.r }}</p>
        </details>
      </div>
    </section>

    <section class="faixa final">
      <h2>Sua equipe está esperando no WhatsApp.</h2>
      <p>Crie a conta em menos de dois minutos e mande a primeira mensagem hoje.</p>
      <div class="ctas">
        <RouterLink to="/criar-conta" class="btn primary grande">Montar minha equipe <AppIcon name="seta" :size="16" /></RouterLink>
        <RouterLink :to="logado ? '/financas' : '/entrar'" class="btn ghost grande">{{ logado ? "Abrir painel" : "Entrar" }}</RouterLink>
      </div>
    </section>

    <footer class="rodape">
      <div class="faixa rodape-faixa">
        <div class="rodape-marca">
          <span class="logo">
            <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
              <rect width="32" height="32" rx="9" fill="#10b981" />
              <path d="M9 22l7-13 7 13" stroke="#06140f" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            assessor
          </span>
          <p>Uma equipe de assessores de inteligência artificial dentro do seu WhatsApp. Dinheiro, agenda e tarefas organizados numa conversa só.</p>
        </div>
        <nav>
          <b>Escritório</b>
          <a href="#equipe">Conheça os assessores</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#perguntas">Perguntas frequentes</a>
        </nav>
        <nav>
          <b>Conta</b>
          <RouterLink to="/entrar">Entrar</RouterLink>
          <RouterLink to="/criar-conta">Criar conta</RouterLink>
          <RouterLink to="/esqueci">Esqueci a senha</RouterLink>
        </nav>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing { min-height: 100vh; background: var(--bg); color: var(--text); overflow-x: hidden; }
.faixa { width: min(1180px, 100%); margin: 0 auto; padding: 0 24px; }
.btn.primary { --mesa: var(--accent); }
.btn { text-decoration: none; }
.grande { height: 50px; padding: 0 22px; font-size: 15px; font-weight: 600; }

.topo {
  position: sticky;
  top: 0;
  z-index: 10;
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.topo-faixa { display: flex; align-items: center; gap: 24px; height: 68px; }
.logo { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 600; color: var(--text); letter-spacing: -0.01em; }
.links { display: flex; gap: 26px; margin: 0 auto; }
.links a { color: var(--text-2); font-size: 14px; }
.links a:hover { color: var(--text); }
.acoes { display: flex; gap: 10px; margin-left: auto; }

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 56px;
  align-items: center;
  padding-top: 72px;
  padding-bottom: 72px;
  position: relative;
}
.hero::before {
  content: "";
  position: absolute;
  inset: -40px -200px auto auto;
  width: 640px;
  height: 640px;
  background: radial-gradient(closest-side, rgba(16, 185, 129, 0.18), transparent);
  pointer-events: none;
}
.pilula {
  display: inline-block;
  padding: 6px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  font-size: 13px;
  color: var(--text-2);
}
h1 { font-size: clamp(36px, 5vw, 58px); line-height: 1.05; letter-spacing: -0.03em; margin: 22px 0 18px; font-weight: 700; }
h1 span { color: var(--accent); }
.lead { font-size: 18px; line-height: 1.55; color: var(--text-2); max-width: 520px; margin: 0 0 28px; }
.ctas { display: flex; gap: 12px; flex-wrap: wrap; }
.selos { list-style: none; padding: 0; margin: 26px 0 0; display: flex; flex-wrap: wrap; gap: 18px; color: var(--text-2); font-size: 14px; }
.selos li { display: flex; align-items: center; gap: 6px; }
.selos :deep(svg) { color: var(--accent); }

.celular {
  position: relative;
  justify-self: center;
  width: min(340px, 100%);
  border: 1px solid var(--line-strong);
  border-radius: 36px;
  padding: 14px;
  background: #0b141a;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
  color: #e9edef;
}
.cel-topo { display: flex; align-items: center; gap: 10px; padding: 8px 8px 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
.cel-topo b { display: block; font-size: 15px; }
.cel-topo small { color: #8696a0; font-size: 12px; }
.cel-logo { width: 34px; height: 34px; border-radius: 50%; background: #10b981; color: #06140f; display: grid; place-items: center; font-weight: 700; }
.conversa { display: grid; gap: 10px; padding: 14px 4px 6px; }
.msg { max-width: 86%; padding: 8px 10px 18px; border-radius: 10px; font-size: 14px; line-height: 1.4; position: relative; }
.msg time { position: absolute; right: 8px; bottom: 4px; font-size: 10.5px; color: #8696a0; }
.msg.eu { justify-self: end; background: #005c4b; }
.msg.ele { justify-self: start; background: #1f2c34; }
.quem { display: block; font-size: 12px; font-weight: 600; color: var(--c); margin-bottom: 2px; }
.digitando { padding-bottom: 10px; }
.pontos { display: flex; gap: 4px; padding: 4px 0; }
.pontos i { width: 6px; height: 6px; border-radius: 50%; background: #8696a0; animation: pulo 1.2s infinite; }
.pontos i:nth-child(2) { animation-delay: 0.15s; }
.pontos i:nth-child(3) { animation-delay: 0.3s; }
@keyframes pulo { 0%, 60%, 100% { opacity: 0.35; transform: none; } 30% { opacity: 1; transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) { .pontos i { animation: none; } }

.tira { border-block: 1px solid var(--line); background: var(--surface); }
.tira-faixa { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; padding-block: 18px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-3); }

.bloco { padding-top: 96px; padding-bottom: 8px; }
.cabeca { max-width: 640px; margin-bottom: 40px; }
.cabeca.centro { margin-inline: auto; text-align: center; }
.cabeca .eyebrow { color: var(--accent); }
h2 { font-size: clamp(28px, 3.4vw, 40px); line-height: 1.12; letter-spacing: -0.02em; margin: 10px 0 14px; }
.cabeca p { color: var(--text-2); font-size: 17px; line-height: 1.55; margin: 0 0 20px; }

.equipe { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.membro {
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 22px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--c) 9%, transparent), transparent 60%), var(--surface);
  display: grid;
  gap: 14px;
  align-content: start;
}
.membro-topo { display: flex; align-items: center; gap: 12px; }
.membro-topo b { display: block; font-size: 17px; }
.membro-topo small { color: var(--text-3); font-size: 13px; }
.breve { margin-left: auto; font-size: 11px; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--line-strong); color: var(--text-3); }
.membro p { margin: 0; color: var(--text-2); line-height: 1.55; font-size: 15px; }
.mesa { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--c); }

.dia { list-style: none; padding: 0; margin: 0; display: grid; gap: 0; border-left: 1px solid var(--line-strong); margin-left: 30px; }
.dia li { display: grid; grid-template-columns: 64px 36px minmax(0, 1fr); gap: 16px; align-items: start; padding: 0 0 30px 0; margin-left: -31px; }
.dia time { font-variant-numeric: tabular-nums; font-size: 13px; color: var(--text-3); background: var(--bg); padding: 8px 0; text-align: center; }
.dia h3 { margin: 4px 0 6px; font-size: 18px; }
.dia p { margin: 0; color: var(--text-2); line-height: 1.55; max-width: 620px; }

.pedidos { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 10px; }
.pedidos li {
  padding: 10px 16px;
  border-radius: 14px 14px 4px 14px;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  font-size: 15px;
}

.painel { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 48px; align-items: center; }
.janela { border: 1px solid var(--line-strong); border-radius: 18px; background: var(--surface); overflow: hidden; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3); }
.janela-abas { display: flex; gap: 4px; padding: 10px; border-bottom: 1px solid var(--line); overflow: hidden; }
.janela-abas span { display: grid; padding: 6px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.55; white-space: nowrap; }
.janela-abas span.ativa { opacity: 1; color: var(--c); background: var(--surface-2); }
.janela-abas small { font-size: 11px; font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--text-3); }
.janela-corpo { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; padding: 22px; align-items: center; }
.saldo { font-size: 18px; margin: 8px 0 14px; }
.saldo b { font-size: 46px; letter-spacing: -0.03em; }
.numeros { display: flex; gap: 22px; font-size: 12px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; }
.numeros b { display: block; font-size: 14px; color: var(--text); letter-spacing: 0; text-transform: none; margin-top: 4px; }
.numeros b.pos { color: var(--accent); }
.fala { margin-top: 16px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--accent) 16%, transparent); font-size: 13px; line-height: 1.45; }
.fala b { color: var(--accent); margin-right: 4px; }
.grafico { width: 100%; height: auto; }

.planos { display: grid; grid-template-columns: repeat(2, minmax(0, 340px)); gap: 18px; justify-content: center; }
.plano { border: 1px solid var(--line-strong); border-radius: 20px; padding: 26px; background: var(--surface); display: grid; gap: 10px; align-content: start; }
.plano.destaque { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.plano-topo { display: flex; align-items: center; justify-content: space-between; }
.plano h3 { margin: 0; font-size: 18px; }
.selo { font-size: 11px; padding: 3px 9px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.preco { font-size: 16px; color: var(--text-2); }
.preco b { font-size: 44px; color: var(--text); letter-spacing: -0.03em; }
.plano small { color: var(--text-3); }
.plano ul { list-style: none; padding: 0; margin: 10px 0 14px; display: grid; gap: 10px; font-size: 14.5px; color: var(--text-2); }
.plano li { display: flex; gap: 8px; align-items: center; }
.plano li :deep(svg) { color: var(--accent); flex: none; }
.garantia { text-align: center; color: var(--text-3); font-size: 14px; margin: 22px 0 0; }

.faq { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 48px; align-items: start; }
.lista-faq { display: grid; gap: 10px; }
details { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 0 18px; }
summary { cursor: pointer; list-style: none; padding: 18px 0; font-weight: 600; display: flex; justify-content: space-between; gap: 12px; }
summary::-webkit-details-marker { display: none; }
summary::after { content: "+"; color: var(--text-3); font-size: 20px; line-height: 1; }
details[open] summary::after { content: "−"; }
details p { margin: 0 0 18px; color: var(--text-2); line-height: 1.6; }

.final { text-align: center; padding-top: 110px; padding-bottom: 110px; }
.final p { color: var(--text-2); font-size: 17px; margin: 0 0 26px; }
.final .ctas { justify-content: center; }

.rodape { border-top: 1px solid var(--line); background: var(--surface); }
.rodape-faixa { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 32px; padding-block: 44px; }
.rodape-marca p { color: var(--text-3); font-size: 14px; line-height: 1.6; max-width: 380px; margin: 14px 0 0; }
.rodape nav { display: grid; gap: 10px; align-content: start; font-size: 14px; }
.rodape nav b { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-3); margin-bottom: 4px; }
.rodape nav a { color: var(--text-2); }
.rodape nav a:hover { color: var(--text); }

@media (max-width: 960px) {
  .links { display: none; }
  .hero, .painel, .faq { grid-template-columns: 1fr; }
  .hero { padding-top: 40px; gap: 40px; }
  .equipe { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bloco { padding-top: 72px; }
}
@media (max-width: 600px) {
  .faixa { padding: 0 16px; }
  .topo-faixa { gap: 12px; }
  .acoes .btn { padding: 0 12px; }
  .equipe, .planos { grid-template-columns: 1fr; }
  .janela-corpo { grid-template-columns: 1fr; }
  .rodape-faixa { grid-template-columns: 1fr 1fr; }
  .rodape-marca { grid-column: 1 / -1; }
  .tira-faixa { justify-content: flex-start; gap: 10px 20px; }
  .ctas .btn { flex: 1 1 100%; justify-content: center; }
}
</style>
