<script setup lang="ts">
import { onMounted } from "vue";
import { sessao } from "../api";
import AppIcon from "../components/AppIcon.vue";
import AppLogo from "../components/AppLogo.vue";
import AssessorAvatar from "../components/AssessorAvatar.vue";
import { MESAS } from "../mesas";

const logado = Boolean(sessao());

const FUNCOES: Record<string, { texto: string; breve?: boolean }> = {
  financas: { texto: "Registra gastos e receitas, separa por categoria e mostra para onde foi o dinheiro." },
  fiscal: { texto: "Acompanha o que entra como receita e cobra seus clientes por Pix na sua chave." },
  agenda: { texto: "Transforma uma frase ou um áudio em compromisso e avisa na hora certa." },
  tarefas: { texto: "Anota tarefas com prazo e prioridade e guarda seus documentos." },
  operacao: { texto: "Manda o resumo da manhã e mostra tudo o que a equipe resolveu no mês." },
  pesquisas: { texto: "Pesquisa um assunto por você e devolve um resumo com as fontes.", breve: true },
};

const AGENDA = [
  { hora: "09:30", titulo: "Reunião com a equipe" },
  { hora: "14:00", titulo: "Dentista" },
  { hora: "18:30", titulo: "Jantar com a Ana" },
];

const SELOS = [
  { icone: "check", texto: "Dados no Brasil" },
  { icone: "olho", texto: "LGPD" },
  { icone: "cartao", texto: "Só leitura no seu dinheiro" },
];

const PASSOS = [
  { n: "01", titulo: "Crie a conta", texto: "Nome, e-mail e o seu WhatsApp. Um código confirma o número e pronto: 7 dias grátis, sem cartão." },
  { n: "02", titulo: "Mande uma mensagem", texto: "Por texto, áudio ou foto, do jeito que você falaria com alguém. Gastos, compromissos, tarefas, documentos." },
  { n: "03", titulo: "Acompanhe no painel", texto: "Tudo o que você pediu aparece organizado: saldo, agenda, tarefas e cobranças, no computador ou no celular." },
];

const PEDIDOS = [
  "bom dia! o que eu tenho hoje?",
  "gastei 62 na farmácia",
  "recebi 800 do freela",
  "quanto foi de mercado em outubro?",
  "me lembra de pagar o aluguel todo dia 5",
  "marca dentista quinta às 15h",
  "cria a tarefa revisar contrato pra sexta",
  "guarda esse contrato",
  "cobra R$ 850 do João pela consultoria",
  "lembra o João de pagar o personal",
  "minha fatura já fechou?",
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
    <div class="moldura">
      <header class="topo">
        <RouterLink to="/" aria-label="assessor, início"><AppLogo /></RouterLink>
        <nav class="links">
          <a href="#equipe">Assessores</a>
          <a href="#planos">Planos</a>
          <a href="#perguntas">Perguntas</a>
        </nav>
        <div class="acoes">
          <RouterLink v-if="logado" to="/financas" class="link-seta">Abrir painel <AppIcon name="seta" :size="15" class="diag" /></RouterLink>
          <template v-else>
            <RouterLink to="/entrar" class="link-discreto">Entrar</RouterLink>
            <RouterLink to="/criar-conta" class="link-seta">Começar agora <AppIcon name="seta" :size="15" class="diag" /></RouterLink>
          </template>
        </div>
      </header>

      <section class="hero">
        <span class="eyebrow">Sua equipe no WhatsApp</span>
        <h1>Sua rotina organizada,<br />numa conversa só</h1>
        <div class="ctas">
          <RouterLink to="/criar-conta" class="btn primary grande">Começar agora <AppIcon name="seta" :size="16" class="diag" /></RouterLink>
          <a href="#pedidos" class="btn ghost grande contorno">Veja o que pedir <AppIcon name="seta" :size="16" class="diag" /></a>
        </div>
      </section>

      <div class="palco" aria-hidden="true">
        <div class="celular">
          <span class="notch" />
          <b>Assessor</b>
          <small>Sua equipe</small>
          <div class="escrever">Escreva algo…</div>
        </div>

        <div class="msg ele m1">
          <span class="ico"><AppLogo :tamanho="22" :nome="false" /></span>
          <div>
            <div class="cab"><span>Lia</span><time>07:58</time></div>
            Bom dia! Como posso ajudar hoje?
          </div>
        </div>
        <div class="msg eu m2">
          <div class="cab"><span>Você</span><time>07:59</time></div>
          Me prepara pro dia.
        </div>
        <div class="msg ele m3">
          <span class="ico"><AppLogo :tamanho="22" :nome="false" /></span>
          <div>
            <div class="cab"><span>Lia</span><time>07:59</time></div>
            Você tem 3 compromissos. Deixei o almoço livre e o Bento já anotou os gastos de ontem.
          </div>
        </div>
        <div class="msg eu m4">
          <div class="cab"><span>Você</span><time>08:01</time></div>
          Quanto gastei de mercado esse mês?
        </div>

        <div v-for="(a, i) in AGENDA" :key="a.hora" class="hora-card" :class="`h${i + 1}`">
          <b class="num">{{ a.hora }}</b>
          <span>{{ a.titulo }}</span>
        </div>
        <span class="liga l1" />
        <span class="liga l2" />
        <span class="liga l3" />
        <span class="liga vertical" />
        <span class="liga ate-msg" />

        <span class="liga ate-selos" />
        <div class="selos">
          <span v-for="(s, i) in SELOS" :key="s.texto" class="selo" :class="`s${i + 1}`"><AppIcon :name="s.icone" :size="14" /> {{ s.texto }}</span>
        </div>
      </div>

      <section id="como-funciona" class="bloco">
        <span class="eyebrow">Como funciona</span>
        <h2>Comece com uma conversa.</h2>
        <p class="sub">Três passos simples. Nenhum hábito novo para aprender.</p>
        <div class="passos">
          <article v-for="p in PASSOS" :key="p.n" class="vidro passo">
            <span class="n num">{{ p.n }}</span>
            <h3>{{ p.titulo }}</h3>
            <p>{{ p.texto }}</p>
          </article>
        </div>
      </section>

      <section id="equipe" class="bloco">
        <span class="eyebrow">Sua equipe</span>
        <h2>Um assessor para cada parte da rotina.</h2>
        <p class="sub">Cada um é especialista numa área, e todos trabalham na mesma conversa.</p>
        <div class="equipe">
          <article v-for="m in MESAS" :key="m.id" class="vidro membro" :style="{ '--c': m.cor }">
            <div class="membro-topo">
              <AssessorAvatar :mesa="m.id" :size="40" />
              <div>
                <b>{{ m.assessor }}</b>
                <small>{{ m.cargo }}</small>
              </div>
              <span v-if="FUNCOES[m.id]?.breve" class="breve">em breve</span>
            </div>
            <p>{{ FUNCOES[m.id]?.texto }}</p>
          </article>
        </div>
      </section>

      <section id="pedidos" class="bloco">
        <span class="eyebrow">Sem manual</span>
        <h2>Peça do seu jeito.</h2>
        <p class="sub">Se você sabe mandar mensagem no WhatsApp, já sabe usar. Alguns exemplos:</p>
        <ul class="pedidos">
          <li v-for="p in PEDIDOS" :key="p" class="vidro">{{ p }}</li>
        </ul>
      </section>

      <section id="planos" class="bloco">
        <span class="eyebrow">Planos</span>
        <h2>A equipe completa, por menos de R$ 1 por dia.</h2>
        <p class="sub">Os dois planos liberam tudo. 7 dias para testar, sem cartão.</p>
        <div class="planos">
          <article v-for="p in PLANOS" :key="p.id" class="vidro plano" :class="{ destaque: p.destaque }">
            <div class="plano-topo">
              <h3>{{ p.nome }}</h3>
              <span v-if="p.destaque" class="chip">mais escolhido</span>
            </div>
            <div class="preco">R$ <b class="num">{{ p.preco }}</b>/mês</div>
            <small>{{ p.nota }}</small>
            <ul>
              <li v-for="i in INCLUI" :key="i"><AppIcon name="check" :size="15" /> {{ i }}</li>
            </ul>
            <RouterLink :to="{ path: '/criar-conta', query: { plano: p.id } }" class="btn btn-largo" :class="p.destaque ? 'primary' : 'ghost contorno'">
              Começar com o {{ p.nome.toLowerCase() }}
            </RouterLink>
          </article>
        </div>
      </section>

      <section id="perguntas" class="bloco faq">
        <div>
          <span class="eyebrow">Dúvidas</span>
          <h2>Perguntas frequentes.</h2>
          <p class="sub">Não achou a sua? Pergunte direto para o assessor no WhatsApp.</p>
        </div>
        <div class="lista-faq">
          <details v-for="(q, i) in PERGUNTAS" :key="q.p" class="vidro" :open="i === 0">
            <summary>{{ q.p }}</summary>
            <p>{{ q.r }}</p>
          </details>
        </div>
      </section>

      <section class="final">
        <span class="eyebrow">Pronto para começar?</span>
        <h2>Sua equipe está esperando<br />no WhatsApp.</h2>
        <div class="ctas">
          <RouterLink to="/criar-conta" class="btn primary grande">Começar agora <AppIcon name="seta" :size="16" class="diag" /></RouterLink>
          <RouterLink :to="logado ? '/financas' : '/entrar'" class="btn ghost grande contorno">{{ logado ? "Abrir painel" : "Já tenho conta" }}</RouterLink>
        </div>
      </section>

      <footer class="rodape">
        <div class="rodape-marca">
          <AppLogo :tamanho="22" />
          <p>Uma equipe de assessores de inteligência artificial dentro do seu WhatsApp. Dinheiro, agenda e tarefas organizados numa conversa só.</p>
        </div>
        <nav>
          <b>Produto</b>
          <a href="#equipe">Assessores</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#perguntas">Perguntas frequentes</a>
        </nav>
        <nav>
          <b>Conta</b>
          <RouterLink to="/entrar">Entrar</RouterLink>
          <RouterLink to="/criar-conta">Criar conta</RouterLink>
          <RouterLink to="/esqueci">Esqueci a senha</RouterLink>
        </nav>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* A landing e sempre escura, nos dois temas: e a vitrine da marca. */
.landing {
  --text: #f4f1ee;
  --text-2: #a9a5a3;
  --text-3: #75716f;
  --line: rgba(255, 255, 255, 0.08);
  --line-strong: rgba(255, 255, 255, 0.16);
  --glass: rgba(255, 255, 255, 0.045);
  --glass-2: rgba(255, 255, 255, 0.07);
  --botao: #ffffff;
  --botao-texto: #0b0b0f;
  min-height: 100vh;
  color: var(--text);
  background:
    radial-gradient(38% 34% at 50% 44%, rgba(201, 120, 74, 0.55), transparent 70%),
    radial-gradient(60% 30% at 50% 30%, rgba(201, 120, 74, 0.16), transparent 70%),
    radial-gradient(30% 30% at 0% 55%, rgba(201, 120, 74, 0.18), transparent 70%),
    #07080c;
  background-repeat: no-repeat;
  background-size: 100% 1400px, 100% 1400px, 100% 1400px, auto;
  /* clip, e nao hidden: hidden vira contexto de rolagem e o menu deixa de ficar fixo. */
  overflow-x: clip;
}
.moldura { width: min(1240px, 100%); margin: 0 auto; padding: 24px 24px 0; }
.diag { transform: rotate(-45deg); }
.vidro { background: var(--glass); border: 1px solid var(--line); border-radius: 18px; backdrop-filter: blur(16px); }

/* Menu flutuante em pilula */
.topo {
  position: sticky;
  top: 16px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 24px;
  height: 72px;
  padding: 0 26px;
  border-radius: 22px;
  background: rgba(22, 22, 28, 0.72);
  border: 1px solid var(--line);
  backdrop-filter: blur(18px);
}
.links { display: flex; gap: 52px; margin: 0 auto; }
.links a, .link-discreto { color: var(--text-2); font-size: 15px; transition: color 0.15s; }
.links a:hover, .link-discreto:hover { color: var(--text); }
.acoes { display: flex; align-items: center; gap: 24px; }
.link-seta { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 500; }

/* Titulo central */
.hero { text-align: center; padding: 72px 0 0; }
.hero .eyebrow { color: var(--text-2); }
h1 { font-size: clamp(38px, 6vw, 68px); line-height: 1.08; letter-spacing: -0.04em; font-weight: 400; margin: 20px 0 36px; }
.ctas { display: flex; gap: 22px; justify-content: center; flex-wrap: wrap; }
.grande { height: 56px; padding: 0 30px; font-size: 16px; border-radius: 16px; }
.contorno { border-color: rgba(255, 255, 255, 0.7); }
.contorno:hover { border-color: #fff; background: rgba(255, 255, 255, 0.06); }

/* Palco: celular no centro, conversa por cima, agenda a esquerda e selos a direita */
.palco { position: relative; height: 640px; margin-top: 56px; }
.palco::after {
  /* Some no fundo, como se o celular continuasse para baixo. */
  content: "";
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 100vw;
  translate: -50% 0;
  height: 220px;
  background: linear-gradient(transparent, #07080c);
  pointer-events: none;
}
.celular {
  position: absolute;
  left: 50%;
  top: 0;
  translate: -50% 0;
  width: 356px;
  height: 640px;
  border-radius: 44px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 14px;
}
.notch { width: 72px; height: 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.14); margin-bottom: 18px; }
.celular b { font-weight: 500; font-size: 14px; }
.celular small { font-size: 11.5px; color: var(--text-3); }
.escrever { position: absolute; bottom: 36px; left: 28px; right: 28px; height: 44px; border-radius: 14px; border: 1px solid var(--line); color: var(--text-3); font-size: 13px; display: flex; align-items: center; padding: 0 14px; }

.msg {
  position: absolute;
  z-index: 2;
  padding: 14px 18px;
  border-radius: 16px;
  font-size: 15px;
  line-height: 1.45;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(18px);
  box-shadow: 0 20px 40px -24px rgba(0, 0, 0, 0.6);
}
.msg.ele { display: flex; gap: 14px; align-items: center; }
.ico { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); display: grid; place-items: center; flex: none; background: rgba(0, 0, 0, 0.15); }
.cab { display: flex; justify-content: space-between; gap: 24px; font-size: 12.5px; color: var(--text-2); margin-bottom: 4px; }
.cab time { font-size: 11px; color: var(--text-3); }
.m1 { left: calc(50% - 318px); top: 98px; width: 380px; }
.m2 { left: calc(50% - 32px); top: 190px; width: 278px; }
.m3 { left: calc(50% - 302px); top: 280px; width: 458px; }
.m4 { left: calc(50% - 72px); top: 396px; width: 400px; opacity: 0.55; }

.hora-card { position: absolute; z-index: 2; display: grid; gap: 2px; padding: 14px 20px; border-radius: 16px; background: rgba(255, 255, 255, 0.06); border: 1px solid var(--line); backdrop-filter: blur(16px); }
.hora-card b { font-size: 26px; font-weight: 500; letter-spacing: -0.01em; }
.hora-card span { color: var(--text-2); font-size: 14.5px; }
.h1 { left: calc(50% - 630px); top: 160px; }
.h2 { left: calc(50% - 550px); top: 255px; }
.h3 { left: calc(50% - 594px); top: 352px; opacity: 0.8; }

/* Linhas pontilhadas ligando a agenda a resposta e a resposta aos selos */
.liga { position: absolute; z-index: 1; border-color: rgba(255, 255, 255, 0.28); border-style: dashed; border-width: 0; }
.l1 { left: calc(50% - 476px); width: 112px; top: 228px; border-top-width: 1px; }
.l2 { left: calc(50% - 400px); width: 36px; top: 322px; border-top-width: 1px; }
.l3 { left: calc(50% - 420px); width: 56px; top: 420px; border-top-width: 1px; }
.vertical { left: calc(50% - 364px); top: 228px; height: 192px; border-left-width: 1px; }
.ate-msg { left: calc(50% - 364px); width: 62px; top: 322px; border-top-width: 1px; }
.ate-selos { left: calc(50% + 156px); width: 236px; top: 334px; border-top-width: 1px; }
.selos { position: absolute; right: calc(50% - 620px); top: 248px; z-index: 2; display: grid; justify-items: end; gap: 12px; }
.selo { display: inline-flex; align-items: center; gap: 8px; padding: 12px 18px; border-radius: 14px; background: rgba(255, 255, 255, 0.06); border: 1px solid var(--line); backdrop-filter: blur(16px); font-size: 14px; color: var(--text-2); }
.s2 { margin-right: 140px; }

/* Secoes */
.bloco { padding-top: 120px; }
.bloco .eyebrow { color: var(--text-2); }
h2 { font-size: clamp(30px, 4vw, 48px); line-height: 1.1; letter-spacing: -0.035em; font-weight: 400; margin: 14px 0 16px; }
.sub { color: var(--text-2); font-size: 18px; margin: 0 0 40px; max-width: 640px; }

.passos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.passo { padding: 28px; display: grid; gap: 10px; align-content: start; }
.passo .n { font-size: 13px; color: var(--accent); letter-spacing: 0.1em; }
.passo h3 { margin: 6px 0 0; font-size: 22px; }
.passo p { margin: 0; color: var(--text-2); line-height: 1.6; }

.equipe { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.membro { padding: 24px; display: grid; gap: 14px; align-content: start; }
.membro-topo { display: flex; align-items: center; gap: 12px; }
.membro-topo b { display: block; font-size: 17px; font-weight: 500; }
.membro-topo small { color: var(--text-3); font-size: 13px; }
.breve { margin-left: auto; font-size: 11px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line-strong); color: var(--text-3); }
.membro p { margin: 0; color: var(--text-2); line-height: 1.6; }

.pedidos { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 10px; }
.pedidos li { padding: 12px 18px; border-radius: 16px 16px 6px 16px; font-size: 15px; }

.planos { display: grid; grid-template-columns: repeat(2, minmax(0, 380px)); gap: 18px; }
.plano { padding: 30px; display: grid; gap: 10px; align-content: start; }
.plano.destaque { border-color: rgba(227, 165, 124, 0.5); box-shadow: 0 0 0 1px rgba(227, 165, 124, 0.25), 0 30px 80px -40px rgba(201, 120, 74, 0.6); }
.plano-topo { display: flex; align-items: center; justify-content: space-between; }
.plano h3 { margin: 0; font-size: 20px; }
.preco { font-size: 16px; color: var(--text-2); }
.preco b { font-size: 48px; color: var(--text); font-weight: 500; letter-spacing: -0.03em; }
.plano small { color: var(--text-3); }
.plano ul { list-style: none; padding: 0; margin: 12px 0 16px; display: grid; gap: 10px; color: var(--text-2); }
.plano li { display: flex; gap: 10px; align-items: center; }
.plano li :deep(svg) { color: var(--accent); flex: none; }

.faq { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 48px; align-items: start; }
.lista-faq { display: grid; gap: 10px; }
details { padding: 0 22px; }
summary { cursor: pointer; list-style: none; padding: 20px 0; font-weight: 500; display: flex; justify-content: space-between; gap: 12px; }
summary::-webkit-details-marker { display: none; }
summary::after { content: "+"; color: var(--text-3); font-size: 20px; line-height: 1; }
details[open] summary::after { content: "−"; }
details p { margin: 0 0 20px; color: var(--text-2); line-height: 1.6; }

.final { text-align: center; padding: 140px 0 120px; }
.final .eyebrow { color: var(--text-2); }
.final h2 { margin-bottom: 36px; }

.rodape { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 32px; padding: 44px 0 56px; border-top: 1px solid var(--line); }
.rodape-marca p { color: var(--text-3); font-size: 14px; line-height: 1.6; max-width: 380px; margin: 14px 0 0; }
.rodape nav { display: grid; gap: 10px; align-content: start; font-size: 14px; }
.rodape nav b { font-size: 11px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-3); margin-bottom: 4px; }
.rodape nav a { color: var(--text-2); }
.rodape nav a:hover { color: var(--text); }

/* Sem espaco para a agenda e os selos ao lado do celular */
@media (max-width: 1180px) {
  .hora-card, .liga, .selos { display: none; }
}
@media (max-width: 960px) {
  .links { display: none; }
  .acoes { margin-left: auto; }
  .equipe, .passos { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .faq { grid-template-columns: 1fr; }
  .bloco { padding-top: 88px; }
}
@media (max-width: 720px) {
  .moldura { padding: 12px 16px 0; }
  .topo { top: 10px; height: 60px; padding: 0 16px; border-radius: 18px; gap: 12px; }
  .acoes { gap: 14px; }
  .link-discreto { display: none; }
  .hero { padding-top: 48px; }
  .ctas .btn { flex: 1 1 100%; justify-content: center; }
  .palco { height: 560px; margin-top: 40px; }
  .celular { width: min(330px, 100%); height: 560px; }
  .msg { font-size: 14px; padding: 12px 14px; }
  .m1 { left: 0; width: 82%; top: 90px; }
  .m2 { left: auto; right: 0; width: 64%; top: 190px; }
  .m3 { left: 0; width: 92%; top: 286px; }
  .m4 { left: auto; right: 0; width: 80%; top: 410px; }
  .ico { width: 34px; height: 34px; }
  .equipe, .passos, .planos { grid-template-columns: 1fr; }
  .rodape { grid-template-columns: 1fr 1fr; }
  .rodape-marca { grid-column: 1 / -1; }
}
</style>
