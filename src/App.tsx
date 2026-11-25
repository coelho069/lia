import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { safeId } from "./utils/safeId";
import { supabase } from "./supabase";
import { LiaGraph } from "./components/LiaGraph";
import { PesquisaPopup } from "./components/PesquisaPopup";
import { PainelPesquisas } from "./components/PainelPesquisas";
import { MostradorDias } from "./components/MostradorDias";
import { FilaDeTemas, buscarResumo } from "./pesquisa-ciclo";
import { pesquisarSite, buscarFeedNoNavegador, siteIdPorNome, jaFoiPesquisado, type PesquisaComSite } from "./pesquisa-fontes";
import { perguntarModeloLocal, respostaLocal, ErroModelo } from "./cerebro";
import { registrarEvento, iniciarEnvioEventos } from "./eventos";
import { carregarAnotacoes, type Anotacao } from "./anotacoes";
import {
  tickLife,
  decideNextAction,
  createInitialLife,
  type LifeState,
} from "./life";
import { lerExtrasVida, gravarExtrasVida, lerMinutosJogo, gravarMinutosJogo, MINUTOS_INICIAIS } from "./vida-local";
import {
  registrarSessao,
  idUsuarioAtual,
  salvarVidaAoSair,
  salvarBackupSessaoAnonima,
  lerBackupSessaoAnonima,
  saveLifeToSupabase,
  loadLifeFromSupabase,
  saveResearchToSupabase,
  loadResearchesFromSupabase,
  saveGraphToSupabase,
  saveMessagesToSupabase,
  loadMessagesFromSupabase,
  grafoDePesquisa,
  grafoDaLicao,
  carregarLicoesRelacionadas,
  marcarPaginaPesquisando,
  servidorPesquisando,
  lerEstadoServidor,
  type EstadoServidor,
  type ChatRow,
} from "./supabase-persistence";
import type { ResearchTopic } from "./types";

const Pet3D = lazy(() => import("./components/Pet3D").then((m) => ({ default: m.Pet3D })));
const AbaEvolucao = lazy(() => import("./components/AbaEvolucao").then((m) => ({ default: m.AbaEvolucao })));
const NoticiasIA = lazy(() => import("./components/NoticiasIA").then((m) => ({ default: m.NoticiasIA })));
const LinhaDoTempo = lazy(() => import("./components/LinhaDoTempo").then((m) => ({ default: m.LinhaDoTempo })));
const Posicoes = lazy(() => import("./components/Posicoes").then((m) => ({ default: m.Posicoes })));

/* ---------------- Ritmo da pesquisa e da vida (ms) ---------------- */
const PAUSA_MIN_MS = 30000; // pausa curta entre uma pesquisa e outra: de 30 s a 1 min
const PAUSA_EXTRA_MS = 30000;
const DIGITACAO_MIN_MS = 30000; // digita pelo menos isso, mesmo se a busca for rápida
const LEITURA_MS = 10000; // lendo o resultado, sentada (sem pular)
const SALVAR_VISIVEL_MS = 2000; // mostra "Salvando" antes de levantar
const TICK_MS = 4000; // a vida decai a cada 4 s
const DECISAO_MS = 20000; // a Lia decide o que fazer a cada 20 s
const MINUTO_JOGO_MS = 60000; // a hora do jogo avança um minuto a cada minuto real
const SALVAR_VIDA_MS = 30000;
const LIMITE_CARGA_MS = 5000; // tempo máximo esperando o Supabase antes de mostrar a tela
// Leitura da vida: tempo limite de cada tentativa e espera antes da próxima (o último valor se repete)
const LIMITES_VIDA_MS = [LIMITE_CARGA_MS, 10000, 20000, 30000];
const ESPERAS_VIDA_MS = [2000, 4000, 8000, 16000, 30000];

const CHAVE_CACHE_PESQUISAS = (uid: string | null) => "lia-pesquisas:" + (uid ?? "sem-usuario");

type Msg = { id: string; from: string; text: string; createdAt: number };
type Aba = "Cena" | "Pesquisas" | "Grafico" | "Evolucao" | "Noticias" | "Posicoes" | "LinhaDoTempo";

// Barra de abas fixa na base da tela, só no celular (telaEstreita): ícone + rótulo curto, as 7 abas com acesso direto
const ALTURA_ABAS_MOBILE = 58; // altura da barra, sem contar a folga da área segura do celular (notch/home indicator)
const ABAS_MOBILE: { aba: Aba; rotulo: string; icone: string }[] = [
  { aba: "Cena", rotulo: "Cena", icone: "🏠" },
  { aba: "Pesquisas", rotulo: "Pesquisas", icone: "🔎" },
  { aba: "Grafico", rotulo: "Gráfico", icone: "📊" },
  { aba: "Evolucao", rotulo: "Evolução", icone: "🌱" },
  { aba: "Noticias", rotulo: "Notícias", icone: "📰" },
  { aba: "Posicoes", rotulo: "Posições", icone: "🧭" },
  { aba: "LinhaDoTempo", rotulo: "Tempo", icone: "🕒" },
];

const novaMsg = (from: string, text: string): Msg => ({ id: safeId(), from, text, createdAt: Date.now() });

// Promessa com tempo limite: nunca segura a tela
function comLimite<T>(p: PromiseLike<T>, ms = LIMITE_CARGA_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error("sem resposta em " + ms / 1000 + " s")), ms);
  });
  return Promise.race([Promise.resolve(p), limite]).finally(() => clearTimeout(timer));
}

/* ---- Refletor: lição do ciclo. Roda em segundo plano (sem await no ciclo) e só com contraste. ---- */
type RegistroCiclo = {
  tema: string;
  planejou: string[];
  passos: string[];
  funcionou: string[];
  falhou: string[];
  travou: string[];
};

const ETAPAS_PLANEJADAS = ["levantar", "passear", "ir ao computador", "digitar e pesquisar", "ler", "salvar"];

function novoRegistroCiclo(): RegistroCiclo {
  return { tema: "", planejou: [...ETAPAS_PLANEJADAS], passos: [], funcionou: [], falhou: [], travou: [] };
}

// Anota uma etapa real: entra na ordem em passos e também na lista do resultado
function anotarEtapa(reg: RegistroCiclo, resultado: "ok" | "falha" | "travou", etapa: string, detalhe: string): void {
  const linha = `${etapa}: ${detalhe}`;
  reg.passos.push(linha);
  if (resultado === "ok") reg.funcionou.push(linha);
  else if (resultado === "falha") reg.falhou.push(linha);
  else reg.travou.push(linha);
}

// Chama POST /api/refletor. Não é aguardado pelo ciclo: erro aqui só vira log.
function refletirEmSegundoPlano(reg: RegistroCiclo, pesquisaId: string | null): void {
  if (reg.falhou.length === 0 && reg.travou.length === 0) return; // sem contraste: não chama
  const inicio = performance.now();
  void (async () => {
    try {
      const licoesAnteriores = await carregarLicoesRelacionadas(reg.tema).catch(() => [] as string[]);
      const res = await fetch("/api/refletor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...reg, licoesAnteriores }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = (await res.json()) as { licao?: string | null; origem?: string | null; ms?: number; motivo?: string };
      const medido = Math.round(performance.now() - inicio);
      // O ciclo não esperou: o tempo abaixo é o que o refletor levou em segundo plano
      console.info(`[refletor] ${medido} ms em segundo plano (ciclo adicionado: 0 ms), origem: ${json.origem ?? "nenhuma"}`);
      const licao = typeof json.licao === "string" ? json.licao.trim() : "";
      if (!licao) return; // null: não salva nada
      if (!pesquisaId) {
        console.warn("[refletor] lição de ciclo sem pesquisa salva: não gravada (o nó precisa de pesquisa_id)");
        return;
      }
      const g = grafoDaLicao(pesquisaId, licao);
      await saveGraphToSupabase(g.nodes, g.edges);
    } catch (e) {
      console.warn("[refletor] falhou (o ciclo não foi afetado):", e instanceof Error ? e.message : e);
    }
  })();
}

function ordenarUnicas(lista: ResearchTopic[]): ResearchTopic[] {
  const mapa = new Map<string, ResearchTopic>();
  for (const p of lista) mapa.set(p.id, p);
  return [...mapa.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function lerCachePesquisas(): ResearchTopic[] {
  try {
    const raw = localStorage.getItem(CHAVE_CACHE_PESQUISAS(idUsuarioAtual()));
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function gravarCachePesquisas(lista: ResearchTopic[]): void {
  try {
    localStorage.setItem(CHAVE_CACHE_PESQUISAS(idUsuarioAtual()), JSON.stringify(lista.slice(0, 200)));
  } catch {
    // localStorage cheio: segue sem cache
  }
}

/* ---- Rate limit para login (proteção contra força bruta) ---- */
const TENTATIVAS_LIMITE = 5; // máximo de tentativas
const JANELA_TEMPO_MS = 60000; // 1 minuto
const BLOQUEIO_MS = 60000; // bloqueia por 1 minuto após atingir o limite

class LimitadorTentativas {
  private tentativas: number[] = [];
  private bloqueadoAte: number = 0;

  registrarTentativa(): void {
    const agora = Date.now();
    // Remove tentativas fora da janela de tempo
    this.tentativas = this.tentativas.filter((t) => agora - t < JANELA_TEMPO_MS);
    this.tentativas.push(agora);
  }

  estaBloquedo(): boolean {
    return Date.now() < this.bloqueadoAte;
  }

  temporAteDesbloqueio(): number {
    return Math.max(0, Math.ceil((this.bloqueadoAte - Date.now()) / 1000));
  }

  verificarBloqueia(): boolean {
    if (this.estaBloquedo()) return true;
    if (this.tentativas.length >= TENTATIVAS_LIMITE) {
      this.bloqueadoAte = Date.now() + BLOQUEIO_MS;
      this.tentativas = [];
      return true;
    }
    return false;
  }

  tentativasRestantes(): number {
    return Math.max(0, TENTATIVAS_LIMITE - this.tentativas.length);
  }
}

const limitadorLogin = new LimitadorTentativas();

/* ---------------- Tela de login ---------------- */
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [bloqueadoTempo, setBloqueadoTempo] = useState(0);

  useEffect(() => {
    if (!limitadorLogin.estaBloquedo()) {
      setBloqueadoTempo(0);
      return;
    }
    const temporizador = setInterval(() => {
      const tempo = limitadorLogin.temporAteDesbloqueio();
      setBloqueadoTempo(tempo);
      if (tempo <= 0) clearInterval(temporizador);
    }, 1000);
    return () => clearInterval(temporizador);
  }, [ocupado]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (limitadorLogin.verificarBloqueia()) {
      const tempo = limitadorLogin.temporAteDesbloqueio();
      setErro(`Muitas tentativas. Tente de novo em ${tempo} segundo${tempo === 1 ? "" : "s"}.`);
      setBloqueadoTempo(tempo);
      return;
    }

    setOcupado(true);
    setErro(null);
    limitadorLogin.registrarTentativa();

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setOcupado(false);

    if (error) {
      const tentativas = limitadorLogin.tentativasRestantes();
      if (tentativas > 0) {
        setErro(`E-mail ou senha incorretos. ${tentativas} tentativa${tentativas === 1 ? "" : "s"} restante${tentativas === 1 ? "" : "s"}.`);
      } else {
        const tempo = limitadorLogin.temporAteDesbloqueio();
        setErro(`Muitas tentativas. Tente de novo em ${tempo} segundo${tempo === 1 ? "" : "s"}.`);
        setBloqueadoTempo(tempo);
      }
      return;
    }
    onLogin();
  }

  const desabilitado = ocupado || bloqueadoTempo > 0;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#87ceeb" }}>
      <form onSubmit={entrar} style={{ background: "white", padding: 24, borderRadius: 12, width: "min(340px, 92vw)", boxShadow: "0 6px 24px rgba(0,0,0,0.2)" }}>
        <h2 style={{ margin: "0 0 14px", color: "#1a1a2e" }}>Lia</h2>
        <label style={{ fontSize: 13, color: "#555" }}>E-mail</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" disabled={desabilitado}
          style={{ width: "100%", padding: 8, margin: "4px 0 10px", borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box", opacity: desabilitado ? 0.6 : 1, cursor: desabilitado ? "not-allowed" : "auto" }} />
        <label style={{ fontSize: 13, color: "#555" }}>Senha</label>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" disabled={desabilitado}
          style={{ width: "100%", padding: 8, margin: "4px 0 12px", borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box", opacity: desabilitado ? 0.6 : 1, cursor: desabilitado ? "not-allowed" : "auto" }} />
        {erro && <div role="alert" style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>{erro}</div>}
        <button type="submit" disabled={desabilitado}
          style={{ width: "100%", padding: 10, borderRadius: 6, border: "none", background: desabilitado ? "#cccccc" : "#7c3aed", color: "white", fontWeight: "bold", cursor: desabilitado ? "not-allowed" : "pointer" }}>
          {ocupado ? "Entrando..." : bloqueadoTempo > 0 ? `Tente em ${bloqueadoTempo}s` : "Entrar"}
        </button>
      </form>
    </div>
  );
}

/* ---------------- App ---------------- */
export default function App() {
  // Sessão e carga
  const [sessaoVerificada, setSessaoVerificada] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [dadosProntos, setDadosProntos] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tentativaCarga, setTentativaCarga] = useState(0);
  const [erroVida, setErroVida] = useState<string | null>(null);
  const [uidSessao, setUidSessao] = useState<string | null>(null); // só para recarregar se a conta mudar
  const vidaLidaRef = useRef<string | null>(null); // conta cuja vida foi lida do banco nesta carga: só ela pode ser gravada
  const vidaNaTelaRef = useRef<string | null>(null); // conta dona da vida e da hora que estão na tela

  // Tela e vida
  const [tab, setTab] = useState<Aba>("Cena");
  const [life, setLife] = useState<LifeState>(() => createInitialLife()); // provisória: a tela só abre com a vida do banco
  const vidaRef = useRef(life);
  vidaRef.current = life;
  const [acaoTexto, setAcaoTexto] = useState("");
  const [minutosJogo, setMinutosJogo] = useState(MINUTOS_INICIAIS);
  const minutosRef = useRef(minutosJogo);
  minutosRef.current = minutosJogo;

  // Chat
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pensando, setPensando] = useState(false);
  const filaChatRef = useRef<Promise<void>>(Promise.resolve());
  const historicoRef = useRef<Msg[]>([]);
  historicoRef.current = messages;

  // Pesquisa
  const [pesquisas, setPesquisas] = useState<ResearchTopic[]>([]);
  const pesquisasRef = useRef<ResearchTopic[]>([]);
  pesquisasRef.current = pesquisas;
  const [pesquisasLidas, setPesquisasLidas] = useState(false);
  // O que o serviço da VPS está fazendo (lido ao abrir e ao voltar para a aba) + última pesquisa salva
  const [estadoServidorLido, setEstadoServidorLido] = useState<EstadoServidor>({
    pesquisando: false, status: "Sem pesquisa rodando", quando: null,
  });
  const estadoServidor = useMemo(
    () => ({ ...estadoServidorLido, ultimaPesquisa: pesquisas[0] ?? null }),
    [estadoServidorLido, pesquisas],
  );
  const [carregandoPesquisas, setCarregandoPesquisas] = useState(false);
  const [erroPesquisas, setErroPesquisas] = useState<string | null>(null);
  const [pesquisando, setPesquisando] = useState(false);
  const [estadoPesquisa, setEstadoPesquisa] = useState<{ tema: string; status: string } | null>(null);
  const [temaPesquisa, setTemaPesquisa] = useState("");
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const faseRef = useRef<string>("");

  // Anotações da Lia (somente leitura) e popup de detalhe
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  const [erroAnotacoes, setErroAnotacoes] = useState<string | null>(null);
  const [popupPesquisaId, setPopupPesquisaId] = useState<string | null>(null);

  // Layout do chat: lateral recolhível no desktop; rodapé recolhível no celular
  const LARGURA_CHAT = 340;
  // Detecta viewport real mesmo com "Versão para computador" ativada no Chrome Android.
  // visualViewport.width retorna o tamanho real do viewport; fallback para innerWidth se indisponível.
  const obterLarguraViewport = () => window.visualViewport?.width ?? window.innerWidth;
  const [telaEstreita, setTelaEstreita] = useState(() => typeof window !== "undefined" && obterLarguraViewport() <= 700);
  const [chatAberto, setChatAberto] = useState(() => !(typeof window !== "undefined" && obterLarguraViewport() <= 700));
  useEffect(() => {
    const aoRedimensionar = () => setTelaEstreita(obterLarguraViewport() <= 700);
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, []);
  const chatLateral = !telaEstreita && chatAberto; // desktop com chat aberto: a cena encolhe ao lado dele
  // A cena (Pet3D) só se ajusta ao evento de resize da janela: avisa quando o chat muda de lado
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [chatLateral]);
  const recuoPainel = chatLateral ? LARGURA_CHAT + 32 : 16; // área à esquerda do chat (desktop)
  // No celular, a barra de abas fica fixa na base da tela: o que normalmente ficaria no rodapé
  // (chat, botão "Abrir chat", painéis de conteúdo) precisa subir essa altura para não ficar embaixo dela.
  const recuoAbasMobile = `calc(${ALTURA_ABAS_MOBILE}px + env(safe-area-inset-bottom, 0px))`;
  const baseAbas: string = telaEstreita
    ? chatAberto
      ? `calc(45vh + ${ALTURA_ABAS_MOBILE}px + env(safe-area-inset-bottom, 0px) + 24px)`
      : `calc(${recuoAbasMobile} + 8px)`
    : "16px";
  const topoConteudo = telaEstreita ? 56 : 110; // sem a fileira de abas no topo, o celular ganha espaço vertical

  /* ---- Sessão: Supabase Auth, com atalho por IP (anônimo) ---- */
  useEffect(() => {
    let vivo = true;
    const limite = setTimeout(() => {
      if (vivo) setSessaoVerificada(true); // Supabase demorou: mostra a tela de login mesmo assim
    }, LIMITE_CARGA_MS);

    // Tenta recuperar a MESMA sessão anônima a partir do refresh_token guardado em
    // backup (ver supabase-persistence.ts), em vez de criar um usuário anônimo novo
    // (que fica órfão de todo o histórico salvo sob o user_id antigo). Usada quando
    // o storage interno do supabase-js perdeu a sessão sem o refresh_token em si
    // estar morto (ex.: aba parada muito tempo, corrida ao acordar o aparelho).
    async function tentarRecuperarSessaoAnonima(): Promise<boolean> {
      const backup = lerBackupSessaoAnonima();
      if (!backup) return false;
      try {
        const { data: recuperada, error } = await comLimite(
          supabase.auth.refreshSession({ refresh_token: backup.refreshToken })
        );
        if (vivo && !error && recuperada?.session) {
          registrarSessao(recuperada.session);
          salvarBackupSessaoAnonima(recuperada.session);
          setLoggedIn(true);
          return true;
        }
      } catch {
        // backup também não recuperou: quem chamou segue para o próximo passo
      }
      return false;
    }

    (async () => {
      try {
        const { data } = await comLimite(supabase.auth.getSession());
        if (!vivo) return;
        if (data.session) {
          registrarSessao(data.session);
          salvarBackupSessaoAnonima(data.session);
          setLoggedIn(true);
        } else if (!(await tentarRecuperarSessaoAnonima())) {
          const ipPermitido = import.meta.env.VITE_ALLOWED_IP;
          if (ipPermitido) {
            try {
              const res = await comLimite(fetch("https://api.ipify.org?format=json"), 3000);
              const json = await res.json();
              if (vivo && json.ip === ipPermitido) {
                // O atalho por IP precisa de sessão real do Supabase (anônima), senão os saves falham
                const { data: anon, error } = await supabase.auth.signInAnonymously();
                if (vivo && !error && anon?.session) {
                  registrarSessao(anon.session);
                  salvarBackupSessaoAnonima(anon.session);
                  setLoggedIn(true);
                }
              }
            } catch {
              // sem atalho: segue para a tela de login
            }
          }
        }
      } catch {
        // Supabase indisponível: tela de login
      } finally {
        if (vivo) setSessaoVerificada(true);
        clearTimeout(limite);
      }
    })();

    const { data: ouvinte } = supabase.auth.onAuthStateChange((evento, session) => {
      registrarSessao(session ?? null);
      if (session) {
        salvarBackupSessaoAnonima(session);
        setLoggedIn(true);
      } else if (evento === "SIGNED_OUT") {
        // Sessão anônima perdida com a aba ainda aberta (ex.: refresh_token expirou
        // parado): tenta recuperar pelo backup antes de deixar o usuário do atalho
        // por IP preso numa tela de login que ele não tem e-mail/senha para preencher.
        void tentarRecuperarSessaoAnonima().then((recuperou) => {
          if (vivo && !recuperou) setLoggedIn(false);
        });
      }
    });

    return () => {
      vivo = false;
      clearTimeout(limite);
      ouvinte.subscription.unsubscribe();
    };
  }, []);

  // Envio de eventos (diário) em segundo plano
  useEffect(() => iniciarEnvioEventos(), []);

  // Acompanha a conta da sessão: se mudar com a página aberta, a carga roda de novo
  useEffect(() => {
    const { data: ouvinte } = supabase.auth.onAuthStateChange((_evento, session) => setUidSessao(session?.user.id ?? null));
    return () => ouvinte.subscription.unsubscribe();
  }, []);

  // Conta que pode gravar a vida agora: a vida dela foi lida do banco e a sessão ainda é dela
  function contaParaGravarVida(): string | null {
    const uid = vidaLidaRef.current;
    return uid && uid === idUsuarioAtual() ? uid : null;
  }

  // Salvar a vida e a hora do jogo ao sair da página
  useEffect(() => {
    const aoSair = () => {
      const uid = contaParaGravarVida();
      if (uid) salvarVidaAoSair(vidaRef.current, uid);
      const uidTela = vidaNaTelaRef.current;
      if (uidTela) gravarMinutosJogo(uidTela, minutosRef.current);
    };
    window.addEventListener("pagehide", aoSair);
    return () => window.removeEventListener("pagehide", aoSair);
  }, []);

  /* ---- Carga dos dados do Supabase ao entrar ---- */
  useEffect(() => {
    // Carga nova, saída ou troca de conta: nada de vida é gravado até ler do banco de novo
    vidaLidaRef.current = null;
    setErroVida(null);
    if (!loggedIn || vidaNaTelaRef.current !== idUsuarioAtual()) {
      vidaNaTelaRef.current = null;
      setDadosProntos(false);
    }
    if (!loggedIn) return;
    let vivo = true;
    let timerVida: ReturnType<typeof setTimeout> | undefined;
    setErroCarga(null);

    // Lê a vida até conseguir. Erro, tempo esgotado e falta de sessão não são "sem dados": tenta de novo
    async function carregarVida(): Promise<void> {
      for (let n = 0; vivo; n++) {
        try {
          const lida = await comLimite(loadLifeFromSupabase(), LIMITES_VIDA_MS[Math.min(n, LIMITES_VIDA_MS.length - 1)]);
          if (!vivo) return; // resposta de carga antiga
          if (lida.estado === "sem-sessao" || lida.userId !== idUsuarioAtual()) throw new Error("sem sessão do Supabase");
          const uid = lida.userId;
          // Recarga da mesma conta: a vida da tela é mais nova que a do banco, então fica a da tela
          if (vidaNaTelaRef.current !== uid) {
            const nova: LifeState = { ...createInitialLife(), ...lerExtrasVida(uid), ...(lida.estado === "ok" ? lida.vida : {}) };
            const minutos = lerMinutosJogo(uid);
            vidaRef.current = nova;
            setLife(nova);
            minutosRef.current = minutos;
            setMinutosJogo(minutos);
            vidaNaTelaRef.current = uid;
          }
          vidaLidaRef.current = uid;
          setErroVida(null);
          return;
        } catch (e) {
          if (!vivo) return;
          setErroVida(e instanceof Error ? e.message : String(e));
          await new Promise<void>((res) => {
            timerVida = setTimeout(res, ESPERAS_VIDA_MS[Math.min(n, ESPERAS_VIDA_MS.length - 1)]);
          });
        }
      }
    }

    (async () => {
      const vidaCarregada = carregarVida();
      // Cache da conta primeiro, para não mostrar a aba vazia enquanto o Supabase responde
      const cache = ordenarUnicas(lerCachePesquisas());
      if (cache.length) {
        pesquisasRef.current = cache;
        setPesquisas(cache);
      }
      const [pesqDb, msgDb, notas] = await Promise.allSettled([
        comLimite(loadResearchesFromSupabase()),
        comLimite(loadMessagesFromSupabase()),
        comLimite(carregarAnotacoes()),
      ]);
      if (!vivo) return;

      if (pesqDb.status === "fulfilled" && pesqDb.value) {
        const lista = ordenarUnicas(pesqDb.value);
        pesquisasRef.current = lista;
        setPesquisas(lista);
        gravarCachePesquisas(lista);
        setErroPesquisas(null);
      } else if (pesqDb.status === "rejected") {
        setErroCarga("Pesquisas: " + (pesqDb.reason instanceof Error ? pesqDb.reason.message : String(pesqDb.reason)));
      }
      setPesquisasLidas(true);
      if (msgDb.status === "fulfilled" && msgDb.value) {
        setMessages(msgDb.value.map((m: ChatRow) => ({ id: m.id, from: m.from, text: m.text, createdAt: m.createdAt })));
      }
      if (notas.status === "fulfilled") {
        setAnotacoes(notas.value);
        setErroAnotacoes(null);
      } else {
        setErroAnotacoes(notas.reason instanceof Error ? notas.reason.message : String(notas.reason));
      }
      await vidaCarregada; // a tela só abre com a vida lida do banco
      if (vivo) setDadosProntos(true);
    })();
    return () => {
      vivo = false;
      clearTimeout(timerVida);
    };
  }, [loggedIn, uidSessao, tentativaCarga]);

  // Guarda a hora do jogo desta conta, para o F5 voltar na mesma hora
  useEffect(() => {
    if (dadosProntos && vidaNaTelaRef.current) gravarMinutosJogo(vidaNaTelaRef.current, minutosJogo);
  }, [dadosProntos, minutosJogo]);

  /* ---- Vida: agora roda no servidor (pesquisa-servico.mjs) ---- */
  useEffect(() => {
    // Ciclo desabilitado: a vida agora é mantida pelo servidor 24/7 (iniciarCicloVida)
    // e sincronizada aqui apenas para leitura/renderização. Sem mudanças locais.
    // Para ativar de volta: descomentar o code abaixo
    return () => {};
  }, [dadosProntos]);

  /* Código do ciclo de vida desabilitado (roda no servidor):
  useEffect(() => {
    if (!dadosProntos) return;
    const tick = setInterval(() => setLife((v) => tickLife(v)), TICK_MS);
    const relogio = setInterval(() => setMinutosJogo((m) => (m + 1) % (24 * 60)), MINUTO_JOGO_MS);
    const decisao = setInterval(() => {
      const atual = vidaRef.current;
      const { action, actionText } = decideNextAction(atual);
      setAcaoTexto(actionText);
      setLife((v) => {
        const n = { ...v, acaoAtual: action, ultimaAcaoEm: Date.now() };
        if (action === "dormir") n.energia = Math.min(100, v.energia + 35);
        if (action === "comer") n.fome = Math.min(100, v.fome + 40);
        if (action === "brincar") { n.humor = Math.min(100, v.humor + 25); n.energia = Math.max(0, v.energia - 8); }
        if (action === "conversar") n.sociability = Math.min(100, v.sociability + 30);
        if (action === "descansar") n.energia = Math.min(100, v.energia + 20);
        if (action === "explorar") { n.energia = Math.max(0, v.energia - 5); n.sociability = Math.max(0, v.sociability - 5); }
        if (action === "pesquisar") n.energia = Math.max(0, v.energia - 3);
        n.memoriaCurta = [actionText, ...v.memoriaCurta].slice(0, 10);
        return n;
      });
      registrarEvento("decisao", actionText, { acao: action });
    }, DECISAO_MS);
    const salvar = setInterval(() => {
      const uid = contaParaGravarVida();
      if (!uid) return; // vida não confirmada no banco: não grava por cima
      gravarExtrasVida(uid, vidaRef.current);
      void saveLifeToSupabase(vidaRef.current, uid);
    }, SALVAR_VIDA_MS);
    return () => {
      clearInterval(tick);
      clearInterval(relogio);
      clearInterval(decisao);
      clearInterval(salvar);
    };
  }, [dadosProntos]); */

  /* ---- Chat: fila sequencial com o cérebro local ---- */
  function responderLia(pergunta: string) {
    return (async () => {
      setPensando(true);
      let texto: string;
      let ferramentas: string[] = [];
      try {
        // Agente Hermes: o modelo escolhe as ferramentas (pesquisar, salvar, ler vida, objetivo)
        const r = await perguntarModeloLocal(pergunta, {
          pesquisas: () => pesquisasRef.current,
          vida: () => vidaRef.current,
          novaPesquisa: (p) => {
            const lista = ordenarUnicas([p, ...pesquisasRef.current]);
            pesquisasRef.current = lista;
            setPesquisas(lista);
            gravarCachePesquisas(lista);
          },
        });
        texto = r.texto;
        ferramentas = r.ferramentas;
      } catch (e) {
        // Modelo fora do ar ou passou de 30 s: avisa e usa o cérebro de palavras-chave
        setMessages((m) => [...m, novaMsg("sistema", "Modelo local fora do ar, respondendo com o cérebro local")]);
        texto = respostaLocal(pergunta, pesquisasRef.current);
        if (!(e instanceof ErroModelo)) console.error("[chat]", e);
      }
      setMessages((m) => [...m, novaMsg("person", texto)]);
      registrarEvento("chat", pergunta.slice(0, 120), { resposta: texto.slice(0, 300), ferramentas });
      setPensando(false);
    })();
  }

  function enviar() {
    const texto = input.trim();
    if (!texto) return;
    const pergunta = novaMsg("user", texto);
    setMessages((m) => [...m, pergunta]);
    setInput("");
    filaChatRef.current = filaChatRef.current
      .then(() => responderLia(texto))
      .catch((e) => console.error("[chat] falha ao responder:", e));
  }

  // Salva o chat no Supabase quando muda (sem repetir: upsert por id)
  useEffect(() => {
    if (!dadosProntos || messages.length === 0) return;
    const t = setTimeout(() => {
      const linhas: ChatRow[] = messages.slice(-200).map((m) => ({ id: m.id, from: m.from, text: m.text, createdAt: m.createdAt }));
      void saveMessagesToSupabase(linhas).catch((e) => console.error("[chat] salvar:", e));
    }, 2000);
    return () => clearTimeout(t);
  }, [messages, dadosProntos]);

  /* ---- Pesquisas: leitura do Supabase ---- */
  async function atualizarPesquisas(): Promise<void> {
    setCarregandoPesquisas(true);
    try {
      const db = await comLimite(loadResearchesFromSupabase());
      if (db === null) throw new Error("sem sessão do Supabase");
      const lista = ordenarUnicas(db);
      pesquisasRef.current = lista;
      setPesquisas(lista);
      gravarCachePesquisas(lista);
      setErroPesquisas(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErroPesquisas(msg);
      const cache = ordenarUnicas(lerCachePesquisas());
      if (cache.length) {
        pesquisasRef.current = cache;
        setPesquisas(cache);
      }
      registrarEvento("erro", "Falha ao ler pesquisas", { mensagem: msg });
    } finally {
      setCarregandoPesquisas(false);
      setPesquisasLidas(true);
    }
    try {
      setAnotacoes(await comLimite(carregarAnotacoes()));
      setErroAnotacoes(null);
    } catch (e) {
      setErroAnotacoes(e instanceof Error ? e.message : String(e));
    }
  }

  // Lê do Supabase o status do serviço da VPS (sem fazer nada na tela ainda)
  async function atualizarEstadoServidor(): Promise<void> {
    try {
      const lido = await comLimite(lerEstadoServidor());
      if (lido) setEstadoServidorLido(lido);
    } catch (e) {
      console.error("[estado servidor]", e);
      setEstadoServidorLido((antes) => ({ ...antes, pesquisando: false, status: "Não foi possível ler o status do servidor" }));
    }
  }

  // Ao abrir a aba Pesquisas e ao voltar para a aba do navegador, relê do Supabase
  useEffect(() => {
    if (loggedIn && tab === "Pesquisas") void atualizarPesquisas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    void atualizarEstadoServidor();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") {
        void atualizarPesquisas();
        void atualizarEstadoServidor();
      }
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  /* ---- Heartbeat: marcar página como viva para o servidor (sem pesquisar) ---- */
  useEffect(() => {
    if (!loggedIn) return;

    // Marca página como viva imediatamente
    void marcarPaginaPesquisando().catch(() => {});

    // Repete a cada 60 segundos
    const heartbeat = setInterval(() => {
      void marcarPaginaPesquisando().catch(() => {});
    }, 60000);

    return () => clearInterval(heartbeat);
  }, [loggedIn]);

  /* ---- Ciclo de pesquisa: agora roda no servidor (pesquisa-servico.mjs) ---- */
  useEffect(() => {
    if (!loggedIn || !dadosProntos) {
      setPesquisando(false);
      setEstadoPesquisa(null);
      return;
    }
    // Ciclo desabilitado: a pesquisa agora é mantida pelo servidor 24/7 (pesquisarUmaVez em loop)
    // A aba sincroniza pesquisas do Supabase em atualizarPesquisas() e ao voltar (visibilitychange).
    // Sem participação local no ciclo. Para ativar de volta: descomentar o code abaixo.
    return () => {};
  }, [loggedIn, dadosProntos]);

  /* Código do ciclo de pesquisa desabilitado (roda no servidor):
  useEffect(() => {
    if (!loggedIn || !dadosProntos) {
      setPesquisando(false);
      setEstadoPesquisa(null);
      return;
    }
    let ativo = true;
    // Avisa no Supabase que esta aba está pesquisando (o serviço da VPS espera)
    const batida = () => void marcarPaginaPesquisando().catch(() => {});
    batida();
    const heartbeat = setInterval(batida, 60000);
    const fila = new FilaDeTemas(() => pesquisasRef.current.map((p) => p.topic));
    const esperar = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
    const esperarFase = async (alvo: string, limiteMs: number): Promise<boolean> => {
      const t0 = Date.now();
      while (ativo && Date.now() - t0 < limiteMs) {
        if (faseRef.current === alvo) return true;
        await esperar(200);
      }
      return false;
    };
    const salvarComTentativas = async (fn: () => Promise<void>) => {
      let erro: unknown = null;
      for (let i = 0; i < 3; i++) {
        try {
          await fn();
          return;
        } catch (e) {
          erro = e;
          if (i < 2) await esperar(5000 * (i + 1));
        }
      }
      throw erro;
    };
    const mostrar = (tema: string | null, status: string) => setEstadoPesquisa({ tema: tema ?? "", status });

    (async () => {
      while (ativo) {
        // Se o serviço da VPS está pesquisando agora, esta aba só espera
        if (await servidorPesquisando().catch(() => false)) {
          mostrar(null, "Servidor pesquisando");
          await esperar(60000);
          continue;
        }
        // Registro real deste ciclo (alimenta o refletor; não muda o ciclo)
        const reg = novoRegistroCiclo();

        // 1) Levanta e passeia
        setPesquisando(false);
        mostrar(null, "Levantando da cadeira");
        const levantou = await esperarFase("passeando", 30000);
        if (ativo) {
          if (levantou) anotarEtapa(reg, "ok", "levantar", "fase passeando alcançada");
          else anotarEtapa(reg, "travou", "levantar", "fase passeando não chegou em 30 s");
        }
        if (!ativo) break;

        // 2) Pausa passeando (30 s a 1 min)
        mostrar(null, "Passeando até a próxima pesquisa");
        const pausa = PAUSA_MIN_MS + Math.random() * PAUSA_EXTRA_MS;
        await esperar(pausa);
        anotarEtapa(reg, "ok", "passear", `pausa de ${Math.round(pausa / 1000)} s`);
        if (!ativo) break;

        // 3) Vai até o computador e senta
        mostrar(null, "Indo para o computador");
        setPesquisando(true);
        if (!(await esperarFase("digitando", 90000))) {
          if (ativo) {
            anotarEtapa(reg, "travou", "ir ao computador", "fase digitando não chegou em 90 s");
            refletirEmSegundoPlano(reg, null);
          }
          continue;
        }
        if (!ativo) break;
        anotarEtapa(reg, "ok", "ir ao computador", "sentada, digitando");

        // 4) Digitando: a busca roda só aqui
        const inicioDigitacao = Date.now();
        let tema = "";
        let r: PesquisaComSite | null = null;
        let erroBusca = "";
        mostrar(null, "Pesquisando");
        try {
          // Sorteia um site (não repete o último); se falhar, tenta o próximo
          r = await pesquisarSite({
            ultimoSiteId: siteIdPorNome(pesquisasRef.current[0]?.site),
            jaPesquisado: (t) => jaFoiPesquisado(t, pesquisasRef.current),
            buscarFeed: buscarFeedNoNavegador,
            pesquisarWikipedia: async () => {
              const t = await fila.proximo();
              fila.registrar(t);
              return buscarResumo(t);
            },
          });
          if (r) {
            tema = r.tema;
            fila.registrar(r.tema);
            setTemaPesquisa(r.tema);
            mostrar(r.tema, "Pesquisando");
          }
        } catch (e) {
          r = null;
          erroBusca = e instanceof Error ? e.message : String(e);
        }
        if (r) {
          reg.tema = r.tema;
          anotarEtapa(reg, "ok", "digitar e pesquisar", `busca OK em ${r.site}: ${r.tema}`);
        } else {
          anotarEtapa(reg, "falha", "digitar e pesquisar", erroBusca || "nenhuma fonte deu pesquisa nova (feed sem item novo ou página sem resumo)");
        }
        await esperar(Math.max(0, DIGITACAO_MIN_MS - (Date.now() - inicioDigitacao)));
        if (!ativo) break;
        if (faseRef.current !== "digitando") {
          // saiu da cadeira: não salva
          anotarEtapa(reg, "falha", "digitar e pesquisar", "saiu da cadeira antes de salvar");
          refletirEmSegundoPlano(reg, null);
          continue;
        }

        if (!r) {
          mostrar(tema || null, "Falhou, tento outro tema depois");
          registrarEvento("erro", "Pesquisa falhou", { mensagem: "sem internet ou página sem resumo utilizável", tema });
          refletirEmSegundoPlano(reg, null);
          await esperar(3000);
          continue;
        }

        // 5) Lendo o resultado (ainda sentada)
        mostrar(r.tema, "Lendo resultado");
        await esperar(LEITURA_MS);
        anotarEtapa(reg, "ok", "ler", "resultado lido sentada");
        if (!ativo) break;

        // 6) Salva no Supabase e no gráfico
        mostrar(r.tema, "Salvando no gráfico");
        let pesquisaSalva: string | null = null;
        const entry: ResearchTopic = {
          id: safeId(),
          topic: r.tema,
          summary: r.resumo,
          sources: [r.link],
          createdAt: Date.now(),
          site: r.site,
        };
        try {
          const duracao = Date.now() - inicioDigitacao;
          await salvarComTentativas(async () => {
            await saveResearchToSupabase(entry, duracao); // upsert por id: repetir não duplica
            const g = grafoDePesquisa(entry);
            await saveGraphToSupabase(g.nodes, g.edges);
          });
          const proximas = ordenarUnicas([entry, ...pesquisasRef.current]);
          pesquisasRef.current = proximas;
          setPesquisas(proximas);
          gravarCachePesquisas(proximas);
          setErroSalvar(null);
          mostrar(r.tema, "Salvo no Supabase");
          setLife((v) => ({ ...v, xp: v.xp + 10 }));
          registrarEvento("pesquisa", r.tema, {
            fonte: r.link,
            aprendido: r.resumo,
            inicio: new Date(inicioDigitacao).toISOString(),
            duracao_ms: duracao,
            pesquisa_id: entry.id,
          });
          anotarEtapa(reg, "ok", "salvar", "salvou no Supabase (pesquisa e grafo)");
          pesquisaSalva = entry.id;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[pesquisa] NÃO SALVOU no Supabase:", msg, e);
          setErroSalvar("NÃO SALVOU no Supabase (" + r.tema + "): " + msg);
          mostrar(r.tema, "Não salvou no Supabase");
          registrarEvento("erro", "Não salvou pesquisa", { mensagem: msg, o_que_fazia: "salvando pesquisa: " + r.tema });
          anotarEtapa(reg, "falha", "salvar", "erro ao salvar: " + msg);
        }
        await esperar(SALVAR_VISIVEL_MS);
        // Depois do salvamento de 2 s: refletor em segundo plano (não espera; só com contraste)
        refletirEmSegundoPlano(reg, pesquisaSalva);
        // Volta ao topo: levanta e passeia
      }
    })();

    return () => {
      ativo = false;
      clearInterval(heartbeat);
      setPesquisando(false);
      setEstadoPesquisa(null);
    };
  }, [loggedIn, dadosProntos]); */

  // A cena avisa a fase física da Lia (só pesquisa com ela digitando)
  const aoMudarFase = (fase: string) => {
    faseRef.current = fase;
  };

  /* ---- Sair ---- */
  async function sair() {
    await supabase.auth.signOut();
    setLoggedIn(false);
  }

  /* ---- Tela ---- */
  if (!sessaoVerificada) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#87ceeb" }}>Carregando...</div>;
  }
  if (!loggedIn) {
    return <LoginScreen onLogin={() => { setSessaoVerificada(true); setLoggedIn(true); }} />;
  }
  if (!dadosProntos) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", background: "#87ceeb" }}>
        <div>Carregando a Lia...</div>
        {erroVida && (
          <div role="alert" style={{ background: "#fee2e2", color: "#7f1d1d", padding: 10, borderRadius: 6, fontSize: 13, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", textAlign: "center" }}>
            Não consegui ler a vida da Lia. Tentando de novo sozinha.
            <button type="button" onClick={() => setTentativaCarga((n) => n + 1)} style={{ marginLeft: 10, padding: "4px 10px", background: "#7c3aed", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>
              Tentar de novo
            </button>
          </div>
        )}
      </div>
    );
  }

  const horas = String(Math.floor(minutosJogo / 60)).padStart(2, "0");
  const minutos = String(minutosJogo % 60).padStart(2, "0");
  const dia = minutosJogo >= 6 * 60 && minutosJogo < 18 * 60 ? "☀ Dia" : "☾ Noite";
  const titulo = pesquisas[0]?.topic ?? "";

  const botaoAba = (aba: Aba, rotulo: string) => (
    <button
      type="button"
      onClick={() => setTab(aba)}
      style={{
        padding: "6px 14px",
        borderRadius: 6,
        border: "1px solid #ccc",
        background: tab === aba ? "#7c3aed" : "white",
        color: tab === aba ? "white" : "#222",
        fontWeight: tab === aba ? "bold" : "normal",
        cursor: "pointer",
      }}
    >
      {rotulo}
    </button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", fontFamily: "system-ui, sans-serif" }}>
      {/* Cena 3D: sempre montada, para a Lia não recomeçar ao trocar de aba */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: chatLateral ? LARGURA_CHAT + 16 : 0, zIndex: 0, display: tab === "Cena" ? "block" : "none" }}>
        <Suspense fallback={null}>
          <Pet3D
            life={life}
            pesquisando={pesquisando}
            temaPesquisa={temaPesquisa}
            statusPesquisa={estadoPesquisa?.status ?? ""}
            onFasePesquisa={aoMudarFase}
            painel={{ titulo, total: anotacoes.length }}
            onPainelClick={() => { if (pesquisas[0]) setPopupPesquisaId(pesquisas[0].id); }}
            estadoServidor={estadoServidor}
          />
        </Suspense>
      </div>

      {/* Título e abas */}
      <div style={{ position: "absolute", top: 8, left: 8, zIndex: 20 }}>
        <div style={{ fontWeight: "bold", fontSize: 22, color: "#1a1a2e" }}>Lia</div>
        <button type="button" onClick={sair} style={{ background: "none", border: "none", color: "#e94560", cursor: "pointer", fontSize: 13 }}>Sair</button>
      </div>
      {/* Abas: no desktop, fileira no topo-esquerda, como antes. No celular, a barra fixa na base cuida da navegação (mais abaixo). */}
      {!telaEstreita && (
        <div style={{ position: "absolute", top: 60, left: 16, zIndex: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {botaoAba("Cena", "Cena")}
          {botaoAba("Pesquisas", "Pesquisas")}
          {botaoAba("Grafico", "Grafico")}
          {botaoAba("Evolucao", "Evolução")}
          {botaoAba("Noticias", "Notícias")}
          {botaoAba("Posicoes", "Posições")}
          {botaoAba("LinhaDoTempo", "Linha do tempo")}
        </div>
      )}

      {/* Vida da Lia + Pesquisas recentes: sempre visíveis na aba Cena (nada escondido atrás de toque).
          No desktop, cada painel fica no seu canto, como antes. No celular, ficam empilhados numa única
          coluna à esquerda: lado a lado (240px + 320px) não cabe numa tela de 360-430px sem se sobrepor. */}
      {tab === "Cena" && (() => {
        const painelVida = (
          <div style={{ width: 240, padding: 12, background: "rgba(255,255,255,0.88)", borderRadius: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.15)", fontSize: 13 }}>
            <div style={{ fontWeight: "bold", fontSize: 17, marginBottom: 6 }}>Vida da Lia</div>
            <div>Hora: {horas}:{minutos} {dia}</div>
            <div style={{ marginTop: 6, lineHeight: 1.5 }}>
              Fome: {Math.round(life.fome)}<br />
              Energia: {Math.round(life.energia)}<br />
              Humor: {Math.round(life.humor)}<br />
              Social: {Math.round(life.sociability)}<br />
              Saúde: {Math.round(life.saude)}<br />
              XP: {Math.round(life.xp)} (Capítulo {life.chapter})
            </div>
            {acaoTexto && <div style={{ marginTop: 8, fontStyle: "italic", color: "#444" }}>{acaoTexto}</div>}
            <div style={{ marginTop: 8 }}>
              <b>Pesquisando:</b>
              <div style={{ color: "#444" }}>{estadoPesquisa?.status ?? "—"}</div>
            </div>
          </div>
        );
        const painelPesquisas = (
          <PainelPesquisas
            gatilho={pesquisas.length}
            pesquisando={estadoPesquisa?.tema ?? ""}
            onAbrir={(id) => setPopupPesquisaId(id)}
          />
        );
        if (telaEstreita) {
          // Empilhados numa coluna com rolagem própria: se a lista crescer, rola dentro dela
          // em vez de cobrir a barra de abas ou vazar da tela.
          return (
            <div
              style={{
                position: "absolute",
                top: 60,
                left: 8,
                zIndex: 20,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: chatAberto ? "38vh" : "60vh",
                overflowY: "auto",
              }}
            >
              {painelVida}
              {painelPesquisas}
            </div>
          );
        }
        return (
          <>
            <div style={{ position: "absolute", top: 110, left: 16, zIndex: 20 }}>{painelVida}</div>
            {/* top:110 (igual ao painel Vida da Lia), não mais top:52: com 7 abas (antes eram 4) a fileira de
                abas do topo-esquerda (top:60, uma linha só, sem largura máxima) passou a esticar bem mais para
                a direita e sobrepunha este painel em larguras de laptop comuns (1024-1366px, chat aberto ou
                fechado). A fileira de abas ocupa só até ~top:92; top:110 fica sempre livre dela, em qualquer
                largura de tela, sem precisar limitar a largura da fileira (o que a faria quebrar linha e
                sobrepor o painel "Vida da Lia" abaixo dela, que começa em top:110). */}
            <div style={{ position: "absolute", top: 110, right: recuoPainel, zIndex: 20 }}>{painelPesquisas}</div>
          </>
        );
      })()}

      {/* Mostrador de dias e hora: canto superior direito, uma linha; não cobre abas (top 60 à esquerda) nem o chat (top 110) */}
      {/* Mostrador de dias: ao lado (à esquerda) dos botões da câmera, que ficam no canto direito da cena */}
      <div style={{ position: "absolute", top: telaEstreita ? 44 : 8, right: telaEstreita ? 8 : 256, zIndex: 25 }}>
        <MostradorDias />
      </div>

      {/* Avisos */}
      {erroSalvar && (
        <div role="alert" style={{ position: "absolute", top: 8, right: 8, zIndex: 30, background: "#fee2e2", color: "#7f1d1d", padding: "6px 10px", borderRadius: 6, fontSize: 12, maxWidth: "min(360px, calc(100vw - 16px))", boxSizing: "border-box" }}>
          {erroSalvar}
        </div>
      )}
      {(erroCarga || erroVida) && (
        <div role="alert" style={{ position: "absolute", top: 8, right: 8, zIndex: 30, background: "#fee2e2", color: "#7f1d1d", padding: 10, borderRadius: 6, fontSize: 13, maxWidth: "calc(100vw - 16px)", boxSizing: "border-box" }}>
          Não consegui ler do Supabase: {[erroCarga, erroVida && "Vida: " + erroVida + " (a vida não é gravada até ler)"].filter(Boolean).join("; ")}.
          <button type="button" onClick={() => setTentativaCarga((n) => n + 1)} style={{ marginLeft: 10, padding: "4px 10px", background: "#7c3aed", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>
            Tentar de novo
          </button>
        </div>
      )}
      {erroAnotacoes && (
        <div
          role="alert"
          style={{
            position: "absolute",
            top: 8,
            left: telaEstreita ? 70 : 220,
            zIndex: 20,
            background: "#fee2e2",
            color: "#7f1d1d",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            maxWidth: telaEstreita ? "calc(100vw - 86px)" : "calc(100vw - 236px)",
            boxSizing: "border-box",
          }}
        >
          Anotações não carregaram: {erroAnotacoes}
        </div>
      )}

      {/* Aba Pesquisas */}
      {tab === "Pesquisas" && (
        <div style={{ position: "absolute", top: topoConteudo, left: 16, right: recuoPainel, bottom: baseAbas, zIndex: 10, overflow: "auto", background: "#fafaf7", borderRadius: 12, padding: 16, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 20, color: "#1a1a2e" }}>Pesquisas da Lia na internet</h2>
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            <b>Pesquisando:</b> {estadoPesquisa?.status ?? "—"}
          </div>
          {erroPesquisas && (
            <div style={{ marginBottom: 12, padding: 10, background: "#fff3f3", border: "1px solid #e94560", borderRadius: 6, color: "#8a1c2e", fontSize: 13 }}>
              Não consegui ler as pesquisas do Supabase: {erroPesquisas}.
              <button type="button" onClick={() => void atualizarPesquisas()} style={{ marginLeft: 10, padding: "4px 10px", background: "#7c3aed", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>
                Tentar de novo
              </button>
            </div>
          )}
          {pesquisas.length === 0 && (carregandoPesquisas || !pesquisasLidas) && !erroPesquisas ? (
            <p style={{ color: "#666" }}>Carregando as pesquisas do Supabase...</p>
          ) : pesquisas.length === 0 && !erroPesquisas ? (
            <p style={{ color: "#666" }}>A Lia ainda não pesquisou nada. A próxima pesquisa aparece aqui.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pesquisas.map((p) => {
                const notas = anotacoes.filter((a) => a.pesquisaId === p.id);
                const fonte = p.sources.find((s) => /^https?:\/\//i.test(s));
                return (
                  <div key={p.id} onClick={() => setPopupPesquisaId(p.id)} style={{ cursor: "pointer", padding: 12, border: "1px solid #ddd", borderRadius: 8, background: "white" }}>
                    <div style={{ fontWeight: "bold", fontSize: 16, color: "#1a1a2e", marginBottom: 4 }}>{p.topic}</div>
                    <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
                      {new Date(p.createdAt).toLocaleString("pt-BR")}
                      {p.site && <> · Site: <b>{p.site}</b></>}
                    </div>
                    <div style={{ fontSize: 14, color: "#333", marginBottom: 6 }}>{p.summary}</div>
                    {notas.length > 0 && (
                      <div style={{ marginBottom: 8, padding: 8, background: "#f5f3ff", borderRadius: 6 }}>
                        <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: "bold", textTransform: "uppercase", marginBottom: 4 }}>Anotação da Lia</div>
                        {notas.map((a) => (
                          <div key={a.id} style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap" }}>
                            <span style={{ fontSize: 12, color: "#666" }}>{new Date(a.criadoEm).toLocaleString("pt-BR")} · </span>
                            {a.texto}
                          </div>
                        ))}
                      </div>
                    )}
                    <div>
                      {fonte ? (
                        <a href={fonte} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "#7c3aed", textDecoration: "underline", fontSize: 13 }}>
                          Fonte: {fonte}
                        </a>
                      ) : (
                        <span style={{ color: "#888", fontSize: 13 }}>Fonte não registrada</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Aba Grafico */}
      {tab === "Grafico" && (
        <div style={{ position: "absolute", top: topoConteudo, left: 16, right: recuoPainel, bottom: baseAbas, zIndex: 10, overflow: "auto", background: "#fafaf7", borderRadius: 12, padding: 12 }}>
          <LiaGraph pesquisas={pesquisas} onAbrirPesquisa={(id: string) => setPopupPesquisaId(id)} />
        </div>
      )}

      {/* Aba Evolução */}
      {tab === "Evolucao" && (
        <div style={{ position: "absolute", top: topoConteudo, left: 16, right: recuoPainel, bottom: baseAbas, zIndex: 10, overflow: "auto", background: "#fafaf7", borderRadius: 12, padding: 16 }}>
          <Suspense fallback={null}>
            <AbaEvolucao onAbrirPesquisa={(id: string) => setPopupPesquisaId(id)} />
          </Suspense>
        </div>
      )}

      {/* Aba Notícias de IA e comentário da Lia (só leitura da rota /api/noticias-ia) */}
      {tab === "Noticias" && (
        <div style={{ position: "absolute", top: topoConteudo, left: 16, right: recuoPainel, bottom: baseAbas, zIndex: 10, overflow: "auto", overflowX: "hidden", background: "#fafaf7", borderRadius: 12, padding: 16, boxSizing: "border-box" }}>
          <Suspense fallback={null}>
            <NoticiasIA />
          </Suspense>
        </div>
      )}

      {/* Aba Posições: as posições que a Lia formou a partir das lições (só leitura) */}
      {tab === "Posicoes" && (
        <div style={{ position: "absolute", top: topoConteudo, left: 16, right: recuoPainel, bottom: baseAbas, zIndex: 10, overflow: "auto", overflowX: "hidden", background: "#fafaf7", borderRadius: 12, padding: 16, boxSizing: "border-box" }}>
          <Suspense fallback={null}>
            <Posicoes />
          </Suspense>
        </div>
      )}

      {/* Aba Linha do tempo: o que aconteceu desde a última visita (só leitura; não grava no banco) */}
      {tab === "LinhaDoTempo" && (
        <div style={{ position: "absolute", top: topoConteudo, left: 16, right: recuoPainel, bottom: baseAbas, zIndex: 10, overflow: "auto", overflowX: "hidden", background: "#fafaf7", borderRadius: 12, padding: 16, boxSizing: "border-box" }}>
          <Suspense fallback={null}>
            <LinhaDoTempo />
          </Suspense>
        </div>
      )}

      {/* Botão para abrir o chat, quando recolhido. No celular, fica acima da barra de abas fixa na base. */}
      {!chatAberto && (
        <button
          type="button"
          onClick={() => setChatAberto(true)}
          style={{
            position: "absolute",
            right: 16,
            zIndex: 16,
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: "#7c3aed",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
            boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
            bottom: telaEstreita ? `calc(${recuoAbasMobile} + 16px)` : 16,
          }}
        >
          Abrir chat
        </button>
      )}

      {/* Chat: coluna lateral à direita no desktop; rodapé no celular, acima da barra de abas. Fica montado e só some ao recolher */}
      <div
        style={{
          position: "absolute",
          zIndex: 15,
          background: "rgba(10,20,30,0.85)",
          borderRadius: 10,
          padding: 10,
          display: chatAberto ? "flex" : "none",
          flexDirection: "column",
          gap: 8,
          ...(telaEstreita
            ? { left: 8, right: 8, bottom: recuoAbasMobile, height: "45vh" }
            : { right: 16, top: 110, bottom: 16, width: LARGURA_CHAT }),
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => setChatAberto(false)}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #ccc", background: "white", color: "#222", fontSize: 12, cursor: "pointer" }}
          >
            Esconder chat
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", color: "white", fontSize: 14 }}>
          {messages.slice(-30).map((m) => (
            <div key={m.id}>
              <b>{m.from}:</b> {m.text}
            </div>
          ))}
          {pensando && <div style={{ fontStyle: "italic", opacity: 0.8 }}>Lia está pensando...</div>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
            placeholder="Fala com a Lia..."
            style={{ flex: 1, minWidth: 0, padding: 10, borderRadius: 6, border: "1px solid #ccc" }}
          />
          <button type="button" onClick={enviar} style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: "#7c3aed", color: "white", fontWeight: "bold", cursor: "pointer" }}>
            Enviar
          </button>
        </div>
      </div>

      {/* Barra de abas fixa na base, só no celular: ícone + rótulo curto, as 7 abas com acesso direto (nenhuma em menu "Mais") */}
      {telaEstreita && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 35,
            display: "flex",
            background: "white",
            borderTop: "1px solid #ddd",
            boxShadow: "0 -2px 10px rgba(0,0,0,0.12)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {ABAS_MOBILE.map(({ aba, rotulo, icone }) => (
            <button
              key={aba}
              type="button"
              onClick={() => setTab(aba)}
              aria-current={tab === aba ? "page" : undefined}
              style={{
                flex: 1,
                minWidth: 0,
                height: ALTURA_ABAS_MOBILE,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                border: "none",
                background: "transparent",
                color: tab === aba ? "#7c3aed" : "#555",
                fontWeight: tab === aba ? "bold" : "normal",
                cursor: "pointer",
                padding: "4px 2px",
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{icone}</span>
              <span style={{ fontSize: 10, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                {rotulo}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Popup do detalhe da pesquisa, no centro da tela */}
      {popupPesquisaId && (
        <PesquisaPopup
          pesquisaId={popupPesquisaId}
          reserva={pesquisas.find((x) => x.id === popupPesquisaId) ?? null}
          onFechar={() => setPopupPesquisaId(null)}
        />
      )}
    </div>
  );
}
