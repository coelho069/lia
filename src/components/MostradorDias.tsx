import { useEffect, useState } from "react";
import { ultimaDataDeNascimento } from "../supabase-persistence";

const MS_DIA = 86_400_000;
const LIMITE_LEITURA_MS = 10_000; // leitura sem resposta conta como erro
const ESPERAS_MS = [3_000, 6_000, 12_000, 24_000, 30_000, 30_000]; // espera antes de cada nova tentativa

/** Dia 1 = dia da criação. Diferença de calendário no fuso local (Date.UTC evita erro de horário de verão). */
function diaDaLia(nasceuEm: Date, agora: Date): number {
  const inicio = Date.UTC(nasceuEm.getFullYear(), nasceuEm.getMonth(), nasceuEm.getDate());
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const diferenca = Math.round((hoje - inicio) / MS_DIA);
  return Math.max(1, Math.floor(diferenca) + 1);
}

export function MostradorDias() {
  // undefined = ainda não lido (carregando ou erro); null = o banco confirmou que não há data
  const [nasceuEm, setNasceuEm] = useState<Date | null | undefined>(undefined);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tentar = (n: number) => {
      let encerrada = false; // cada tentativa termina uma vez só: resposta, erro ou tempo esgotado
      const falhou = () => {
        if (cancelado || encerrada) return;
        encerrada = true;
        clearTimeout(timer);
        if (n < ESPERAS_MS.length) timer = setTimeout(() => tentar(n + 1), ESPERAS_MS[n]);
      };
      timer = setTimeout(falhou, LIMITE_LEITURA_MS);
      ultimaDataDeNascimento()
        .then((d) => {
          if (cancelado || encerrada) return;
          encerrada = true;
          clearTimeout(timer);
          setNasceuEm(d);
        })
        .catch(falhou);
    };
    tentar(0);
    return () => { cancelado = true; clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  let rotulo: string;
  if (nasceuEm === undefined) {
    rotulo = "Dia —";
  } else if (nasceuEm === null) {
    rotulo = "Sem data";
  } else {
    rotulo = `Dia ${diaDaLia(nasceuEm, agora)}`;
  }

  return (
    <div
      style={{
        pointerEvents: "none",
        padding: "4px 10px",
        background: "#f4efe3",
        color: "#1a1a2e",
        borderRadius: 6,
        boxShadow: "0 1px 6px rgba(0,0,0,0.18)",
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        whiteSpace: "nowrap",
        lineHeight: 1.4,
      }}
    >
      <span style={{ fontWeight: "bold", color: nasceuEm ? "#7c3aed" : "#1a1a2e" }}>{rotulo}</span>
      {" — "}
      {hora}
    </div>
  );
}
