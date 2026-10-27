# Quickstart: validar as historias da feature 001

# US1: conta compartilhada

Contratos em [contracts/](contracts/), entidades em [data-model.md](data-model.md).

## Pre-requisitos

- Node 22 (`nvm use 22`) e `npm install` na raiz e em `web/`.
- `.env` com chave de IA. WhatsApp e opcional: sem ele, os codigos aparecem no terminal.

## 1. Testes automaticos

```bash
npm run typecheck
```

```bash
npm test
```

Os testes novos em `test/core.test.ts` devem cobrir:

- convite: gerar, aceitar, cancelar, expirar, codigo reutilizado e limite de tentativas;
- isolamento: para cada perfil, cada ferramenta e cada rota recusa o que nao pode (matriz que
  atende SC-002, com pelo menos 50 combinacoes);
- `so_gastos` perguntando por receitas recebe recusa sem valores;
- lancamento de membro aparece para o titular com `created_by`;
- lembrete de membro vai para o WhatsApp do membro;
- membro removido perde sessao e deixa de ser atendido como membro;
- numero com dados proprios entra em outra conta e os dados voltam ao sair.

## 2. Painel com dados de demonstracao

```bash
npm run painel:demo
```

O seed passa a criar a conta demo com uma pessoa de perfil `so_gastos`
(`bia@assessor.local`, senha `demo1234`).

1. Entre como `demo@assessor.local`. Em Operacao > Equipe e acesso, gere um convite `completo`.
   Esperado: codigo `CONV-XXXXXX` exibido uma vez e convite na lista de pendentes.
2. Em outra janela anonima, Criar conta com o codigo e um telefone novo. Esperado: a tela mostra
   "voce vai entrar na conta de ...", pula plano e pagamento, e o codigo de ativacao aparece no
   terminal.
3. Como o novo membro, lance um gasto. Como titular, abra Transacoes. Esperado: gasto com o nome
   de quem lancou.
4. Entre como `bia@assessor.local`. Esperado: mesa Fiscal oculta, Financas sem saldo nem receitas,
   chamada direta a `/api/fiscal/...` devolve `403`.
5. Como titular, remova a Bia. Esperado: a sessao dela cai na proxima requisicao.

## 3. Pelo terminal

```bash
npm run chat
```

Com `CLI_PHONE` do titular: "quem tem acesso a conta?" lista membros; "convida meu socio so
para ver os gastos" devolve um codigo. Com `CLI_PHONE` de um membro `so_gastos`: "quanto recebi
esse mes?" recebe recusa sem valores.

## 4. Com os dois provedores

Repita o passo 3 com `AI_PROVIDER=gemini` e `AI_PROVIDER=claude` (principio III).

# US2: documentos

Contratos em [contracts/api-documentos.md](contracts/api-documentos.md) e
[contracts/ferramentas-documentos.md](contracts/ferramentas-documentos.md).

## 1. Testes automaticos

Os testes novos (arquivo `test/documentos.test.ts`) devem cobrir:

- arquivo recebido vira pendente, `guardar_documento` o guarda com pasta e titulo, e o pendente de
  outra pessoa nao e usado;
- pendente com mais de 24 horas e apagado do disco e do banco;
- foto em turno com `registrar_transacao` vira comprovante ligado ao lancamento;
- busca sem acento acha documento com acento; consulta sem resultado devolve "nenhum documento";
- limite de 20 MB por arquivo e aviso a partir de 80% de 1 GB;
- isolamento: conta A nao busca nem baixa documento da conta B; membro so gastos so baixa o
  comprovante ligado a despesa visivel; `agenda_tarefas` nao ve nenhum;
- `enviar_documento` entrega o arquivo ao callback depois da resposta em texto;
- API: listar, renomear, mover, excluir (arquivo some do disco) e `comprovanteId` em Transacoes.

## 2. Pelo terminal

O terminal nao recebe arquivo. Para testar a busca e o envio, rode `npm run seed:demo`, que passa
a guardar documentos de exemplo na conta demo, e depois:

```bash
npm run chat
```

Com `CLI_PHONE` da conta demo e `DB_PATH=data/demo.db`: "acha o contrato do apartamento" deve
listar ou enviar o contrato (o terminal imprime o caminho); "me manda o comprovante do aluguel"
idem; "acha o documento do barco" deve dizer que nao encontrou.

## 3. Painel

Em `npm run painel:demo`, entre como `demo@assessor.local`:

1. Tarefas > Documentos mostra as pastas com quantidade e o uso da conta.
2. Buscar "apartamento" acha o contrato; abrir baixa o PDF.
3. Mover o contrato para Casa e renomear; buscar de novo pelo novo titulo.
4. Excluir um documento: some da lista e do disco (`data/demo-arquivos/`).
5. Em Transacoes, um lancamento com comprovante mostra "ver comprovante".
6. Como `bia@assessor.local`: Documentos nao aparece; o comprovante do gasto dela abre pela
   transacao.

## 4. WhatsApp

Com o numero de teste: mandar um PDF com a legenda "guarda esse" (guardado e classificado), mandar
uma foto de cupom (lancamento e comprovante), mandar um PDF sem legenda e depois "sim, guarda"
(guardado), e pedir o arquivo de volta (chega como documento na conversa). Repetir com
`AI_PROVIDER=gemini` e `AI_PROVIDER=claude`.