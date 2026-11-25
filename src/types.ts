export interface PersonaData {
  id: string;
  name: string;
  appearance: {
    hairColor: string;
    skinColor: string;
    clothesColor: string;
  };
  chapter: number;
  xp: number;
  chapterXp: number;
  needs: {
    hunger: number;
    energy: number;
    fun: number;
  };
  traits: {
    curiosity: number;
    caution: number;
    sociability: number;
    playfulness: number;
    independence: number;
  };
  mood: 'happy' | 'neutral' | 'sad';
}

export interface Memory {
  id: string;
  text: string;
  createdAt: number;
}

export interface ResearchTopic {
  id: string;
  topic: string;
  summary: string;
  sources: string[]; // literal URLs
  createdAt: number;
  site?: string; // nome do site de onde veio (ex.: "G1"); vazio em pesquisas antigas
}

export interface DrawingEntry {
  id: string;
  title: string;
  description: string;
  svgContent: string; // SVG path data or full SVG
  topic: string;
  createdAt: number;
}

export interface DiaryEntry {
  id: string;
  chapter: number;
  part: number;
  date: string;
  learned: string;
  drawn: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'person';
  text: string;
  createdAt: number;
}

export type { PersonaData, Memory };