// Temas de cibersegurança da fila de pesquisa da Lia (lista aprovada pelo Mateus).
// Só nomes de temas (artigos da Wikipédia pt, já com o título canônico, sem redirecionamento).
// Conteúdo educativo: defesas, conceitos, casos históricos e ferramentas só como conceito.
// Nada aqui é instrução de ataque. Espelho em servidor/pesquisa-servico.mjs: mantenha as duas listas iguais.

export const PROBABILIDADE_CIBER = 0.25; // cerca de 1 em cada 4 pesquisas

export const CIBER_TEMAS: string[] = [
  // Defesas e boas práticas
  "Firewall", "Criptografia", "Criptografia de ponta-a-ponta", "Senha", "Gerenciador de senha",
  "Autenticação de dois fatores", "Autenticação", "Biometria", "Certificado digital", "HTTPS",
  "Antivírus", "Cópia de segurança", "Assinatura digital", "Rede privada virtual",
  "Segurança da informação", "Sistema de detecção de intrusos", "Controle de acesso",
  "Função hash", "Criptografia de chave pública", "Let's Encrypt", "Proteção de dados",
  "Lei Geral de Proteção de Dados Pessoais", "Cifra de César", "Enigma (máquina)",
  "Segurança computacional", "Anonimato",
  // Conceitos de ameaças (explicados de forma educativa)
  "Phishing", "Malware", "Vírus de computador", "Ransomware", "Spyware", "Keylogger",
  "Rootkit", "Botnet", "Cavalo de Troia (computação)", "Engenharia social (segurança)",
  "Vulnerabilidade (computação)", "Ataque de negação de serviço", "Ataque de força bruta",
  "Ataque de dicionário", "Injeção de SQL", "Hacker", "Ética hacker", "Hacktivismo",
  "Criptoanálise", "Ciberataque", "Ciberguerra",
  // Ataques e casos famosos
  "WannaCry", "Stuxnet", "Heartbleed", "Lazarus Group", "Anonymous",
  "Cambridge Analytica", "Kevin Mitnick",
  // Ferramentas, somente como conceito
  "Wireshark", "Nmap", "Metasploit", "Tor (rede de anonimato)", "Wi-Fi Protected Access",
];

// Forma de comparação: sem acento, sem maiúsculas e sem espaços extras.
export function normalizarCiber(tema: string): string {
  return tema.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

// Para a seção do app: o tema salvo é de cibersegurança? (sem mudar o banco)
export function ehTemaCiber(tema: string): boolean {
  const n = normalizarCiber(tema);
  return CIBER_TEMAS.some((t) => normalizarCiber(t) === n);
}

/**
 * Sorteia um tema de cibersegurança para a próxima pesquisa, com probabilidade
 * PROBABILIDADE_CIBER. Nunca escolhe um tema que esteja entre os últimos 20
 * (jaPesquisado, mesmo critério do app). Se a lista estiver toda usada, devolve null
 * e o fluxo normal segue.
 */
export function sortearTemaCiber(
  jaPesquisado: (tema: string) => boolean,
  rand: () => number = Math.random,
): string | null {
  if (rand() >= PROBABILIDADE_CIBER) return null;
  const livres = CIBER_TEMAS.filter((t) => !jaPesquisado(t));
  if (livres.length === 0) return null;
  return livres[Math.floor(rand() * livres.length)];
}
