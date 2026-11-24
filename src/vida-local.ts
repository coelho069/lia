// Cache local da vida, separado por conta (chave com o user_id).
// Só guarda o que não existe na tabela `vida`; fome, energia, XP etc. vêm sempre do banco.
// A chave antiga "matrix-life-state" (sem conta) não é lida nem apagada aqui.
import type { LifeState } from "./life";

const CHAVE_EXTRAS = (uid: string) => "lia-vida-extras:" + uid;
const CHAVE_MINUTOS = (uid: string) => "lia-minutos-jogo:" + uid;

export const MINUTOS_INICIAIS = 8 * 60; // 08:00
const MINUTOS_DO_DIA = 24 * 60;

type ExtrasVida = Pick<LifeState, "acaoAtual" | "memoriaCurta" | "ultimaAcaoEm">;

/** Campos que só existem no navegador, se forem desta conta e válidos. */
export function lerExtrasVida(uid: string): Partial<ExtrasVida> {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_EXTRAS(uid)) ?? "null");
    if (!v || typeof v !== "object") return {};
    const extras: Partial<ExtrasVida> = {};
    if (v.acaoAtual === null || typeof v.acaoAtual === "string") extras.acaoAtual = v.acaoAtual;
    if (Number.isFinite(v.ultimaAcaoEm)) extras.ultimaAcaoEm = v.ultimaAcaoEm;
    if (Array.isArray(v.memoriaCurta) && v.memoriaCurta.every((m: unknown) => typeof m === "string")) {
      extras.memoriaCurta = v.memoriaCurta;
    }
    return extras;
  } catch {
    return {};
  }
}

export function gravarExtrasVida(uid: string, vida: LifeState): void {
  try {
    const extras: ExtrasVida = { acaoAtual: vida.acaoAtual, memoriaCurta: vida.memoriaCurta, ultimaAcaoEm: vida.ultimaAcaoEm };
    localStorage.setItem(CHAVE_EXTRAS(uid), JSON.stringify(extras));
  } catch {
    // localStorage cheio ou bloqueado: segue sem cache
  }
}

/** Hora do jogo desta conta (minutos desde 00:00). Ausente ou inválida = 08:00. */
export function lerMinutosJogo(uid: string): number {
  try {
    const bruto = localStorage.getItem(CHAVE_MINUTOS(uid));
    if (bruto === null || !/^\d+$/.test(bruto)) return MINUTOS_INICIAIS;
    const n = Number(bruto);
    return n < MINUTOS_DO_DIA ? n : MINUTOS_INICIAIS;
  } catch {
    return MINUTOS_INICIAIS;
  }
}

export function gravarMinutosJogo(uid: string, minutos: number): void {
  try {
    localStorage.setItem(CHAVE_MINUTOS(uid), String(minutos));
  } catch {
    // localStorage cheio ou bloqueado: a hora volta a 08:00 no próximo F5
  }
}
