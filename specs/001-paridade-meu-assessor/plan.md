# Implementation Plan: Paridade com o Meu Assessor (US1 e US2)

**Branch**: `001-paridade-meu-assessor` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-paridade-meu-assessor/spec.md`

**Note**: o plano cresce por historia. A US1 (conta compartilhada) esta implementada e na `main`
(PR #1). Esta revisao planeja a US2 (guarda e busca de documentos). As historias 3 a 9 entram
depois.

## Summary

**US1, entregue**: conta compartilhada por convite, com perfis fixos e permissao aplicada nas
ferramentas, nas rotas e numa visao do repo por perfil. Decisoes R1 a R10.

**US2, este plano**: o usuario manda PDF ou foto pelo WhatsApp e o assessor guarda o arquivo numa
pasta padrao, com titulo e descricao que ele mesmo escreve ao ler o documento, sem chamada extra
de IA. Depois a pessoa pede "acha o contrato do apartamento" e recebe o arquivo na conversa. O
painel ganha a tela de Documentos (na mesa de Tarefas) e o link "ver comprovante" em Transacoes.
Arquivos ficam no disco ao lado do banco; metadados e busca (FTS5) no SQLite. Detalhes em
[research.md](research.md) R11 a R22.

## Technical Context

**Language/Version**: TypeScript 7 em ESM, Node 22

**Primary Dependencies**: Fastify 5, zod 4, better-sqlite3 13 (com FTS5, conferido), SDK da
Anthropic; Gemini via REST; painel em Vue 3 + Vue Router + Vite. Nenhuma dependencia nova:
upload para a Meta com `FormData` e `Blob` nativos do Node 22.

**Storage**: SQLite (`documents`, `documents_fts`) e arquivos em `data/<banco>-arquivos/`

**Testing**: `node --test` via `npm test`, com o arquivo novo `test/documentos.test.ts`;
`npm run typecheck`; `vue-tsc` no painel

**Target Platform**: servidor Node unico (webhook + painel), navegador moderno

**Project Type**: web service com painel web (back-end em `src/`, front-end em `web/`)

**Performance Goals**: busca em menos de 100 ms para ate 5 mil documentos por conta; SC-003
(arquivo certo entre os 3 primeiros em 90% das buscas)

**Constraints**: 20 MB por arquivo, 1 GB por conta com aviso em 80%; so PDF e imagem ate 5 MB vao
ao modelo; janela de 24 horas do WhatsApp vale tambem para o envio do arquivo

**Scale/Scope**: 6 ferramentas novas, 4 rotas novas, 1 tela nova, webhook com tipo `document`,
upload de midia para a Meta, limpeza de pendentes no agendador

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Avaliacao (US2) | Status |
| --- | --- | --- |
| I. Dados financeiros sao do usuario | Arquivo sob o telefone da conta, caminho com sufixo aleatorio; toda leitura passa pela regra de visibilidade (R18); 404 para o que nao pode ver; pendente so de quem enviou; demo e real em pastas separadas; matriz de isolamento nos testes | Passa |
| II. Dinheiro so leitura | Nada movimenta dinheiro | Passa |
| III. Provedor de IA intercambiavel | `UserInput.document` tratado nos dois provedores; ferramentas em `src/tools.ts`; quickstart pede os dois | Passa |
| IV. Custo por conta sob controle | Sem chamada extra para classificar ou buscar; arquivo vai ao modelo uma vez e so ate 5 MB; estimativa de R$ 0,10 por mes para 10 documentos (R22) | Passa |
| V. Uma fonte de verdade | WhatsApp, terminal e painel usam a mesma tabela e as mesmas funcoes de `src/documentos.ts` | Passa |
| VI. Simplicidade de MVP | Disco local e FTS5 do SQLite, sem servico nem dependencia nova; pastas fixas | Passa |
| VII. Honestidade | Formato nao lido pela IA e dito na conversa; limite e uso aparecem; "nao encontrei" quando nao acha; README atualizado; envio pelo painel declarado como fora | Passa |

Reavaliado apos a Fase 1: sem violacoes. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-paridade-meu-assessor/
├── spec.md
├── plan.md              # este arquivo (US1 entregue, US2 planejada)
├── research.md          # R1 a R10 (US1), R11 a R22 (US2)
├── data-model.md        # secoes US1 e US2
├── quickstart.md        # secoes US1 e US2
├── contracts/
│   ├── api-conta.md               # US1
│   ├── ferramentas-agente.md      # US1
│   ├── api-documentos.md          # US2
│   └── ferramentas-documentos.md  # US2
├── checklists/
│   └── requirements.md
└── tasks.md             # US1 concluida; US2 entra via /speckit-tasks
```

### Source Code (repository root), US2

```text
src/
├── documentos.ts    # novo: tabelas, pastas, salvar pendente, guardar, buscar, ler, mover, excluir, limpar pendentes, visibilidade
├── permissoes.ts    # capacidade documentos para titular e completo
├── db.ts            # chama prepararTabelasDocumentos
├── config.ts        # pasta de arquivos derivada de DB_PATH e limites
├── whatsapp.ts      # tipo document no parseWebhook; uploadMedia e sendDocument
├── server.ts        # salva pendente ao receber image/document; envia anexos depois do texto
├── prompt.ts        # UserInput.document e regras de documento no prompt
├── providers/gemini.ts, providers/claude.ts  # PDF no turno
├── agent.ts         # parametro enviarArquivo; historico com [documento]
├── tools.ts         # 6 ferramentas novas; comprovante automatico em registrar_transacao
├── api.ts           # rotas /documentos; comprovanteId em /transacoes
├── scheduler.ts     # limpeza de pendentes com mais de 24 h
├── cli.ts           # imprime o caminho do arquivo enviado
└── seed.ts          # documentos de exemplo na conta demo

web/src/
├── views/tarefas/DocumentosView.vue  # novo
├── views/TarefasMesa.vue             # atalho para Documentos
├── views/financas/TransacoesView.vue # ver comprovante
├── mesas.ts, router.ts               # cargo do Davi, rota /tarefas/documentos, mesa exige tarefas ou documentos
└── api.ts                            # tipos e download por blob

test/
└── documentos.test.ts   # incluido no script test
```

**Structure Decision**: mesmo layout da US1. O modulo novo `documentos.ts` segue o estilo de
`conta.ts`: funcoes sobre a conexao do banco, sem camada extra. Envio de arquivo fica em
`whatsapp.ts`, junto do envio de texto.

## Ordem sugerida (US2)

1. `documentos.ts` com tabelas, FTS, pendente, guardar, buscar, visibilidade e limpeza, com testes.
2. Capacidade `documentos` e regra de visibilidade.
3. Webhook com `document`, salvar pendente, upload e envio pela Meta.
4. Provedores com PDF, prompt e as 6 ferramentas; comprovante automatico.
5. Agente com `enviarArquivo`, terminal e agendador.
6. API de documentos e `comprovanteId`.
7. Painel: tela de Documentos, mesa de Tarefas, ver comprovante.
8. Seed, README, quickstart.

## Fora desta entrega (US2)

- Enviar arquivo pelo painel; pastas criadas pelo usuario.
- Ler DOCX, XLSX e outros formatos (so guardados pelo nome).
- Armazenamento externo (S3/R2), junto da troca de servidor.

## Complexity Tracking

Sem violacoes da constituicao.
