import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FilaDeTemas, TEMAS_RESERVA, JANELA_TEMAS_RECENTES } from "./pesquisa-ciclo";

describe("FilaDeTemas", () => {
  beforeEach(() => {
    // Sem internet: o sorteio falha e a fila usa os temas de reserva
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("não devolve o mesmo tema duas vezes seguidas", async () => {
    const fila = new FilaDeTemas(() => []);
    const primeiro = await fila.proximo();
    fila.registrar(primeiro);
    const segundo = await fila.proximo();
    expect(segundo).not.toBe(primeiro);
  });

  it("pula temas da janela dos últimos 20 (sessão e histórico salvo)", async () => {
    const historico = TEMAS_RESERVA.slice(0, 15);
    const fila = new FilaDeTemas(() => historico);
    const tema = await fila.proximo();
    expect(historico.map((t) => t.toLowerCase())).not.toContain(tema.toLowerCase());
  });

  it("nunca repete nos últimos 20 temas registrados na sessão", async () => {
    const fila = new FilaDeTemas(() => []);
    const vistos: string[] = [];
    for (let i = 0; i < 25; i++) {
      const t = await fila.proximo();
      fila.registrar(t);
      const ultimos = vistos.slice(-JANELA_TEMAS_RECENTES);
      expect(ultimos.map((x) => x.toLowerCase())).not.toContain(t.toLowerCase());
      vistos.push(t);
    }
  });
});
