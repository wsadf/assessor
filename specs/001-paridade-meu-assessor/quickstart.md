# Quickstart: validar a conta compartilhada (US1)

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
