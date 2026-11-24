import React, { useEffect, useRef, useState } from "react";
import { Pet3D } from "./components/Pet3D";
import { safeId } from "./utils/safeId";
import { supabase } from "./supabase";
import type { LifeState } from "./life";
import {
  createInitialLife,
  loadLife,
  saveLife,
  tickLife,
  decideNextAction,
} from "./life";

// ============================================================
// LOGIN GATE - Front-end gate hides the app but does not protect
// the static files by itself, because Vite preview serves static
// files. Real protection needs a server gate, for example Nginx
// basic auth or Tailscale. Do not claim this login alone makes
// the VPS private.
// ============================================================

// A autenticação agora é feita pelo Supabase Auth (supabase.auth.signInWithPassword).
// As credenciais não estão mais em variáveis de ambiente do Vite nem embutidas no build.

const SESSION_KEY = "lia-session";
const SESSION_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12 hours

type Msg = { from: string; text: string };

function LoginScreen({
  isLoggedIn,
  onLogin,
  onLogout,
  error,
  username,
}: {
  isLoggedIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  error?: string;
  username?: string;
}) {
  // All useState calls moved to the top, BEFORE any conditional return
  const [user, setUser] = useState(username || "");
  const [password, setPassword] = useState("");
  const [showError, setShowError] = useState<string | null>(error || null);

  if (isLoggedIn) {
    return null;
  }

  const handleLogin = async () => {
    setShowError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: user,
      password,
    });

    if (error) {
      setShowError("Usuario ou senha incorretos.");
      return;
    }

    // O signInWithPassword cria a sessão do Supabase automaticamente.
    // Mantém um marcador de sessão local para compatibilidade com o fluxo atual.
    const token = safeId();
    const expiry = Date.now() + SESSION_EXPIRY_MS;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiry }));
    } catch (e) {
      // sessionStorage may fail in some contexts
    }
    setShowError(null);
    onLogin();
  };

  const handleLogout = () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      // Ignore
    }
    onLogout();
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        width: "100%",
        padding: "24px",
        boxSizing: "border-box",
        background: "#87ceeb",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 340,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 48, fontWeight: "bold", margin: "10px 0", color: "#16213e" }}>Lia</h1>
        <div style={{ margin: "24px 0" }}>
          <label style={{
            display: "block", margin: "8px 0", fontSize: 16, fontWeight: "500",
            color: "#1a1a2e"
          }}>Usuário (e-mail)</label>
          <input
            style={{
              width: "100%", maxWidth: 320, padding: "8px 12px",
              margin: "8px 0", border: "1px solid #9e9e9e",
              borderRadius: 4, fontSize: 16, boxSizing: "border-box"
            }}
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="seu_email"
          />
          <label style={{
            display: "block", margin: "8px 0 0 0", fontSize: 16, fontWeight: "500",
            color: "#1a1a2e"
          }}>Senha</label>
          <input
            style={{
              width: "100%", maxWidth: 320, padding: "8px 12px",
              margin: "8px 0", border: "1px solid #9e9e9e",
              borderRadius: 4, fontSize: 16, boxSizing: "border-box"
            }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="minha_senha"
          />
          {showError && (
            <p style={{ color: "#e94560", margin: "12px 0", fontSize: 14 }}>
              {showError}
            </p>
          )}
          <button
            style={{
              background: "#7c3aed", color: "white", border: "none",
              borderRadius: 4, padding: "8px 16px", fontSize: 14
            }}
            onClick={handleLogin}
          >
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}

export const App: React.FC = () => {
  // State: whether the user is logged in
  const [loggedIn, setLoggedIn] = useState(false);
  // IP auto-login guard - prevents re-checking on every render
  const ipChecked = useRef(false);
  // Error message shown on failed login
  const [error, setError] = useState<string | null>(null);
  // Username input value
  const [username, setUsername] = useState("");
  // Chat messages
  const [messages, setMessages] = useState<Msg[]>([]);
  // Chat input value
  const [input, setInput] = useState("");
  // Callback refs: store callbacks in refs to prevent re-creation on every render.
  // Critical bug fix: typing in the chat textbox must NOT restart the 3D animation.
  // The Pet3D useEffect must run only once with empty deps [].
  // Store callbacks in a ref, never put a new inline callback in the useEffect deps.
  const onPetPositionChangeRef = useRef(() => {});

  // --- Estado de vida da Lia (Matrix) ---
  const [life, setLife] = useState<LifeState>(loadLife());
  // Ciclo dia/noite: 0-23 (hora do dia). 6-18 dia, 18-6 noite.
  const [hour, setHour] = useState(6);
  // Última ação executada pela Lia (para exibir no painel)
  const [lastAction, setLastAction] = useState<string | null>(null);
  // --- Estado de pesquisa da Lia ---
  const [pesquisando, setPesquisando] = useState(false);
  const [temaPesquisa, setTemaPesquisa] = useState("");
  const [resultadoPesquisa, setResultadoPesquisa] = useState<{ tema: string; resumo: string; link: string } | null>(null);
  const [ultimaPesquisaEm, setUltimaPesquisaEm] = useState(0);
  // Refs para ler valores mutáveis sem causar re-execução do efeito
  const pesquisandoRef = useRef(pesquisando);
  pesquisandoRef.current = pesquisando;
  const ultimaPesquisaEmRef = useRef(ultimaPesquisaEm);
  ultimaPesquisaEmRef.current = ultimaPesquisaEm;

  // --- Sessão: checa o Supabase primeiro; IP só como fallback ----------
  // Mantém o login após reload via supabase.auth.getSession() e onAuthStateChange.
  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted && data?.session) {
        setLoggedIn(true);
        setError(null);
        return;
      }

      // Fallback de auto-login por IP: só quando não há sessão do Supabase,
      // executado uma única vez (guarda ipChecked). Nunca pula o Supabase.
      if (mounted && !ipChecked.current) {
        ipChecked.current = true;
        const allowedIp = import.meta.env.VITE_ALLOWED_IP;
        if (allowedIp) {
          try {
            const res = await fetch("https://api.ipify.org?format=json");
            const json = await res.json();
            if (mounted && json.ip === allowedIp) {
              setLoggedIn(true);
            }
          } catch {
            // Indisponível; continua sem login automático por IP
          }
        }
      }
    };

    checkSession();

    const { data: authData } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setLoggedIn(true);
        setError(null);
      } else if (event === "SIGNED_OUT" || event === "USER_DELETED") {
        setLoggedIn(false);
        setError(null);
      }
    });

    return () => {
      mounted = false;
      authData?.subscription?.unsubscribe();
    };
  }, []);

  // --- Ciclo de vida da Lia: tick, dia/noite, decisão automática, auto-save ---
  // Roda apenas uma vez (deps []). Valores mutáveis são lidos via refs para não causar re-execução.
  useEffect(() => {
    let mounted = true;
    let tickTimer: any;
    let hourTimer: any;
    let decisionTimer: any;
    let pesquisaTimer: any;

    const TICK_INTERVAL_MS = 4000; // vida decai a cada 4s
    const HOUR_INTERVAL_MS = 10000; // hora avança a cada 10s
    const DECISION_INTERVAL_MS = 15000; // Lia decide a cada 15s

    const doTick = () => {
      setLife((prev) => {
        const next = tickLife(prev);
        saveLife(next);
        return next;
      });
    };

    const advanceHour = () => {
      setHour((h) => (h + 1) % 24);
    };

    const doDecision = () => {
      setLife((prev) => {
        const { action, actionText } = decideNextAction(prev);
        let next = { ...prev, acaoAtual: action, ultimaAcaoEm: Date.now() };

        // Aplicar efeitos da ação nos atributos
        if (action === "dormir") {
          next = { ...next, energia: Math.min(100, next.energia + 30), humor: Math.min(100, next.humor + 10) };
        } else if (action === "comer") {
          next = { ...next, fome: Math.min(100, next.fome + 30), energia: Math.min(100, next.energia + 10) };
        } else if (action === "brincar") {
          next = { ...next, humor: Math.min(100, next.humor + 15), energia: Math.max(0, next.energia - 10) };
        } else if (action === "conversar") {
          next = { ...next, sociability: Math.min(100, next.sociability + 15), humor: Math.min(100, next.humor + 10) };
        } else if (action === "descansar") {
          next = { ...next, energia: Math.min(100, next.energia + 15) };
        } else if (action === "pesquisar") {
          next = { ...next, xp: Math.min(999, next.xp + 10), energia: Math.max(0, next.energia - 5) };
          // Inicia pesquisa aleatória (se não estiver já pesquisando)
          if (!pesquisandoRef.current && Date.now() - ultimaPesquisaEmRef.current >= 300000) {
            void iniciarPesquisa();
          }
        } else if (action === "explorar") {
          next = { ...next, energia: Math.max(0, next.energia - 5), sociability: Math.max(0, next.sociability - 5) };
        }

        saveLife(next);
        setLastAction(actionText);
        return next;
      });
    };

    const TEMA_ALEATORIO = [
      "Brasil",
      "Japão",
      "Egito",
      "França",
      "Astronomia",
      "Dinossauros",
      "Música",
      "Pintura",
      "Culinária",
      "Esportes",
    ];

    async function iniciarPesquisa() {
      if (pesquisandoRef.current) return;
      const agora = Date.now();
      if (agora - ultimaPesquisaEmRef.current < 300000) return; // 5 min entre pesquisas
      setPesquisando(true);
      pesquisandoRef.current = true;
      const tema = TEMA_ALEATORIO[Math.floor(Math.random() * TEMA_ALEATORIO.length)];
      setTemaPesquisa(tema);
      try {
        const res = await fetch(
          `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(tema)}&format=json&origin=*`,
        );
        if (!res.ok) throw new Error("Falha na Wikipedia");
        const data = await res.json();
        const resultado = data.query?.search?.[0];
        if (resultado) {
          const payload = {
            tema: resultado.title,
            resumo: resultado.snippet.replace(/<[^>]*>/g, ""),
            link: `https://pt.wikipedia.org/wiki/${encodeURIComponent(resultado.title.replace(/ /g, "_"))}`,
          };
          setResultadoPesquisa(payload);
          // Adiciona ao chat
          setMessages((prev) => [
            ...prev,
            { from: "user", text: "Pesquisando: " + tema },
            { from: "person", text: "Pesquisei sobre " + payload.tema + ". " + payload.resumo + " Fonte: " + payload.link },
          ]);
          setUltimaPesquisaEm(agora);
          ultimaPesquisaEmRef.current = agora;
        } else {
          setMessages((prev) => [...prev, { from: "person", text: "Não encontrei nada sobre " + tema + " na Wikipedia." }]);
        }
      } catch {
        setMessages((prev) => [...prev, { from: "person", text: "Não consegui pesquisar agora. A internet falhou. Tento de novo depois." }]);
      } finally {
        setPesquisando(false);
        pesquisandoRef.current = false;
      }
    }

    doTick();
    advanceHour();
    doDecision();

    // Pesquisa automática a cada 5 minutos
    const agendarPesquisa = () => {
      clearTimeout(pesquisaTimer);
      pesquisaTimer = setTimeout(() => {
        void iniciarPesquisa();
        agendarPesquisa();
      }, 300000);
    };
    agendarPesquisa();

    tickTimer = setInterval(doTick, TICK_INTERVAL_MS);
    hourTimer = setInterval(advanceHour, HOUR_INTERVAL_MS);
    decisionTimer = setInterval(doDecision, DECISION_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(tickTimer);
      clearInterval(hourTimer);
      clearInterval(decisionTimer);
      clearTimeout(pesquisaTimer);
    };
  }, []);

  // Pet3D position callback ref (só define o ref, sem recriar callbacks a cada render).
  useEffect(() => {
    onPetPositionChangeRef.current = (x: number, z: number) => {
      // Callback - intentionally left empty to avoid re-renders
    };
  }, []);

  // Handle login form submission.
  // LoginScreen já valida as credenciais no Supabase e cria a sessão antes
  // de chamar onLogin(), então aqui só muda o app para o estado logado.
  const handleLogin = () => {
    setLoggedIn(true);
    setError(null);
  };

  // Handle logout: encerra a sessão do Supabase e volta para o login
  const handleLogout = async () => {
    await supabase.auth.signOut();
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      // Ignore errors
    }
    setLoggedIn(false);
    setUsername("");
    setError(null);
  };

  const send = () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { from: "user", text: input }]);
    setInput("");
  };

  // If NOT logged in, render ONLY the login screen (no 3D, no chat, no panels)
  if (!loggedIn) {
    return (<LoginScreen isLoggedIn={false} onLogin={handleLogin} onLogout={handleLogout} error={error} username={username} />);
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        background: "#87ceeb",
      }}
    >
      {/* Header with "Sair" button */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          zIndex: 1000,
          pointerEvents: "auto",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: "bold",
            color: "#1a1a2e",
          }}
        >
          Lia
        </h1>
        <button
          style={{
            marginLeft: 16,
            float: "right",
            background: "transparent",
            border: "none",
            color: "#e94560",
            fontSize: 14,
            cursor: "pointer",
            pointerEvents: "auto",
          }}
          onClick={handleLogout}
        >
          Sair
        </button>
      </div>

      {/* Painel Vida - lado esquerdo, sem cobrir a cena 3D */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 16,
          width: 260,
          zIndex: 5,
          pointerEvents: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 12,
          background: "rgba(255,255,255,0.85)",
          borderRadius: 8,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, color: "#1a1a2e" }}>Vida da Lia</h2>
        <div style={{ fontSize: 13, color: "#333" }}>
          <div>Hora: {hour.toString().padStart(2, "0")}:00 {hour >= 6 && hour < 18 ? "☀️ Dia" : "🌙 Noite"}</div>
          <div style={{ marginTop: 4 }}>Fome: {Math.round(life.fome)}</div>
          <div>Energia: {Math.round(life.energia)}</div>
          <div>Humor: {Math.round(life.humor)}</div>
          <div>Social: {Math.round(life.sociability)}</div>
          <div>Saúde: {Math.round(life.saude)}</div>
          <div>XP: {life.xp} (Capítulo {life.chapter})</div>
          {lastAction && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#555", fontStyle: "italic" }}>
              {lastAction}
            </div>
          )}
        </div>
      </div>

      {/* 3D World - Pet3D */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
        <Pet3D onPetPositionChange={onPetPositionChangeRef.current} life={life} pesquisando={pesquisando} temaPesquisa={temaPesquisa} />
      </div>

      {/* Chat panel - faixa só embaixo, sem cobrir a cena 3D */}
      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 16,
          zIndex: 10,
          pointerEvents: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 12,
          background: "rgba(255,255,255,0.85)",
          borderRadius: 8,
        }}
      >
        <div style={{ pointerEvents: "auto", maxHeight: 180, overflowY: "auto", marginBottom: 8 }}>
          {messages.map((msg, i) => (
            <p key={i} style={{ fontSize: 14, margin: "0 0 4px 0" }}>
              <b>{msg.from}: </b>{msg.text}
            </p>
          ))}
        </div>

        {/* Chat input */}
        <div
          style={{
            display: "flex",
            gap: 8,
            pointerEvents: "auto",
          }}
        >
          <input
            style={{
              flex: 1,
              border: "1px solid #ccc",
              borderRadius: 4,
              padding: "6px 8px",
              fontSize: 14,
            }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="Fala com a Lia..."
            autoFocus
          />
          <button
            style={{
              background: "#7c3aed",
              color: "white",
              border: "none",
              borderRadius: 4,
              padding: "6px 12px",
              fontSize: 14,
            }}
            onClick={send}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
