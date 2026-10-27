# Research: Conta compartilhada (US1)

Escopo: so a User Story 1 da spec. As demais historias terao pesquisa propria.

## R1. Como representar a conta

- **Decision**: a conta continua identificada pelo telefone do titular. A coluna `phone` das
  tabelas de dados (transactions, reminders, tasks, research) passa a significar "telefone da
  conta". Uma tabela nova, `account_members`, liga o telefone de cada membro ao telefone da conta.
- **Rationale**: todas as funcoes de `src/db.ts` e todas as rotas de `src/api.ts` ja filtram por
  `phone`. Resolver membro para conta uma vez, na entrada (webhook, terminal, sessao do painel),
  mantem as consultas atuais e o isolamento ja testado ("transacoes de outro usuario nao
  aparecem"). Principio VI.
- **Alternatives considered**: tabela `accounts` com `account_id` em todas as tabelas. Mais
  limpo a longo prazo, mas exige migrar todas as linhas e trocar a assinatura de todo o repo.
  Fica para quando a transferencia de titularidade (fora desta entrega) pedir.

## R2. Autoria dos registros

- **Decision**: coluna `created_by TEXT` (telefone de quem criou) em transactions, reminders e
  tasks. Nula nos registros antigos, lida como "titular".
- **Rationale**: FR-004 e o cenario 4 pedem mostrar quem lancou. Coluna nula evita reescrever
  dados existentes.
- **Alternatives considered**: tabela de auditoria separada. Mais pesada e sem uso por enquanto.

## R3. Historico de conversa

- **Decision**: o historico continua por telefone do membro, nao da conta.
- **Rationale**: cada pessoa tem a propria conversa no WhatsApp. Misturar historicos faria o
  modelo responder ao contexto de outra pessoa e aumentaria tokens (principio IV).

## R4. Para quem vao lembretes e resumo

- **Decision**: lembretes ganham `notify_phone` (padrao: quem criou). O agendador envia para
  `COALESCE(notify_phone, phone)`. O resumo da manha continua indo so para o titular nesta
  entrega.
- **Rationale**: o lembrete do remedio da esposa nao pode chegar no WhatsApp do marido. O resumo
  por membro depende dos avisos da US3 e entra la.

## R5. Perfis e onde a permissao e aplicada

- **Decision**: perfis fixos em `src/permissoes.ts`, como mapa de perfil para capacidades:

  | Perfil | Despesas | Receitas | Agenda | Tarefas | Gerir acessos |
  | --- | --- | --- | --- | --- | --- |
  | titular | ler/criar | ler/criar | sim | sim | sim |
  | completo | ler/criar | ler/criar | sim | sim | nao |
  | so_gastos | ler/criar | nao | nao | nao | nao |
  | agenda_tarefas | nao | nao | sim | sim | nao |

  A permissao e conferida em dois pontos de codigo: em `executeTool` (cada ferramenta declara a
  capacidade exigida; consultas de transacao de quem so ve despesas recebem `kind = despesa`
  forcado) e no hook de rota da API (cada rota declara a capacidade). O prompt recebe o perfil
  so para o modelo nao oferecer o que nao pode; a seguranca nao depende dele.
- **Rationale**: principio I. O modelo pode ser convencido a chamar uma ferramenta; a ferramenta
  nao pode ser convencida a devolver o que o perfil proibe.
- **Alternatives considered**: permissoes livres por area (adiado pela spec); filtrar so no
  prompt (rejeitado, inseguro).
- O perfil `contador` fica para a US7, junto com a area do contador.

## R6. Codigo de convite

- **Decision**: formato `CONV-` mais 6 caracteres de um alfabeto sem ambiguos
  (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`), cerca de 887 milhoes de combinacoes. Guardado como hash
  SHA-256, como os codigos de acesso. Validade 7 dias, uso unico, cancelavel. Ate 5 tentativas
  erradas por telefone a cada 15 minutos.
- **Rationale**: curto para digitar e ditar, inviavel de adivinhar com o limite de tentativas,
  mesmo padrao de `src/auth.ts`.

## R7. Como o convidado entra

- **Decision**: pelo cadastro do painel, com campo opcional "codigo de convite". O cadastro ja
  confirma o numero pelo codigo de 6 digitos no WhatsApp, entao o membro entra com o numero
  comprovado. Com convite, o passo de plano e pagamento e pulado. Uma rota publica valida o
  convite antes e devolve o nome do titular para a tela mostrar "voce vai entrar na conta de X".
- **Rationale**: reaproveita o fluxo de ativacao existente. Entrar por mensagem no WhatsApp fica
  para depois.
- **Webhook**: um numero e atendido se estiver em `ALLOWED_NUMBERS` ou se for membro ativo de
  uma conta cujo titular esta em `ALLOWED_NUMBERS`. O numero de teste da Meta continua limitado a
  5 destinatarios cadastrados, o que vale ser dito no README (principio VII).

## R8. Numero que ja tem dados proprios

- **Decision**: um numero com lancamentos proprios pode entrar em outra conta. Os dados dele
  ficam guardados sob o proprio telefone e nao sao misturados; voltam a aparecer se ele sair da
  conta. A tela de entrada avisa isso antes de confirmar.
- **Rationale**: FR-006 (uma conta por vez) sem apagar nem fundir dados financeiros.

## R9. Remocao de membro

- **Decision**: `removed_at` no vinculo, sessoes do membro apagadas na hora, registros feitos por
  ele continuam na conta com a autoria. O titular nao pode ser removido; transferencia de
  titularidade fica fora desta entrega.

## R10. Custo de IA (principio IV)

- O prompt ganha uma linha com nome e perfil de quem fala (cerca de 30 tokens). Quatro
  ferramentas novas entram no bloco de ferramentas que ja usa cache. Impacto estimado abaixo de
  2% por conversa. Nenhuma chamada extra ao modelo.
