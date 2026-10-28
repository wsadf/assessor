# Assessor MVP Constitution

## Core Principles

### I. Dados financeiros sao do usuario

- Todo dado de lancamento, lembrete, tarefa ou historico MUST ficar vinculado a um usuario
  (telefone ou conta) e toda consulta MUST filtrar por esse usuario. Nenhuma rota, ferramenta
  ou tela pode devolver dados de outra conta.
- O webhook MUST validar a assinatura da Meta e ignorar numeros fora de `ALLOWED_NUMBERS`.
- Senhas MUST usar hash com sal (scrypt); codigos de acesso MUST expirar e limitar tentativas.
- Segredos ficam no `.env`, que nunca entra no Git. Dados reais (`data/assessor.db`) e dados de
  demonstracao (`data/demo.db`) MUST ficar em bancos separados.
- Dados de terceiros MUST NOT passar por planos de IA cujos termos permitem treinar com eles
  (a cota gratuita do Gemini, por exemplo) fora de testes locais.

Razao: o produto guarda a vida financeira das pessoas. Um vazamento entre contas encerra o produto.

### II. Dinheiro so leitura

- O assessor e o painel MUST NOT movimentar dinheiro: nada de Pix, transferencia, pagamento ou
  investimento iniciado pelo sistema.
- Integracoes bancarias futuras (Open Finance) MUST usar escopo de leitura.
- Cobranca e permitida em dois casos, sempre por parceiro de pagamento regulado: a assinatura do
  proprio produto e links de cobranca que o usuario gera para os clientes dele.
- No link de cobranca, o valor MUST ir direto do pagador para a conta do usuario no parceiro. O
  produto MUST NOT receber, reter, repassar ou antecipar esse dinheiro; so le a confirmacao.
- A cobranca do usuario aos clientes dele tambem MAY usar Pix estatico (copia-e-cola e QR no padrao
  BR Code do Banco Central) montado com a chave Pix do proprio usuario. Nesse caso o produto so
  monta o codigo: o pagamento sai do banco do pagador direto para o banco do usuario, e o produto
  MUST NOT iniciar, intermediar ou guardar a transacao. A confirmacao MUST vir do usuario ou do
  extrato importado, nunca presumida.

Razao: movimentar dinheiro exige ser instituicao de pagamento. Fica fora do escopo do produto.
Cobrar pelo parceiro, sem custodia, mantem o produto fora desse papel. O Pix estatico com a chave do
usuario tambem nao poe o produto nesse papel: quem liquida e o banco de cada um.

### III. Provedor de IA intercambiavel

- Toda capacidade do assessor MUST funcionar com Gemini e com Claude, escolhidos por
  `AI_PROVIDER`, usando o mesmo prompt de sistema (`src/prompt.ts`) e as mesmas ferramentas
  (`src/tools.ts`).
- Codigo especifico de um provedor MUST ficar em `src/providers/`. A regra de negocio MUST NOT
  depender de um provedor.
- Quando um provedor nao suporta algo (audio no Claude sem chave de transcricao, por exemplo), o
  assessor MUST responder de forma clara em vez de falhar em silencio.

Razao: preco, cota e qualidade dos modelos mudam rapido. Trocar de provedor tem de ser uma linha
no `.env`.

### IV. Custo por conta sob controle

- Toda feature que chama o modelo MUST estimar o impacto no custo por conta. A meta de
  referencia e manter a IA perto de R$ 3 por conta por mes, para caber num preco de entrada
  de R$ 9,90.
- O padrao MUST ser o modelo mais barato que resolve a tarefa, com reserva configuravel.
- Prompt de sistema e definicoes de ferramentas MUST usar cache quando o provedor oferece.
- O historico enviado ao modelo MUST ter limite (hoje, as ultimas 20 mensagens de texto).

Razao: o produto e de assinatura barata e volume alto. Custo de IA sem teto inviabiliza o plano.

### V. Uma fonte de verdade para chat e painel

- WhatsApp, terminal (`npm run chat`) e painel web MUST ler e gravar pelo mesmo banco e pelas
  mesmas funcoes de dominio. Uma regra (parcelas, categorias, contraparte) MUST NOT ser
  reimplementada no painel.
- Um lancamento MUST guardar categoria e contraparte no momento em que entra, para que as
  consultas por pessoa, loja, item e valor funcionem depois.

Razao: o usuario conversa num canal e confere no outro. Divergencia entre eles destroi a confianca.

### VI. Simplicidade de MVP

- Nova dependencia MUST ser justificada no plano da feature. Preferir a API REST ou o que a
  plataforma ja oferece (graficos em SVG proprio, Gemini via REST sem SDK).
- SQLite e fila em memoria sao aceitos enquanto o projeto roda num servidor so. A troca por
  PostgreSQL ou fila externa MUST vir com uma feature que precise disso.
- Abstracao so entra quando houver o segundo caso real de uso.

Razao: o objetivo e validar o produto rapido, com pouco para manter.

### VII. Honestidade sobre o que funciona

- Funcionalidade nao ligada (emissao de nota, busca na internet, cobranca) MUST aparecer como
  tal na tela, no README e na resposta do assessor. Nada de botao que finge funcionar.
- O README MUST ser atualizado na mesma entrega que muda comportamento, configuracao ou limite.
- O assessor MUST NOT inventar valores: se nao encontrou o dado, diz que nao encontrou.

Razao: produto financeiro que parece funcionar e nao funciona gera decisao errada do usuario.

## Restricoes Tecnicas

- Node 22 ou mais novo, TypeScript em modo ESM. `npm run typecheck` MUST passar.
- Back-end em Fastify com validacao de entrada em zod; banco em `better-sqlite3`.
- Painel em Vue 3 + Vue Router + Vite, dentro de `web/`, servido compilado pelo `src/painel.ts`.
- Horarios e datas MUST respeitar `TIMEZONE` (padrao `America/Sao_Paulo`).
- Lembretes fora da janela de 24 horas do WhatsApp MUST usar modelo aprovado quando configurado.
- Toda configuracao nova MUST entrar no `.env.example` com comentario curto.
- Texto para o usuario e documentacao em portugues do Brasil, frases curtas, sem travessao.

## Fluxo de Desenvolvimento

- Feature nova segue o Spec Kit: `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`,
  `/speckit-implement`. O plano MUST conter uma verificacao contra esta constituicao.
- Regra de dominio nova (ferramentas, calculo de parcelas, filtros de consulta, isolamento por
  usuario) MUST ter teste em `test/` e `npm test` MUST passar antes do commit.
- Mudanca visivel no painel MUST ser conferida com `npm run painel:demo`.
- Commits em portugues no formato Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Comentarios no codigo explicam so o porque; historico vai na mensagem do commit.

## Governance

- Esta constituicao prevalece sobre outras praticas do projeto. Conflito com um plano ou tarefa
  se resolve a favor dela, ou com uma emenda.
- Emenda: alterar este arquivo via `/speckit-constitution`, registrar o motivo no commit e
  atualizar a versao.
- Versionamento semantico: MAJOR para remover ou redefinir principio; MINOR para principio ou
  secao nova ou regra ampliada; PATCH para redacao e esclarecimento.
- Todo plano (`/speckit-plan`) e toda revisao MUST verificar conformidade. Excecao a um principio
  MUST ser justificada na secao de complexidade do plano.
- Orientacao do dia a dia fica no `README.md` e em `docs/`.

**Version**: 1.2.0 | **Ratified**: 2026-10-27 | **Last Amended**: 2026-10-27
