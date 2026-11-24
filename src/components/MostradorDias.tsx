import { useEffect, useState } from "react";
import { ultimaDataDeNascimento } from "../supabase-persistence";

const MS_DIA = 86_400_000;

/** Dia 1 = dia da criação. Diferença de calendário no fuso local (Date.UTC evita erro de horário de verão). */
function diaDaLia(nasceuEm: Date, agora: Date): number {
  const inicio = Date.UTC(nasceuEm.getFullYear(), nasceuEm.getMonth(), nasceuEm.getDate());
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const diferenca = Math.round((hoje - inicio) / MS_DIA);
  return Math.max(1, Math.floor(diferenca) + 1);
}

export function MostradorDias() {
  // undefined = ainda carregando; null = sem data registrada
  const [nasceuEm, setNasceuEm] = useState<Date | null | undefined>(undefined);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    let cancelado = false;
    ultimaDataDeNascimento()
      .then((d) => { if (!cancelado) setNasceuEm(d); })
      .catch(() => { if (!cancelado) setNasceuEm(null); });
    return () => { cancelado = true; };
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
