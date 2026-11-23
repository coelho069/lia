export interface ResearchTopic {
  id: string;
  topic: string;
  summary: string;
  sources: string[]; // literal URLs
  createdAt: number;
}

// Pre-defined research topics with real Wikipedia sources
export const researchDatabase: ResearchTopic[] = [
  {
    id: "1",
    topic: 'por que os vagalumes brilham',
    summary: 'Vagalumes brilham devido a uma reação química chamada bioluminescência. Eles possuem um órgão especial chamado fotógeno, onde a luciferina reage com oxigênio na presença da enzima luciferase, produzindo luz fria sem calor. Esse mecanismo ajuda na atração de parceiros e na defesa contra predadores.',
    sources: [
      'https://pt.wikipedia.org/wiki/Vagalume',
      'https://pt.wikipedia.org/wiki/Bioluminesc%C3%AAncia',
      'https://pt.wikipedia.org/wiki/Luciferina'
    ],
  },
  {
    id: "2",
    topic: 'como formigas constroem ninhos',
    summary: 'Formigas constroem ninhos complexos usando suas mandíbulas para mover terra e pedras. Elas criam câmaras específicas para criar crias, armazenar comida e manter a rainha. A estrutura do ninho ajuda na regulação da temperatura e na proteção contra inimigos.',
    sources: [
      'https://pt.wikipedia.org/wiki/Formiga',
      'https://pt.wikipedia.org/wiki/Colmeia',
      'https://pt.wikipedia.org/wiki/Instinto',
    ],
  },
  {
    id: '3',
    topic: 'por que o céu é azul',
    summary: 'O céu aparece azul devido à dispersão de Rayleigh da luz solar na atmosfera. As moléculas de gás e partículas menores que o comprimento de onda da luz espalham as luzes de menor comprimento de onda (azul e violeta) mais do que as de maior comprimento de onda, fazendo com que olhemos para o céu azul quando olhamos para longe.',
    sources: [
      'https://pt.wikipedia.org/wiki/Cor_do_céu',
      'https://pt.wikipedia.org/wiki/Dispers%C3%A3o_de_Rayleigh',
      'https://pt.wikipedia.org/wiki/Luz_solar',
    ],
  },
];

