// @ts-nocheck
export function generateId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignored
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

export interface LifeState {
  id: string;
  fome: number;
  energia: number;
  humor: number;
  sociability: number;
  saude: number;
  xp: number;
  chapter: number;
  acaoAtual: string | null;
  ultimaAcaoEm: number;
  memoriaCurta: string[];
}

export function createInitialLife(): LifeState {
  return {
    id: generateId(),
    fome: 70,
    energia: 80,
    humor: 70,
    sociability: 60,
    saude: 100,
    xp: 0,
    chapter: 1,
    acaoAtual: null,
    ultimaAcaoEm: Date.now(),
    memoriaCurta: ["Acorei na clareira, pronta para viver o dia."],
  };
}

export function loadLife(): LifeState {
  if (typeof window === "undefined") return createInitialLife();
  try {
    const stored = localStorage.getItem("matrix-life-state");
    if (stored === null) return createInitialLife();
    return JSON.parse(stored);
  } catch {
    return createInitialLife();
  }
}

export function saveLife(state: LifeState): void {
  localStorage.setItem("matrix-life-state", JSON.stringify(state));
}

export function tickLife(state: LifeState): LifeState {
  const newState: LifeState = {
    ...state,
    fome: Math.max(0, state.fome - 0.4),
    energia: Math.max(0, state.energia - 0.3),
    humor: Math.max(0, state.humor - 0.15),
    sociability: Math.max(0, state.sociability - 0.2),
  };

  if (state.fome === 0 || state.energia === 0) {
    newState.saude = Math.max(0, state.saude - 2);
  }

  if (state.fome > 50 && state.energia > 50) {
    newState.saude = Math.min(100, state.saude + 0.5);
  }

  const newChapter = Math.floor(state.xp / 100) + 1;
  return {
    ...newState,
    chapter: newChapter,
  };
}

export function decideNextAction(state: LifeState): { action: string; actionText: string } {
  if (state.energia < 25) {
    return { action: "dormir", actionText: "Estava sem energia, então dormi." };
  }
  if (state.fome < 30) {
    return { action: "comer", actionText: "Estava com fome, então comi." };
  }
  if (state.humor < 30) {
    return { action: "brincar", actionText: "Fui brincar para melhorar o humor." };
  }
  if (state.sociability < 30) {
    return { action: "conversar", actionText: "Fui conversar para nao me sentir sozinha." };
  }
  if (state.energia < 50 && state.fome > 50) {
    return { action: "descansar", actionText: "Parei um pouco para descansar." };
  }

  if (Math.random() < 0.3) {
    return { action: "pesquisar", actionText: "Fui ao computador pesquisar um tema novo." };
  }
  return { action: "explorar", actionText: "Fui explorar a clareira." };
}


export function statusText(state: any): string {
  return "OK";
}