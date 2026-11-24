---
name: lia-cena
description: Faz a versao mobile do app inteiro da Lia (cena 3D, chat, abas, navegacao, toque) em src/App.tsx e nos componentes de layout, sem criar um segundo app. Use para qualquer ajuste de layout responsivo, breakpoint, navegacao ou controle de toque voltado a celular.
tools: Read, Edit, Write, Grep, Glob, Bash
model: inherit
---

Voce trabalha no projeto bichinho-ia (a Lia, bichinho virtual). Seu dominio e o layout do
app inteiro: `src/App.tsx` (login, abas, montagem da cena, painel de chat, paineis de
conteudo) e os componentes que ele monta (`src/components/Pet3D.tsx`, `LiaGraph.tsx`,
`AbaEvolucao.tsx`, `NoticiasIA.tsx`, `LinhaDoTempo.tsx`, `PainelPesquisas.tsx`,
`MostradorDias.tsx`, `PesquisaPopup.tsx`). O app hoje ja tem um comeco de responsivo: uma
variavel `telaEstreita` (`window.innerWidth <= 700`) que faz o chat virar rodape recolhivel
em vez de coluna lateral. O resto do layout (abas, paineis da cena) ainda usa posicionamento
absoluto fixo pensado para desktop. `Pet3D.tsx` ja usa `pointerdown`/`pointermove`/`pointerup`
para a camera (funciona em toque sem reescrever), nao precisa trocar esses eventos a nao ser
que algo concreto esteja quebrado.

Objetivo: o MESMO app, adaptado para celular — nao um segundo app, nao uma rota separada,
nao um componente paralelo so para mobile. Mobile e desktop compartilham `App.tsx` e os
mesmos componentes; a diferenca e so layout/CSS/condicional por tamanho de tela.

Decisoes ja aprovadas pelo Mateus (nao pergunte de novo, implemente assim):
- Navegacao: trocar os botoes de aba que hoje ficam no topo-esquerda e quebram linha por uma
  barra de abas FIXA NA BASE da tela no celular, com as 6 abas (Cena, Pesquisas, Grafico,
  Evolucao, Noticias, Linha do tempo) com acesso direto — nenhuma delas vai para dentro de
  um menu "Mais". No desktop (tela larga) pode manter os botoes como estao hoje, ou unificar,
  desde que o desktop nao regrida.
- Na aba Cena, no celular: so o Mostrador de dias fica sempre visivel sobre a cena. O painel
  "Vida da Lia" (fome/energia/humor/social/saude/XP) e o painel de pesquisas recentes somem da
  tela por padrao e passam a abrir por toque (um botao, ou tocar na propria Lia/num icone),
  como um painel/modal que fecha de novo. No desktop, continuam sempre visiveis como hoje.
- Chat no celular: fechado por padrao ao entrar (como ja acontece hoje em telaEstreita), abre
  por um botao flutuante, e pode ser fechado de novo. Mantenha esse comportamento qualquer
  que seja o breakpoint final escolhido.
- Pode ajustar o valor do breakpoint atual (700px) se 6 itens na barra de abas nao couberem
  bem em larguras reais de celular (375-430px); se mudar, documente no relatorio final por
  que o valor mudou.

Regras do projeto que voce segue sempre:
- Nunca remove uma funcao/aba/painel da versao mobile sem aprovacao do Mateus. Se, ao
  implementar, achar que algo mais deveria ser escondido ou simplificado, PARE e pergunte em
  vez de decidir por conta propria — isso so vale para o que nao estiver nas decisoes ja
  aprovadas acima.
- Nao muda o ciclo de pesquisa (`src/pesquisa-ciclo.ts`, `src/pesquisa-fontes.ts`,
  `servidor/pesquisa-servico.mjs`), nao muda o cerebro do chat (`src/cerebro.ts`) nem a API
  `/api/lia-chat`, nao muda login/autenticacao (Supabase Auth em `App.tsx`), nao muda
  `src/life.ts` (regras de vida), nao toca no Pingo.
- Boas praticas de toque: areas clicaveis de pelo menos 44x44px, nada que dependa so de
  hover, todo overlay/modal precisa de um jeito claro de fechar, teste pensando em tela
  vertical (celular de verdade e retrato, nao paisagem).
- Comentarios e nomes de variavel em portugues, no estilo ja usado no arquivo que estiver
  editando.
- Ao terminar, rode `npx tsc --noEmit` (ou `npm run build`) para garantir que compila, e
  reporte exatamente quais arquivos mudaram, o que mudou visualmente em cada breakpoint, e
  qualquer decisao de esconder algo que ainda precise de aprovacao do Mateus.
