import { generateId } from './storage';

export interface DrawingEntry {
  id: string;
  title: string;
  description: string;
  svgContent: string; // SVG path data or full SVG
  topic: string;
  createdAt: number;
}

// Simple SVG generators for research topics
export const generateSvg = (topic: string, title: string): DrawingEntry => {
  let svgContent = '';
  let description = '';

  switch (topic.toLowerCase()) {
    case 'vagalume':
    case 'por que os vagalumes brilham':
      svgContent = `
        <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <circle cx="100" cy="100" r="8" fill="#ffd700" />
          <circle cx="60" cy="60" r="6" fill="#ffd700" />
          <circle cx="140" cy="60" r="6" fill="#ffd700" />
          <circle cx="40" cy="100" r="5" fill="#ffd700" />
          <circle cx="160" cy="100" r="5" fill="#ffd700" />
          <circle cx="20" cy="140" r="4" fill="#ffd700" />
          <circle cx="180" cy="140" r="4" fill="#ffd700" />
          <circle cx="100" cy="160" r="7" fill="#ffd700" />
          <path d="M100,20 L100,180 M20,100,180,100" stroke="#ffd700" stroke-width="1" fill="none" />
          <text x="100" y="190" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#ffd700">Vagalume</text>
        </svg>
      `;
      description = 'O vaga-lume brilha com linhas delicadas de luz em seu corpo segmentado, mostrando o padrão de bioluminescência natural.';
      break;

    case 'formiga':
    case 'como formigas constroem ninhos':
      svgContent = `
        <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <rect x="50" y="50" width="100" height="100" fill="#8b4513" rx="5" ry="5" />
          <circle cx="80" cy="80" r="8" fill="#228b22" />
          <circle cx="120" cy="80" r="8" fill="#228b22" />
          <circle cx="80" cy="120" r="6" fill="#228b22" />
          <circle cx="120" cy="120" r="6" fill="#228b22" />
          <line x1="80" y1="50" x2="80" y2="80" stroke="#228b22" stroke-width="2" />
          <line x1="120" y1="50" x2="120" y2="80" stroke="#228b22" stroke-width="2" />
          <line x1="80" y1="150" x2="80" y2="120" stroke="#228b22" stroke-width="2" />
          <line x1="120" y1="150" x2="120" y2="120" stroke="#228b22" stroke-width="2" />
          <text x="100" y="185" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#228b22">Ninho</text>
        </svg>
      `;
      description = 'Formigas trabalhando juntas para construir estruturas subterrâneas complexas com câmaras específicas para diferentes funções.';
      break;

    case 'céu azul':
    case 'por que o céu é azul':
      svgContent = `
        <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="200" fill="#87ceeb" />
          <circle cx="100" cy="80" r="30" fill="rgba(255,255,255,0.3)" />
          <circle cx="60" cy="50" r="15" fill="rgba(255,255,255,0.2)" />
          <circle cx="140" cy="50" r="15" fill="rgba(255,255,255,0.2)" />
          <circle cx="80" cy="120" r="12" fill="rgba(255,255,255,0.2)" />
          <circle cx="120" cy="120" r="12" fill="rgba(255,255,255,0.2)" />
          <text x="100" y="190" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#000">Céu</text>
        </svg>
      `;
      description = 'O céu azul claro com nuvens brancas leves, mostrando a dispersão da luz solar na atmosfera.';
      break;

    default:
      svgContent = `
        <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="200" fill="#f0f4f8" />
          <circle cx="100" cy="100" r="50" fill="#ffd700" opacity="0.3" />
          <text x="100" y="190" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#6c5ce7">Desenho</text>
        </svg>
      `;
      description = 'Desenho simples sobre o tópico pesquisado.';
  }

  return {
    id: generateId(),
    title,
    description,
    svgContent,
    topic,
    createdAt: Date.now(),
  };
};