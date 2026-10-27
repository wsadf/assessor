# Aprendizados do Meu Assessor

Resumo do trecho de 22:50 a 28:50 do [Jota Jota Podcast #287 com Felipe Titto](https://www.youtube.com/watch?v=lofn5JYtA70&t=1370s), em que ele fala do Meu Assessor e da mudança de foco da Titanium para grandes contas. O texto abaixo é um resumo, não a transcrição.

## O que foi contado

- A ideia veio de um sócio, que levou um MVP feito em cerca de uma semana. O escritório inteiro testou antes de o produto ir para a rua.
- Em menos de um ano o produto chegou a algo entre 200 e 300 mil usuários, com um departamento de tráfego pago forte por trás.
- O preço citado na entrevista é R$ 9,90 por mês.
- A versão 2.0 é ligada ao banco: dá para consultar quanto foi de Pix para uma pessoa, quanto se gastou com um item e quanto já se pagou de parcelas.
- O usuário pergunta onde gastou um valor e recebe o estabelecimento, porque o lançamento é organizado na hora em que entra.
- Um fundo com mais de 500 escritórios, organizados em pirâmide, quis plugar o produto para gerenciar todos e consolidar os dados.
- A renda variável das palestras fazia o fundador não saber quanto ganhava por mês. A Titanium passou a buscar grandes contas para ter receita mais previsível.

## O que virou código neste projeto

| Aprendizado | Implementação |
| --- | --- |
| Consultar Pix e gastos por pessoa ou loja | Campo `counterpart` nos lançamentos; ferramentas `registrar_transacao` e `consultar_transacoes` com `contraparte`; tela **Pessoas e lojas** (`/financas/contrapartes`) |
| Perguntar por item, como o relógio | Filtro `busca` em `consultar_transacoes`, na API e na tela de Transações |
| Parcelas do carro, do relógio | `parcelas` em `registrar_transacao` e no formulário; `addInstallments` cria uma despesa por mês; bloco **Já comprometido com parcelas** |
| Onde foi esse gasto de R$ 200 | Filtro `valor_aproximado` (até 5% de diferença) em `consultar_transacoes` |
| Organizar na hora do lançamento | Prompt orienta o agente a sempre guardar categoria e contraparte |
| Não saber quanto ganha com renda variável | Bloco **Quanto você ganha por mês** com média, menor e maior entrada e variação dos últimos 6 meses |

## O que fica para depois

- **Conta-mãe para redes (B2B):** uma conta que consolida várias, com permissões por nível. Fase 5 do plano.
- **Preço de entrada:** a R$ 9,90 por mês, o custo de IA por conta precisa ficar perto de R$ 3. Exige o modelo mais barato e cache.
- **Pix pelo assessor:** fora do escopo. Movimentar dinheiro exige ser instituição de pagamento ou usar um parceiro regulado; o projeto mantém o acesso ao banco só de leitura.
