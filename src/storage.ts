import type {
  PetData,
  Memory,
  ResearchTopic,
  DrawingEntry,
  DiaryEntry,
  ChatMessage,
} from './types';

const STORAGE_KEYS = {
  pet: 'pingo-pet-data',
  memories: 'pingo-memories',
  research: 'pingo-research',
  drawings: 'pingo-drawings',
  diary: 'pingo-diary',
  chats: 'pingo-chats',
} as const;

// Generate unique ID (works in secure and non-secure contexts)
function generateId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return generateId();
    }
  } catch {
    // ignored
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

// Initialize default pet data
const defaultPet: PetData = {
  id: generateId(),
  name: 'Pingo',
  species: 'brown bear cub',
  chapter: 1,
  xp: 0,
  chapterXp: 100,
  needs: {
    hunger: 50,
    energy: 50,
    fun: 50,
  },
  traits: {
    curiosity: 50,
    caution: 50,
    sociability: 50,
    playfulness: 50,
    independence: 50,
  },
  mood: 'neutral',
  chapterProgress: 1,
};

// ... (rest of the storage file remains the same)

// Load from localStorage or use default
function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const serialized = localStorage.getItem(key);
    if (serialized === null) return defaultValue;
    return JSON.parse(serialized) as T;
  } catch {
    return defaultValue;
  }
}

// Save to localStorage
function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);
  } catch (error) {
    console.error(`Failed to save to ${key}:`, error);
  }
}

// Pet
export const usePetStorage = () => {
  const loadPet = (): PetData => loadFromStorage<PetData>(STORAGE_KEYS.pet, defaultPet);
  const savePet = (pet: PetData) => saveToStorage(STORAGE_KEYS.pet, pet);
  return { loadPet, savePet };
};

// Memories
export const useMemoriesStorage = () => {
  const loadMemories = (): Memory[] => {
    return loadFromStorage<Memory[]>(STORAGE_KEYS.memories, []);
  };
  const saveMemories = (memories: Memory[]) => saveToStorage(STORAGE_KEYS.memories, memories);
  const addMemory = (text: string): Memory => {
    const memories = loadMemories();
    const newMemory: Memory = {
      id: generateId(),
      text,
      createdAt: Date.now(),
    };
    saveMemories([...memories, newMemory]);
    return newMemory;
  };
  const deleteMemory = (id: string) => {
    const memories = loadMemories().filter((m) => m.id !== id);
    saveMemories(memories);
  };
  return { loadMemories, saveMemories, addMemory, deleteMemory };
};

// Research
export const useResearchStorage = () => {
  const loadResearch = (): ResearchTopic[] => {
    return loadFromStorage<ResearchTopic[]>(STORAGE_KEYS.research, []);
  };
  const saveResearch = (research: ResearchTopic[]) => saveToStorage(STORAGE_KEYS.research, research);
  const addResearch = (topic: ResearchTopic) => {
    const research = loadResearch();
    saveResearch([...research, topic]);
  };
  const deleteResearch = (id: string) => {
    const research = loadResearch().filter((r) => r.id !== id);
    saveResearch(research);
  };
  return { loadResearch, saveResearch, addResearch, deleteResearch };
};

// Drawings
export const useDrawingsStorage = () => {
  const loadDrawings = (): DrawingEntry[] => {
    return loadFromStorage<DrawingEntry[]>(STORAGE_KEYS.drawings, []);
  };
  const saveDrawings = (drawings: DrawingEntry[]) => saveToStorage(STORAGE_KEYS.drawings, drawings);
  const addDrawing = (drawing: DrawingEntry) => {
    const drawings = loadDrawings();
    saveDrawings([...drawings, drawing]);
  };
  const deleteDrawing = (id: string) => {
    const drawings = loadDrawings().filter((d) => d.id !== id);
    saveDrawings(drawings);
  };
  return { loadDrawings, saveDrawings, addDrawing, deleteDrawing };
};

// Diary
export const useDiaryStorage = () => {
  const loadDiary = (): DiaryEntry[] => {
    return loadFromStorage<DiaryEntry[]>(STORAGE_KEYS.diary, []);
  };
  const saveDiary = (diary: DiaryEntry[]) => saveToStorage(STORAGE_KEYS.diary, diary);
  const addDiaryEntry = (entry: DiaryEntry) => {
    const diary = loadDiary();
    saveDiary([...diary, entry]);
  };
  return { loadDiary, saveDiary, addDiaryEntry };
};

// Chats
export const useChatsStorage = () => {
  const loadChats = (): ChatMessage[] => {
    return loadFromStorage<ChatMessage[]>(STORAGE_KEYS.chats, []);
  };
  const saveChats = (chats: ChatMessage[]) => saveToStorage(STORAGE_KEYS.chats, chats);
  const addChat = (message: ChatMessage) => {
    const chats = loadChats();
    saveChats([...chats, message]);
  };
  const deleteChat = (id: string) => {
    const chats = loadChats().filter((c) => c.id !== id);
    saveChats(chats);
  };
  return { loadChats, saveChats, addChat, deleteChat };
};
// Utility function for ID generation in non-secure contexts (plain HTTP)
export { generateId };
