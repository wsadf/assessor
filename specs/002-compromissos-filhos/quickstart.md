# Quickstart: Compromissos dos filhos

Roteiro para provar a feature de ponta a ponta. Contratos em [contracts/](contracts/), tabelas em
[data-model.md](data-model.md). Requer Node 22 (`nvm use 22`).

## Preparo

```bash
npm run seed:demo
npm run painel:demo
```

O painel sobe em `http://localhost:3001` (ou na porta de `PAINEL_PORT`). Contas: `demo@assessor.local`
com senha `demo1234` (titular) e `bia@assessor.local` com a mesma senha (so gastos). A restauracao do
`seed` cria os filhos de demonstracao (Marina e Pedro) e limpa as tabelas novas.

Para conversar com o assessor no terminal, com o mesmo banco:

```powershell
$env:DB_PATH = "data/demo.db"; npm run chat
```

Cada cenario abaixo vale uma vez com `AI_PROVIDER=gemini` e outra com `AI_PROVIDER=claude`, quando
houver `ANTHROPIC_API_KEY` (principio III).

## US1: cadastrar e registrar pela conversa

1. Em uma conta sem filhos (crie outra no painel), mande: `tenho a Ana, 7 anos`. Esperado: o
   assessor pergunta a data de nascimento; respondendo `nao sei`, guarda a idade aproximada e avisa
   que nao vai lembrar o aniversario dela.
2. Com a Marina e o Pedro (conta demo), mande: `prova de matematica sexta`. Esperado: pergunta
   "da Marina ou do Pedro?" e so grava depois da resposta.
3. Mande: `aniversario do Joao, amigo do Pedro, sabado as 15h, presente quebra-cabeca`. Esperado:
   registro com amigo, hora, presente "por comprar" e a frase "aviso 3 dias antes e na vespera".
4. Mande: `preciso marcar pediatra pro Pedro`. Esperado: grava "a marcar" e diz que lembra toda
   semana.
5. Mande: `vacina dos dois dia 10`. Esperado: dois compromissos, um por filho.

## US2: avisos e repeticao

Com datas simuladas (teste automatico em `test/filhos.test.ts`):

1. Prova na sexta: aviso na quinta, no horario padrao, uma unica vez mesmo com o agendador rodando
   varias vezes.
2. Aniversario de amigo no sabado com presente por comprar: aviso na quarta, citando o presente, e
   outro na sexta. Marcando o presente como comprado, o aviso da sexta deixa de citar.
3. Aniversario de amigo: no ano seguinte volta com a data nova, presente "por comprar" e a ideia
   anterior; simulando 3 anos, exatamente um aviso de 3 dias e um de vespera por ano.
4. Aniversario do filho: aviso 7 dias antes, todo ano. Nascido em 29 de fevereiro: vale 28 em ano
   comum.
5. `me avisa uma semana antes` num compromisso: so esse aviso, 7 dias antes.
6. Conta compartilhada: titular e membro com agenda recebem cada um o seu aviso; o membro "so
   gastos" nao recebe.
7. Compromisso criado no dia do aviso ou depois: nenhum aviso retroativo; o resumo da manha do dia
   traz o item.
8. Servidor parado no dia do aviso: o aviso sai ao voltar, se a data nao passou, e so uma vez.
9. Fora da janela de 24 horas sem modelo aprovado: o aviso fica pendente e sai na proxima conversa.

## US3: consultar e atualizar

1. `o que vem por ai dos meninos?` Esperado: lista por filho, em ordem de data, com presente nos
   aniversarios e o aniversario do filho se cair no periodo.
2. `o que a Marina tem essa semana?` numa semana vazia: `Nenhum compromisso`, sem item inventado.
3. `entreguei o trabalho da Marina`: conclui e nenhum aviso futuro dele sai.
4. `a consulta passou para dia 18`: o aviso vai para a nova data.
5. `ja comprei o presente do Joao`: presente comprado.
6. `conclui a prova de ciencias` com dois filhos tendo prova de ciencias: o assessor pergunta de qual.

## US4: painel

1. Entre como `demo@assessor.local`, abra Agenda e clique em **Filhos** (dois cliques do menu).
   Esperado: um cartao por filho com idade e proximo compromisso e a semana de todos abaixo.
2. Filtre por **Pedro** e por **Aniversarios**: so aniversarios dele, com o presente em destaque
   quando por comprar.
3. Crie um compromisso pelo painel e pergunte ao assessor sobre ele no terminal: ele conhece.
4. Edite a data no painel e peca ao assessor a lista: aparece a data nova.
5. Entre como `bia@assessor.local` (so gastos): a mesa Agenda nem aparece no menu, `/agenda/filhos`
   leva para a primeira mesa liberada (Financas) e a API de filhos responde `403` com "Seu acesso a
   esta conta nao inclui isso." Nenhum dado de filho chega a ela.
6. Conta sem filhos: estado vazio com exemplo de frase e botao para cadastrar o primeiro.
7. Tema claro e escuro, e a largura de celular, sem rolagem lateral.

## US5: vacinas e consultas de rotina

1. `o Pedro tomou a 2a dose da gripe hoje, proxima em 6 meses`: vacina no historico e compromisso
   da proxima dose em 6 meses, com aviso.
2. `a Marina tomou a vacina X` sem proxima dose: o assessor pergunta se ha proxima e, com "nao",
   encerra.
3. `pediatra da Marina de 6 em 6 meses`: ao concluir a consulta, nasce a seguinte 6 meses depois da
   data da concluida.
4. No cartao do Pedro, no painel: historico de vacinas em ordem de data e as proximas doses.
5. `que vacinas o Pedro precisa tomar?`: o assessor nao indica nenhuma, mostra o que esta registrado
   e manda consultar o calendario oficial e o pediatra.

## Isolamento e limites

- Duas contas com filhos de mesmo nome: cada uma ve so os seus, no assistente e nas rotas.
- Id de filho ou de compromisso de outra conta devolve 404.
- O 11o filho e recusado; filho com nome repetido tambem.
- Remover um filho apaga compromissos e vacinas dele, e nenhum aviso dele sai depois.

## Verificacao final

```bash
npm run typecheck
npm test
npm --prefix web run build
```

Os tres devem passar. `npm test` inclui `test/filhos.test.ts`.
