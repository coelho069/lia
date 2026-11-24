import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import type { EstadoServidor } from "../supabase-persistence";
import type { ResearchTopic } from "../types";

type Destino = { nome: string; x: number; z: number };

// Lugar da cadeira em frente ao computador (a Lia senta aqui e digita)
const CADEIRA: Destino = { nome: "cadeira", x: 2, z: -1.5 };
const VELOCIDADE = 1.6; // unidades por segundo

type Fase = "caminhando" | "sentando" | "digitando" | "levantando" | "olhando";

const angDiff = (de: number, para: number) =>
  Math.atan2(Math.sin(para - de), Math.cos(para - de));

// Gerador pseudo-aleatório com semente: o cenário sai igual em todo carregamento
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Grama: ruído verde com manchas mais escuras e mais claras
function texturaGrama(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4e9a3a";
  g.fillRect(0, 0, 256, 256);
  const r = rng(7);
  for (let i = 0; i < 2600; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? "#3f8a2e" : v < 0.85 ? "#62ad48" : "#7cc35a";
    g.fillRect(r() * 256, r() * 256, 2 + r() * 3, 2 + r() * 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(16, 16);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Placa de madeira com o nome "Lia"
function texturaPlaca(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 192;
  const g = c.getContext("2d")!;
  g.fillStyle = "#a0683a";
  g.fillRect(0, 0, 512, 192);
  for (let y = 0; y < 192; y += 16) {
    g.fillStyle = y % 32 === 0 ? "#8e5a30" : "#b07645";
    g.fillRect(0, y, 512, 8);
  }
  g.strokeStyle = "#5a3418";
  g.lineWidth = 10;
  g.strokeRect(8, 8, 496, 176);
  g.fillStyle = "#fff6e0";
  g.font = "bold 110px serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("Lia", 256, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Brilho suave para os vaga-lumes
function texturaBrilho(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,240,150,1)");
  grad.addColorStop(0.3, "rgba(255,210,60,0.6)");
  grad.addColorStop(1, "rgba(255,200,40,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Céu em degradê: azul no topo, mais claro perto do horizonte
function ceuDegrade(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(80, 32, 16);
  const topo = new THREE.Color(0x2f6fc4);
  const horizonte = new THREE.Color(0xbfe0f5);
  const cores: number[] = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / 80 + 0.1));
    const c = horizonte.clone().lerp(topo, t);
    cores.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cores, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
  return new THREE.Mesh(geo, mat);
}

// Árvore: tronco afinado e copa com três camadas de volume
function criarArvore(
  cor: number,
  tamanho: number,
  r: () => number,
): { grupo: THREE.Group; copa: THREE.Group } {
  const grupo = new THREE.Group();
  const troncoMat = new THREE.MeshStandardMaterial({ color: 0x5c3d22, roughness: 0.9 });
  const tronco = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1 * tamanho, 0.18 * tamanho, 1.3 * tamanho, 8),
    troncoMat,
  );
  tronco.position.y = 0.65 * tamanho;
  tronco.castShadow = true;
  grupo.add(tronco);
  const copa = new THREE.Group();
  copa.position.y = 1.2 * tamanho;
  grupo.add(copa);
  const folhaMat = new THREE.MeshStandardMaterial({ color: cor, flatShading: true, roughness: 0.8 });
  const camadas = [
    { r: 0.95, y: 0.5 },
    { r: 0.75, y: 1.1 },
    { r: 0.5, y: 1.6 },
  ];
  camadas.forEach((c, i) => {
    const bola = new THREE.Mesh(new THREE.IcosahedronGeometry(c.r * tamanho, 1), folhaMat);
    bola.position.set((r() - 0.5) * 0.2 * tamanho, c.y * tamanho, (r() - 0.5) * 0.2 * tamanho);
    bola.scale.y = 0.85;
    bola.castShadow = true;
    copa.add(bola);
    if (i === 0) {
      const extra = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 * tamanho, 1), folhaMat);
      extra.position.set(0.5 * tamanho, 0.75 * tamanho, 0.2 * tamanho);
      copa.add(extra);
    }
  });
  return { grupo, copa };
}

// Arbusto: três bolas verdes agrupadas
function criarArbusto(cor: number, r: () => number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: cor, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32 + r() * 0.12, 1), mat);
    b.position.set((i - 1) * 0.3 + (r() - 0.5) * 0.1, 0.28 + (i === 1 ? 0.1 : 0), (r() - 0.5) * 0.15);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

// "agora", "há X min", "há X h" ou "sem pesquisas ainda" (quando não há data)
function tempoDesde(quando: number | undefined, agora: number): string {
  if (!quando) return "Sem pesquisas ainda";
  const min = Math.floor((agora - quando) / 60000);
  if (min < 1) return "Última pesquisa: agora";
  if (min < 60) return `Última pesquisa há ${min} min`;
  return `Última pesquisa há ${Math.floor(min / 60)} h`;
}

export function Pet3D({
  onPetPositionChange,
  life,
  pesquisando,
  temaPesquisa,
  statusPesquisa,
  onFasePesquisa,
  painel,
  onPainelClick,
  estadoServidor,
}: {
  onPetPositionChange?: (x: number, z: number) => void;
  // Quadro ao lado do computador: título da pesquisa atual e quantas anotações tem
  painel?: { titulo: string; total: number };
  // Clique no quadro (abre as anotações)
  onPainelClick?: () => void;
  // Avisa a fase física da Lia: "indo-computador" | "sentando" | "digitando" | "levantando" | "passeando"
  onFasePesquisa?: (fase: string) => void;
  life?: {
    fome?: number;
    energia?: number;
    humor?: number;
    sociability?: number;
    acaoAtual?: string | null;
  };
  pesquisando?: boolean;
  temaPesquisa?: string;
  statusPesquisa?: string;
  // Estado gravado pelo servidor (ao abrir a aba) + última pesquisa salva: mostrado num painel pequeno
  estadoServidor?: (EstadoServidor & { ultimaPesquisa: ResearchTopic | null }) | null;
}) {
  // Relógio do painel do servidor: atualiza o "há X min" a cada 5 s
  const [agoraPainel, setAgoraPainel] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgoraPainel(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onPetPositionChange);
  cbRef.current = onPetPositionChange;
  const lifeRef = useRef(life);
  lifeRef.current = life;
  const pesquisandoRef = useRef(pesquisando);
  pesquisandoRef.current = pesquisando;
  const temaPesquisaRef = useRef(temaPesquisa);
  temaPesquisaRef.current = temaPesquisa;
  const statusRef = useRef(statusPesquisa);
  statusRef.current = statusPesquisa;
  const faseCbRef = useRef(onFasePesquisa);
  faseCbRef.current = onFasePesquisa;
  // Quadro de anotações: lido pela cena e redesenhado quando o título ou o total mudar
  const painelRef = useRef(painel);
  painelRef.current = painel;
  const painelClickRef = useRef(onPainelClick);
  painelClickRef.current = onPainelClick;
  const desenharPainelRef = useRef<(() => void) | null>(null);
  // Câmera: "seguir" (orbita a Lia) ou "livre" (fica onde o usuário deixou)
  const [modoLivre, setModoLivre] = useState(false);
  const modoLivreRef = useRef(false);
  const definirModo = (livre: boolean) => {
    modoLivreRef.current = livre;
    setModoLivre(livre);
  };
  const definirModoRef = useRef(definirModo);
  definirModoRef.current = definirModo;
  useEffect(() => {
    desenharPainelRef.current?.();
  }, [painel?.titulo, painel?.total]);

  useEffect(() => {
    const container = ref.current;
    if (container === null) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 2.5, 6);
    camera.lookAt(0, 1, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    // Limita a resolução em telas de alta densidade (1.5 no máximo): o ganho de fluidez é grande
    renderer.setPixelRatio(1); // 1x: menos pixels para a GPU (antes 1.5, ~2,25x mais pixels em telas de alta densidade)
    renderer.shadowMap.enabled = false; // simplificação: sem sombras (pesavam na cena)
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    // Céu, neblina na cor do horizonte e luz de fim de tarde (quente, sem branco chapado)
    scene.add(ceuDegrade());
    scene.fog = new THREE.Fog(0xbfe0f5, 18, 42);
    scene.add(new THREE.HemisphereLight(0xbfe4ff, 0x4a7a2e, 0.75));
    const sol = new THREE.DirectionalLight(0xffc98a, 1.25);
    sol.position.set(6, 9, 5);
    scene.add(sol);

    const r = rng(42);
    const dummy = new THREE.Object3D();
    const corTmp = new THREE.Color();

    // ---------------- Chão: grama com textura ----------------
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ map: texturaGrama(), roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Lâminas de grama que balançam devagar (instanciadas)
    const N_GRAMA = 350;
    const laminaGeo = new THREE.ConeGeometry(0.03, 0.42, 3);
    laminaGeo.translate(0, 0.21, 0);
    const grama = new THREE.InstancedMesh(
      laminaGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      N_GRAMA,
    );
    const gramaBase: { x: number; z: number; s: number; rot: number }[] = [];
    for (let i = 0; i < N_GRAMA; i++) {
      gramaBase.push({
        x: (r() - 0.5) * 30,
        z: (r() - 0.5) * 30,
        s: 0.7 + r() * 0.8,
        rot: r() * Math.PI * 2,
      });
      corTmp.setHSL(0.22 + r() * 0.05, 0.5 + r() * 0.2, 0.3 + r() * 0.15);
      grama.setColorAt(i, corTmp);
    }
    grama.instanceColor!.needsUpdate = true;
    scene.add(grama);

    // ---------------- Caminho de pedras (casa -> computador, centro -> lago, centro -> árvore) ----------------
    const pedraMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    const pedras: { x: number; z: number; s: number }[] = [];
    const linhaDePedras = (ax: number, az: number, bx: number, bz: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        pedras.push({ x: ax + (bx - ax) * t + (r() - 0.5) * 0.5, z: az + (bz - az) * t + (r() - 0.5) * 0.5, s: 0.13 + r() * 0.07 });
        pedras.push({ x: ax + (bx - ax) * t + (r() - 0.5) * 0.9, z: az + (bz - az) * t + (r() - 0.5) * 0.9, s: 0.1 + r() * 0.05 });
      }
    };
    linhaDePedras(-4, -4.1, 1.6, -2.4, 14);
    linhaDePedras(0, -1.2, 0, 5.2, 18);
    linhaDePedras(-2.2, 1.0, -4.6, -3.0, 8);
    const pedrasMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), pedraMat, pedras.length);
    pedras.forEach((p, i) => {
      dummy.position.set(p.x, 0.02, p.z);
      dummy.scale.set(p.s * 1.4, p.s * 0.45, p.s);
      dummy.rotation.set(0, r() * Math.PI, 0);
      dummy.updateMatrix();
      pedrasMesh.setMatrixAt(i, dummy.matrix);
      corTmp.setHSL(0.08 + r() * 0.03, 0.08, 0.5 + r() * 0.2);
      pedrasMesh.setColorAt(i, corTmp);
    });
    pedrasMesh.instanceColor!.needsUpdate = true;
    pedrasMesh.receiveShadow = true;
    scene.add(pedrasMesh);

    // Lago pequeno ao fundo, com pedras na borda
    const agua = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 40),
      new THREE.MeshStandardMaterial({ color: 0x2b8fd6, roughness: 0.15, metalness: 0.3 }),
    );
    agua.rotation.x = -Math.PI / 2;
    agua.position.set(0, 0.03, 8.6);
    scene.add(agua);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), pedraMat);
      b.position.set(Math.cos(a) * 1.75, 0.08, 8.6 + Math.sin(a) * 1.75);
      b.scale.y = 0.6;
      b.castShadow = true;
      scene.add(b);
    }

    // ---------------- Computador: mesa, monitor, teclado, cadeira e cabos ----------------
    const compGroup = new THREE.Group();
    compGroup.position.set(2, 0, -2);

    const madeira = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.7 });
    const madeiraEscura = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.7 });
    const mesa = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.07, 0.7), madeira);
    mesa.position.y = 0.7;
    mesa.castShadow = true;
    mesa.receiveShadow = true;
    compGroup.add(mesa);
    [
      [-0.55, -0.28],
      [0.55, -0.28],
      [-0.55, 0.28],
      [0.55, 0.28],
    ].forEach(([x, z]) => {
      const pe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), madeiraEscura);
      pe.position.set(x, 0.35, z);
      pe.castShadow = true;
      compGroup.add(pe);
    });

    // Borda da frente do tampo e travessa entre as pernas de trás
    const bordaTampo = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.075, 0.03), madeiraEscura);
    bordaTampo.position.set(0, 0.7, 0.335);
    compGroup.add(bordaTampo);
    const travessa = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.04), madeiraEscura);
    travessa.position.set(0, 0.3, -0.28);
    compGroup.add(travessa);
    // Gaveteiro sob o tampo, do lado direito, sem cruzar a cadeira
    const gaveteiro = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.52, 0.55), madeira);
    gaveteiro.position.set(0.42, 0.42, -0.07);
    compGroup.add(gaveteiro);
    const puxador = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.012), madeiraEscura);
    puxador.position.set(0.42, 0.5, 0.21);
    compGroup.add(puxador);

    // Monitor: moldura, suporte e tela acesa
    const monMat = new THREE.MeshStandardMaterial({ color: 0x1e1e26, roughness: 0.4 });
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.5, 0.05), monMat);
    monitor.position.set(0, 1.2, -0.3);
    monitor.castShadow = true;
    compGroup.add(monitor);
    const suporte = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.06), monMat);
    suporte.position.set(0, 0.92, -0.3);
    compGroup.add(suporte);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 16), monMat);
    pedestal.position.set(0, 0.73, -0.28);
    compGroup.add(pedestal);

    // Tela do monitor: tema e status da pesquisa (canvas texture)
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const telaTexture = new THREE.CanvasTexture(canvas);
    telaTexture.colorSpace = THREE.SRGBColorSpace;
    const tela = new THREE.Mesh(
      new THREE.PlaneGeometry(0.76, 0.44),
      new THREE.MeshBasicMaterial({ map: telaTexture }),
    );
    // Virada para a cadeira (+z). A face da moldura fica em z = -0.275.
    tela.position.set(0, 1.2, -0.272);
    compGroup.add(tela);
    // LED pequeno embaixo da moldura
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.008, 0.01),
      new THREE.MeshBasicMaterial({ color: 0x4dff88 }),
    );
    led.position.set(0, 0.97, -0.272);
    compGroup.add(led);

    const quebrarTexto = (texto: string, ctx: CanvasRenderingContext2D, maxWidth: number): string[] => {
      const palavras = texto.split(" ");
      const linhas: string[] = [];
      let linhaAtual = "";
      for (const palavra of palavras) {
        const teste = linhaAtual ? linhaAtual + " " + palavra : palavra;
        if (ctx.measureText(teste).width > maxWidth) {
          if (linhaAtual) linhas.push(linhaAtual);
          linhaAtual = palavra;
        } else {
          linhaAtual = teste;
        }
      }
      if (linhaAtual) linhas.push(linhaAtual);
      return linhas;
    };

    function desenharTela(texto: string, status: string) {
      const c = canvas;
      const cx = c.getContext("2d")!;
      cx.fillStyle = "#06140a";
      cx.fillRect(0, 0, c.width, c.height);
      cx.strokeStyle = "#1f6b3a";
      cx.lineWidth = 3;
      cx.strokeRect(4, 4, c.width - 8, c.height - 8);
      cx.fillStyle = "#4dff88";
      cx.font = "bold 24px monospace";
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      cx.fillText("PESQUISA:", c.width / 2, c.height / 2 - 60);
      cx.font = "20px monospace";
      const linhas = quebrarTexto(texto, cx, c.width - 40);
      linhas.slice(0, 5).forEach((linha, i) => {
        cx.fillText(linha, c.width / 2, c.height / 2 - 20 + i * 28);
      });
      cx.font = "18px monospace";
      cx.fillStyle = "#b8ffd0";
      cx.fillText(status, c.width / 2, c.height / 2 + 100);
      telaTexture.needsUpdate = true;
    }

    let telaChave = "";
    const atualizarTela = () => {
      const chave = (temaPesquisaRef.current || "") + "|" + (statusRef.current || "");
      if (chave !== telaChave) {
        telaChave = chave;
        desenharTela(temaPesquisaRef.current || "", statusRef.current || "");
      }
    };
    atualizarTela();

    // Teclado com teclas, mouse e caneca
    const tecladoMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    const teclado = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.2), tecladoMat);
    teclado.position.set(0, 0.74, 0.05);
    compGroup.add(teclado);
    // Teclas: 5 fileiras de 12, num único objeto (InstancedMesh) para pesar pouco
    const teclaGeo = new THREE.BoxGeometry(0.036, 0.012, 0.03);
    const teclaMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44 });
    const teclas = new THREE.InstancedMesh(teclaGeo, teclaMat, 5 * 12);
    const mat4 = new THREE.Matrix4();
    let idx = 0;
    for (let linha = 0; linha < 5; linha++) {
      for (let col = 0; col < 12; col++) {
        mat4.makeTranslation(-0.26 + col * 0.0445, 0.757, -0.07 + linha * 0.034);
        teclas.setMatrixAt(idx++, mat4);
      }
    }
    compGroup.add(teclas);
    // LED azul na borda da frente do teclado
    const ledTeclado = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.006, 0.008),
      new THREE.MeshBasicMaterial({ color: 0x4da6ff }),
    );
    ledTeclado.position.set(0, 0.752, 0.148);
    compGroup.add(ledTeclado);
    // Mousepad e mouse
    const mousepad = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.006, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x2a2a36, roughness: 0.9 }),
    );
    mousepad.position.set(0.5, 0.704, 0.06);
    compGroup.add(mousepad);
    const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.11), tecladoMat);
    mouse.position.set(0.5, 0.725, 0.06);
    compGroup.add(mouse);
    const caneca = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.1, 12),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }),
    );
    caneca.position.set(-0.46, 0.8, -0.2);
    compGroup.add(caneca);

    // Cabos simples: do monitor até a mesa e do teclado até o gabinete
    const cabo = new THREE.MeshStandardMaterial({ color: 0x111111 });
    compGroup.add(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.74, -0.3), new THREE.Vector3(0.1, 0.66, -0.4),
        new THREE.Vector3(0.3, 0.68, -0.42), new THREE.Vector3(0.4, 0.6, -0.36),
      ]), 12, 0.012, 6),
      cabo,
    ));
    compGroup.add(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.3, 0.74, 0.05), new THREE.Vector3(0.45, 0.72, 0.0),
        new THREE.Vector3(0.6, 0.68, -0.2), new THREE.Vector3(0.7, 0.6, -0.28),
      ]), 12, 0.008, 6),
      cabo,
    ));
    // Gabinete ao lado da mesa
    const gabinete = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.45, 0.45), new THREE.MeshStandardMaterial({ color: 0x2a2a33 }));
    gabinete.position.set(0.85, 0.22, -0.2);
    gabinete.castShadow = true;
    compGroup.add(gabinete);

    // Cadeira: assento, encosto, coluna, base com rodízios e apoios de braço
    const cadeiraMat = new THREE.MeshStandardMaterial({ color: 0x2b2b35, roughness: 0.6 });
    const cadeira = new THREE.Group();
    const assento = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), cadeiraMat);
    assento.position.y = 0.45;
    assento.castShadow = true;
    cadeira.add(assento);
    const encosto = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.05), cadeiraMat);
    encosto.position.set(0, 0.74, -0.24);
    encosto.castShadow = true;
    cadeira.add(encosto);
    // Hastes do encosto, para dar a forma de cadeira de escritório
    [-0.2, 0.2].forEach((x) => {
      const haste = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.05), cadeiraMat);
      haste.position.set(x, 0.56, -0.24);
      cadeira.add(haste);
    });
    const coluna = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 8), cadeiraMat);
    coluna.position.y = 0.25;
    cadeira.add(coluna);
    const rodinha = new THREE.MeshStandardMaterial({ color: 0x0d0d0d });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const perna = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.26), cadeiraMat);
      perna.position.set(Math.sin(a) * 0.13, 0.04, Math.cos(a) * 0.13);
      perna.rotation.y = a;
      cadeira.add(perna);
      const roda = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), rodinha);
      roda.position.set(Math.sin(a) * 0.26, 0.03, Math.cos(a) * 0.26);
      cadeira.add(roda);
    }
    [-0.27, 0.27].forEach((x) => {
      const braco = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.3), cadeiraMat);
      braco.position.set(x, 0.6, 0);
      cadeira.add(braco);
    });
    cadeira.position.set(0, 0, 0.6);
    compGroup.add(cadeira);

    // ---------------- Quadro de anotações: ao lado do computador, clicável ----------------
    const painelCanvas = document.createElement("canvas");
    painelCanvas.width = 512;
    painelCanvas.height = 314;
    const painelCtx = painelCanvas.getContext("2d");
    const painelTex = new THREE.CanvasTexture(painelCanvas);
    const painelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.55),
      new THREE.MeshBasicMaterial({ map: painelTex }),
    );
    painelMesh.position.set(1.25, 1.5, -0.6);
    painelMesh.rotation.y = -0.5;
    compGroup.add(painelMesh);
    const moldura = new THREE.Mesh(
      new THREE.BoxGeometry(0.94, 0.59, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.6 }),
    );
    moldura.position.copy(painelMesh.position);
    moldura.rotation.copy(painelMesh.rotation);
    moldura.translateZ(-0.02);
    compGroup.add(moldura);

    const desenharPainel = () => {
      if (!painelCtx) return;
      const info = painelRef.current;
      const ctx = painelCtx;
      ctx.fillStyle = "#f4efe3";
      ctx.fillRect(0, 0, 512, 314);
      ctx.fillStyle = "#1a1a2e";
      ctx.font = "bold 30px sans-serif";
      ctx.fillText("Pesquisa atual", 24, 50);
      // Título: até duas linhas, cortando o que não couber
      ctx.font = "bold 36px sans-serif";
      const palavras = (info?.titulo || "Nenhuma pesquisa ainda").split(" ");
      const linhas: string[] = [];
      let atual = "";
      for (const p of palavras) {
        const teste = atual ? atual + " " + p : p;
        if (ctx.measureText(teste).width > 460 && atual) {
          linhas.push(atual);
          atual = p;
        } else {
          atual = teste;
        }
      }
      if (atual) linhas.push(atual);
      linhas.slice(0, 2).forEach((l, i) => ctx.fillText(l.length > 26 ? l.slice(0, 25) + "…" : l, 24, 120 + i * 46));
      ctx.font = "26px sans-serif";
      ctx.fillStyle = "#7c3aed";
      const total = info?.total ?? 0;
      ctx.fillText(total + (total === 1 ? " anotação" : " anotações"), 24, 250);
      ctx.fillStyle = "#666";
      ctx.font = "22px sans-serif";
      ctx.fillText("Toque para ver as anotações", 24, 290);
      painelTex.needsUpdate = true;
    };
    desenharPainelRef.current = desenharPainel;
    desenharPainel();

    scene.add(compGroup);

    // ---------------- Pessoa (Lia), com articulações ----------------
    // Raiz (person) -> corpo (tronco, cabeça, braços) e pernas com pivô no quadril.
    const person = new THREE.Group();
    scene.add(person);
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.6 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.5 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x7c5cff, roughness: 0.75 });
    const shirtEscuraMat = new THREE.MeshStandardMaterial({ color: 0x5a3fd0, roughness: 0.75 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2d2d4a, roughness: 0.8 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.5 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const irisMat = new THREE.MeshStandardMaterial({ color: 0x5a3a20 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a });
    const lipMat = new THREE.MeshStandardMaterial({ color: 0xc8606a, roughness: 0.5 });
    const cheekMat = new THREE.MeshStandardMaterial({ color: 0xf29b8b, transparent: true, opacity: 0.6 });

    const corpo = new THREE.Group();
    person.add(corpo);
    // Tronco com ombros mais largos (duas peças), gola, botões e cinto
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.5, 0.28), shirtMat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    corpo.add(torso);
    const peito = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.3), shirtMat);
    peito.position.y = 1.2;
    peito.castShadow = true;
    corpo.add(peito);
    const gola = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.04), shirtEscuraMat);
    gola.position.set(0, 1.29, 0.15);
    corpo.add(gola);
    const cinto = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.3), new THREE.MeshStandardMaterial({ color: 0x1e1e26 }));
    cinto.position.y = 0.66;
    corpo.add(cinto);
    const pescoco = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.16, 12), skinMat);
    pescoco.position.y = 1.36;
    corpo.add(pescoco);

    // Cabeça com pivô no pescoço (vira para os lados, inclina para o teclado)
    const cabeca = new THREE.Group();
    cabeca.position.set(0, 1.5, 0);
    corpo.add(cabeca);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 14), skinMat);
    head.scale.set(0.95, 1.05, 1);
    head.position.y = 0.12;
    head.castShadow = true;
    cabeca.add(head);

    // Cabelo: pivô no topo da cabeça, com franja, mechas e rabo que balança ao andar
    const cabelo = new THREE.Group();
    cabelo.position.set(0, 0.12, 0);
    cabeca.add(cabelo);
    const topoCabelo = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hairMat,
    );
    topoCabelo.scale.set(0.98, 1.02, 1.02);
    topoCabelo.position.y = 0.04;
    cabelo.add(topoCabelo);
    const franja = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.14), hairMat);
    franja.position.set(0, 0.2, 0.2);
    franja.rotation.x = -0.45;
    cabelo.add(franja);
    const mecha = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), hairMat);
    mecha.position.set(-0.26, -0.02, 0.1);
    cabelo.add(mecha);
    const mecha2 = mecha.clone();
    mecha2.position.x = 0.26;
    cabelo.add(mecha2);
    const rabo = new THREE.Group();
    rabo.position.set(0, 0.1, -0.22);
    cabelo.add(rabo);
    const raboMalha = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.42, 10), hairMat);
    raboMalha.position.y = -0.2;
    raboMalha.rotation.x = 0.25;
    rabo.add(raboMalha);
    const elastico = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.015, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0xff6fa5 }),
    );
    elastico.rotation.x = Math.PI / 2;
    rabo.add(elastico);

    // Rosto: olhos (esclera, íris, pupila e brilho), sobrancelhas, nariz, boca e bochechas
    const olhos: THREE.Group[] = [];
    [-0.1, 0.1].forEach((x) => {
      const olho = new THREE.Group();
      olho.position.set(x, 0.2, 0.24);
      const esclera = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), eyeMat);
      esclera.scale.set(1, 1, 0.5);
      olho.add(esclera);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), irisMat);
      iris.position.z = 0.025;
      olho.add(iris);
      const pupila = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), pupilMat);
      pupila.position.z = 0.04;
      olho.add(pupila);
      const brilho = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), eyeMat);
      brilho.position.set(0.012, 0.012, 0.05);
      olho.add(brilho);
      cabeca.add(olho);
      olhos.push(olho);
      const sobrancelha = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.03), hairMat);
      sobrancelha.position.set(x, 0.3, 0.25);
      sobrancelha.rotation.z = x < 0 ? -0.12 : 0.12;
      cabeca.add(sobrancelha);
      const bochecha = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), cheekMat);
      bochecha.position.set(x * 1.8, 0.02, 0.2);
      bochecha.scale.set(1, 0.6, 0.5);
      cabeca.add(bochecha);
    });
    const nariz = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), skinMat);
    nariz.position.set(0, 0.12, 0.28);
    nariz.scale.set(1, 1.1, 0.8);
    cabeca.add(nariz);
    const boca = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 6, 14, Math.PI), lipMat);
    boca.position.set(0, 0.0, 0.25);
    boca.rotation.z = Math.PI; // sorriso
    cabeca.add(boca);

    // Braços com pivô no ombro: manga, antebraço e mão
    const montarBraco = (lado: number) => {
      const ombro = new THREE.Group();
      ombro.position.set(lado * 0.34, 1.22, 0);
      corpo.add(ombro);
      ombro.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), shirtMat));
      const manga = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 0.24, 14), shirtMat);
      manga.position.y = -0.12;
      ombro.add(manga);
      const antebraco = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.3, 14), skinMat);
      antebraco.position.y = -0.38;
      ombro.add(antebraco);
      const mao = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), skinMat);
      mao.scale.set(0.9, 1.2, 0.7);
      mao.position.y = -0.56;
      ombro.add(mao);
      return ombro;
    };
    const ombroL = montarBraco(-1);
    const ombroR = montarBraco(1);

    // Pernas com pivô no quadril: calça, canela e sapato
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.27), pantsMat);
    pelvis.position.y = 0.6;
    person.add(pelvis);
    const montarPerna = (lado: number) => {
      const quadril = new THREE.Group();
      quadril.position.set(lado * 0.13, 0.575, 0);
      person.add(quadril);
      const coxa = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.08, 0.3, 14), pantsMat);
      coxa.position.y = -0.15;
      quadril.add(coxa);
      const canela = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.3, 14), pantsMat);
      canela.position.y = -0.44;
      quadril.add(canela);
      const sapato = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.22), shoeMat);
      sapato.position.set(0, -0.6, 0.05);
      quadril.add(sapato);
      return quadril;
    };
    const quadrilL = montarPerna(-1);
    const quadrilR = montarPerna(1);

    person.position.set(0, 0, 1);

    // ---------------- Obstáculos e paisagem ----------------
    const obstacles: { x: number; z: number; r: number }[] = [];
    // Árvores longe do caminho da Lia (casa, placa, flores, computador) e da câmera,
    // para nenhuma ficar na frente dela. Antes elas nasciam atrás da casa e escondiam a cabeça.
    const treePositions: number[][] = [
      [-11, -2],
      [11, -4],
      [-10, 4],
      [10, 2],
      [-12, -10],
      [12, -10],
      [-13, 6],
      [13, 6],
    ];
    // Árvores com pivô na base: balançam devagar com o vento
    const arvores: { copa: THREE.Group; fase: number }[] = [];
    const coresArvore = [0x2e7d32, 0x388e3c, 0x2a6f2f];
    treePositions.forEach(([tx, tz], i) => {
      const { grupo, copa } = criarArvore(coresArvore[i % 3], 1 + (i % 3) * 0.12, r);
      grupo.position.set(tx, 0, tz);
      scene.add(grupo);
      arvores.push({ copa, fase: i * 1.3 });
      obstacles.push({ x: tx, z: tz, r: 1.0 });
    });
    // Floresta ao fundo, fora da área de passeio
    for (let i = 0; i < 4; i++) { // menos árvores ao fundo (era 8)
      const lado = i % 4;
      const d = 10 + r() * 4;
      const v = (r() - 0.5) * 26;
      const x = lado === 0 ? -d : lado === 1 ? d : v;
      const z = lado === 2 ? -d : lado === 3 ? d * 0.9 : v;
      if (Math.abs(z - 8.6) < 3 && Math.abs(x) < 3) continue; // não nasce dentro do lago
      const { grupo, copa } = criarArvore(coresArvore[i % 3], 1.2 + r() * 0.5, r);
      grupo.position.set(x, 0, z);
      scene.add(grupo);
      arvores.push({ copa, fase: r() * 10 });
    }
    // Pedras grandes
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.9, flatShading: true });
    [
      [-6, 3],
      [6, 3],
      [-7, -5],
      [7, -5],
    ].forEach(([rx, rz]) => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), rockMat);
      rock.scale.y = 0.65;
      rock.position.set(rx, 0.2, rz);
      rock.castShadow = true;
      scene.add(rock);
      obstacles.push({ x: rx, z: rz, r: 0.6 });
    });
    // Arbustos
    [
      [-2.5, 4],
      [4.5, 2],
      [-8.5, 6],
      [8.5, 4],
      [-3.5, 8],
      [3.5, -8.5],
      [-1, -9],
      [6.5, -1.5],
    ].forEach(([ax, az], i) => {
      const arb = criarArbusto(i % 2 === 0 ? 0x2c6e2f : 0x3a7d34, r);
      arb.position.set(ax, 0, az);
      scene.add(arb);
      obstacles.push({ x: ax, z: az, r: 0.45 });
    });

    // Casa: paredes, telhado de duas águas, porta, janelas com luz, varanda
    const house = new THREE.Group();
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1.5, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xf0c08a, roughness: 0.85 }),
    );
    walls.position.y = 0.75;
    walls.castShadow = true;
    walls.receiveShadow = true;
    house.add(walls);
    const rodape = new THREE.Mesh(
      new THREE.BoxGeometry(2.04, 0.14, 1.84),
      new THREE.MeshStandardMaterial({ color: 0x8c7a6a }),
    );
    rodape.position.y = 0.07;
    house.add(rodape);
    // Telhado de duas águas: prisma triangular ao longo da profundidade
    const formaTelhado = new THREE.Shape();
    formaTelhado.moveTo(-1.25, 0);
    formaTelhado.lineTo(1.25, 0);
    formaTelhado.lineTo(0, 1.0);
    formaTelhado.lineTo(-1.25, 0);
    const telhadoGeo = new THREE.ExtrudeGeometry(formaTelhado, { depth: 2.2, bevelEnabled: false });
    telhadoGeo.translate(0, 0, -1.1);
    const telhado = new THREE.Mesh(
      telhadoGeo,
      new THREE.MeshStandardMaterial({ color: 0xa34a2a, roughness: 0.7, flatShading: true }),
    );
    telhado.position.y = 1.5;
    telhado.castShadow = true;
    house.add(telhado);
    // Porta na frente (lado da varanda)
    const porta = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.06), new THREE.MeshStandardMaterial({ color: 0x5a3018 }));
    porta.position.set(0, 0.57, 0.92);
    house.add(porta);
    const maçaneta = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffd21f, metalness: 0.6 }),
    );
    maçaneta.position.set(0.18, 0.55, 0.96);
    house.add(maçaneta);
    // Janelas com luz quente: moldura e vidro emissivo
    const vidroMat = new THREE.MeshStandardMaterial({ color: 0xffc04a, emissive: 0xffa930, emissiveIntensity: 1.1 });
    const molduraMat = new THREE.MeshStandardMaterial({ color: 0xfff3e0 });
    const janelas: [number, number, number, number][] = [
      [-0.62, 0.95, 0.91, 0],
      [0.62, 0.95, 0.91, 0],
      [1.01, 0.95, 0, Math.PI / 2],
      [-1.01, 0.95, 0, -Math.PI / 2],
    ];
    janelas.forEach(([x, y, z, ry]) => {
      const j = new THREE.Group();
      j.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), molduraMat));
      const vidro = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), vidroMat);
      vidro.position.z = 0.03;
      j.add(vidro);
      const cruz = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.01), molduraMat);
      cruz.position.z = 0.035;
      j.add(cruz);
      j.position.set(x, y, z);
      j.rotation.y = ry;
      house.add(j);
    });
    // Varanda simples na frente da casa
    const varanda = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.9), new THREE.MeshStandardMaterial({ color: 0x9b6a3e }));
    varanda.position.set(0, 0.06, 1.35);
    varanda.receiveShadow = true;
    house.add(varanda);
    [-1.15, 1.15].forEach((x) => {
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0x6b4325 }));
      poste.position.set(x, 0.66, 1.75);
      house.add(poste);
    });
    const coberturaVaranda = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.08, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xa34a2a }),
    );
    coberturaVaranda.position.set(0, 1.3, 1.45);
    coberturaVaranda.castShadow = true;
    house.add(coberturaVaranda);
    house.position.set(-4, 0, -6);
    scene.add(house);
    obstacles.push({ x: -4, z: -6, r: 1.5 });
    // Luz quente saindo da casa

    // Placa com o nome "Lia" na frente da casa
    const placa = new THREE.Group();
    const posteMat = new THREE.MeshStandardMaterial({ color: 0x5a3a20 });
    [-0.6, 0.6].forEach((x) => {
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), posteMat);
      poste.position.set(x, 0.55, 0);
      placa.add(poste);
    });
    const tabua = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.5, 0.06),
      new THREE.MeshStandardMaterial({ map: texturaPlaca() }),
    );
    tabua.position.set(0, 1.0, 0);
    tabua.castShadow = true;
    placa.add(tabua);
    placa.position.set(-4, 0, -3.6);
    scene.add(placa);


    // Flores em canteiros coloridos (com haste e pétalas), balançando
    const coresFlor = [0xff6fa5, 0xffd21f, 0xffffff, 0xff8c42, 0xb388ff, 0xff5252];
    const flores: { grupo: THREE.Group; fase: number }[] = [];
    const hasteMat = new THREE.MeshStandardMaterial({ color: 0x3d8b37 });
    const miolo = new THREE.MeshStandardMaterial({ color: 0xffb300 });
    // Geometria de pétala e de haste criada uma vez e reutilizada por todas as flores
    const petalaGeo = new THREE.SphereGeometry(0.035, 6, 5);
    const centroGeo = new THREE.SphereGeometry(0.02, 6, 5);
    const hasteGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4);
    for (let i = 0; i < 6; i++) { // poucas flores, só as essenciais (eram 14)
      const bx = (r() - 0.5) * 16;
      const bz = (r() - 0.5) * 16;
      if (Math.hypot(bx, bz - 1) < 1.5) continue; // não nasce em cima da Lia no início
      const grupo = new THREE.Group();
      const hastes = new THREE.Mesh(hasteGeo, hasteMat);
      hastes.position.y = 0.1;
      grupo.add(hastes);
      const petalaMat = new THREE.MeshStandardMaterial({ color: coresFlor[i % coresFlor.length] });
      for (let p = 0; p < 5; p++) {
        const petala = new THREE.Mesh(petalaGeo, petalaMat);
        const a = (p / 5) * Math.PI * 2;
        petala.position.set(Math.cos(a) * 0.04, 0.21, Math.sin(a) * 0.04);
        grupo.add(petala);
      }
      const centro = new THREE.Mesh(centroGeo, miolo);
      centro.position.y = 0.22;
      grupo.add(centro);
      grupo.position.set(bx, 0, bz);
      scene.add(grupo);
      flores.push({ grupo, fase: r() * Math.PI * 2 });
    }

    // Vaga-lumes: brilho suave que voa em volta de um ponto e pisca
    const fireflyCount = 6; // menos vaga-lumes (eram 10)
    const fireflyGeo = new THREE.BufferGeometry();
    const fireflyPos = new Float32Array(fireflyCount * 3);
    const fireflyBase: number[] = [];
    for (let i = 0; i < fireflyCount; i++) {
      const bx = (r() - 0.5) * 14;
      const by = 0.6 + r() * 2.2;
      const bz = (r() - 0.5) * 14;
      fireflyBase.push(bx, by, bz);
      fireflyPos[i * 3] = bx;
      fireflyPos[i * 3 + 1] = by;
      fireflyPos[i * 3 + 2] = bz;
    }
    fireflyGeo.setAttribute("position", new THREE.BufferAttribute(fireflyPos, 3));
    const fireflyMat = new THREE.PointsMaterial({
      color: 0xffe066,
      size: 0.32,
      map: texturaBrilho(),
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(fireflyGeo, fireflyMat));

    // Nuvens: grupos de bolas brancas que deslizam devagar
    const nuvens: { grupo: THREE.Group; vel: number }[] = [];
    const nuvemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    for (let i = 0; i < 0; i++) { // nuvens desligadas (simplificação)
      const grupo = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.7 + r() * 0.5, 8, 6), nuvemMat);
        b.position.set(k * 0.9 - 1.3, r() * 0.3, (r() - 0.5) * 0.6);
        b.scale.y = 0.6;
        grupo.add(b);
      }
      grupo.position.set((r() - 0.5) * 60, 9 + r() * 3, -15 - r() * 20);
      scene.add(grupo);
      nuvens.push({ grupo, vel: 0.2 + r() * 0.2 });
    }

    // Pássaros longe, voando em círculos e batendo as asas
    const passaros: {
      grupo: THREE.Group; asaE: THREE.Mesh; asaD: THREE.Mesh;
      raio: number; vel: number; ang: number; alt: number;
    }[] = [];
    const passaroMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
    for (let i = 0; i < 0; i++) { // pássaros desligados (simplificação)
      const grupo = new THREE.Group();
      grupo.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.22), passaroMat));
      const asaE = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.1), passaroMat);
      asaE.position.x = -0.15;
      grupo.add(asaE);
      const asaD = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.1), passaroMat);
      asaD.position.x = 0.15;
      grupo.add(asaD);
      scene.add(grupo);
      passaros.push({
        grupo, asaE, asaD,
        raio: 14 + r() * 6, vel: 0.12 + r() * 0.08, ang: r() * Math.PI * 2, alt: 7 + r() * 4,
      });
    }

    // --- Estado de movimento ---
    let px = 0;
    let pz = 1;
    let tx = 0; // alvo atual
    let tz = 1;
    let destinoAtual: Destino = { nome: "inicio", x: 0, z: 1 };
    let fase: Fase = "caminhando";
    let timer = 0; // tempo parado olhando ao redor
    let faseEmitida = ""; // última fase avisada ao App
    let sit = 0; // 0 = em pé, 1 = sentada
    let facing = 0;
    let cyc = 0; // ciclo de passos
    let walkAmp = 0; // intensidade do andar (suaviza início e fim)
    let headYaw = 0;
    let tempo = 0;
    let ultimo = performance.now();
    let theta = 0;
    let camHeight = 2.5;
    let camDist = 6;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    // Câmera livre: alvo fixo no mundo (o usuário arrasta com o botão direito para mover)
    const livreTarget = new THREE.Vector3(0, 1, 0);
    let panning = false;
    let estavaLivre = false;
    // Toque: dois dedos para zoom (pinça)
    const ponteiros = new Map<number, { x: number; y: number }>();
    let distPinca = 0;
    let raf = 0;
    let rodando = false; // false quando a aba está em segundo plano (loop pausado)
    // Estado da câmera suavizada (refs de três.js, sem useState) e alvos reutilizados por quadro
    const camAtual = new THREE.Vector3();
    const olharAtual = new THREE.Vector3();
    const alvoCam = new THREE.Vector3();
    const alvoOlhar = new THREE.Vector3();
    let camPrimeira = false;
    let ultimoVentoGrama = -1;

    const irPara = (dest: Destino) => {
      destinoAtual = dest;
      tx = dest.x;
      tz = dest.z;
      fase = "caminhando";
    };

    // Passeio: escolhe um lugar da cena (nunca o computador) conforme as necessidades da Lia
    const destinosPasseio: Destino[] = [
      { nome: "casa", x: -4, z: -6 },
      { nome: "arvore", x: -6, z: -4 },
      { nome: "flores", x: 4, z: -6 },
      { nome: "lago", x: 0, z: 6 },
    ];
    const escolherPasseio = (): Destino => {
      const fome = lifeRef.current?.fome ?? 70;
      const energia = lifeRef.current?.energia ?? 80;
      const humor = lifeRef.current?.humor ?? 70;
      const sociability = lifeRef.current?.sociability ?? 60;
      const acao = lifeRef.current?.acaoAtual ?? null;
      const achar = (nome: string) => destinosPasseio.find((d) => d.nome === nome);
      const aleatorio = () => destinosPasseio[Math.floor(Math.random() * destinosPasseio.length)];

      if (acao === "dormir" || energia < 25 || acao === "comer" || fome < 30) {
        return achar("casa") ?? aleatorio();
      }
      if (acao === "brincar" || humor < 30) {
        return achar("flores") ?? achar("arvore") ?? aleatorio();
      }
      if (acao === "conversar" || sociability < 30) {
        return achar("arvore") ?? aleatorio();
      }
      return aleatorio();
    };

    const sentarNoComputador = () => irPara(CADEIRA);

    // Escolhe o próximo passo quando a Lia está de pé e livre
    const proximoPasso = () => {
      if (pesquisandoRef.current) sentarNoComputador();
      else irPara(escolherPasseio());
    };

    proximoPasso();

    let downX = 0;
    let downY = 0;
    const onDown = (e: PointerEvent) => {
      ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ponteiros.size === 2) {
        const [a, b] = [...ponteiros.values()];
        distPinca = Math.hypot(a.x - b.x, a.y - b.y);
      }
      dragging = true;
      panning = e.button === 2;
      lastX = e.clientX;
      lastY = e.clientY;
      downX = e.clientX;
      downY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (ponteiros.has(e.pointerId)) ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Dois dedos: pinça dá zoom (sem girar)
      if (ponteiros.size === 2) {
        const [a, b] = [...ponteiros.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (distPinca > 0 && d > 0) camDist = Math.min(12, Math.max(2.5, camDist * (distPinca / d)));
        distPinca = d;
        definirModoRef.current(true);
        return;
      }
      if (dragging === false) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      definirModoRef.current(true);
      if (panning) {
        // Botão direito: move o alvo para os lados (direita/esquerda) e para cima/baixo
        // Direita da câmera = (cos θ, 0, -sin θ): a cena acompanha o mouse
        const escala = camDist * 0.0022;
        livreTarget.x += Math.cos(theta) * dx * escala;
        livreTarget.z += -Math.sin(theta) * dx * escala;
        livreTarget.y = Math.min(4, Math.max(0.5, livreTarget.y - dy * escala * 0.6));
        livreTarget.x = Math.min(10, Math.max(-10, livreTarget.x));
        livreTarget.z = Math.min(10, Math.max(-10, livreTarget.z));
        return;
      }
      theta += dx * 0.005;
      camHeight += dy * 0.01;
      if (camHeight < 0.6) camHeight = 0.6;
      if (camHeight > 5) camHeight = 5;
    };
    const raio = new THREE.Raycaster();
    const onUp = (e: PointerEvent) => {
      ponteiros.delete(e.pointerId);
      distPinca = 0;
      dragging = ponteiros.size > 0;
      panning = false;
      // Clique de verdade (pouco movimento): vê se pegou o quadro de anotações
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raio.setFromCamera(ndc, camera);
      if (raio.intersectObject(painelMesh).length > 0) painelClickRef.current?.();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      definirModoRef.current(true);
      camDist += e.deltaY * 0.01;
      if (camDist < 2.5) camDist = 2.5;
      if (camDist > 12) camDist = 12;
    };
    // Botão direito não abre o menu do navegador (ele move a câmera)
    const semMenu = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener("contextmenu", semMenu);
    renderer.domElement.style.touchAction = "none"; // pinça e arrasto no celular sem rolar a página
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // Tudo que se move (Lia, copas, flores, nuvens, pássaros) continua atualizando.
    // O resto é fixo: a matriz é calculada uma vez e não a cada quadro.
    const dinamicos = new Set<THREE.Object3D>([person, ...arvores.map((a) => a.copa), ...flores.map((f) => f.grupo), ...nuvens.map((n) => n.grupo), ...passaros.map((b) => b.grupo)]);
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      let mov = false;
      for (let a: THREE.Object3D | null = o; a; a = a.parent) if (dinamicos.has(a)) { mov = true; break; }
      if (!mov && o !== scene) o.matrixAutoUpdate = false;
    });

    const animate = () => {
      if (!rodando) return;
      raf = requestAnimationFrame(animate);
      const agora = performance.now();
      // Limite de 30 FPS: pula o quadro se ainda não passou 1/30 s (economiza CPU)
      if (agora - ultimo < 1000 / 30 - 1) return;
      const dt = Math.min(0.05, (agora - ultimo) / 1000);
      ultimo = agora;
      tempo += dt;

      let andando = false;
      let digitando = false;
      let alvoYaw = 0;
      let alvoNod = 0;

      // Pesquisa pedida enquanto ela passeia: vai para o computador já, sem terminar o passeio
      if (
        pesquisandoRef.current &&
        (fase === "olhando" || (fase === "caminhando" && destinoAtual.nome !== CADEIRA.nome))
      ) {
        sentarNoComputador();
      }

      // ---- Máquina de estados: a Lia nunca fica parada ----
      if (fase === "caminhando") {
        const dx = tx - px;
        const dz = tz - pz;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.12) {
          const passo = Math.min(dist, VELOCIDADE * dt);
          let ax = 0;
          let az = 0;
          for (const obs of obstacles) {
            // Ignora o obstáculo do próprio destino (ex.: a cadeira fica perto da mesa)
            if (Math.hypot(obs.x - tx, obs.z - tz) < 0.6) continue;
            const odx = px - obs.x;
            const odz = pz - obs.z;
            const od = Math.hypot(odx, odz);
            if (od < obs.r + 0.8) {
              ax += (odx / Math.max(od, 0.01)) * 1.2 * dt;
              az += (odz / Math.max(od, 0.01)) * 1.2 * dt;
            }
          }
          px += (dx / dist) * passo + ax;
          pz += (dz / dist) * passo + az;
          facing += angDiff(facing, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
          andando = true;
          cyc += dt * 12;
          alvoYaw = Math.sin(tempo * 0.9) * 0.25; // olha para a frente, com leve movimento
        } else if (destinoAtual.nome === CADEIRA.nome) {
          px = tx;
          pz = tz;
          if (pesquisandoRef.current) {
            fase = "sentando";
          } else {
            proximoPasso();
          }
        } else {
          fase = "olhando";
          timer = 2.5 + Math.random() * 2;
        }
      } else if (fase === "sentando") {
        // Vira para a mesa e senta
        facing += angDiff(facing, Math.PI) * Math.min(1, dt * 6);
        sit = Math.min(1, sit + dt * 2.5);
        alvoYaw = Math.sin(tempo * 0.35) * 0.3;
        if (sit >= 1) {
          fase = "digitando";
        }
      } else if (fase === "digitando") {
        facing += angDiff(facing, Math.PI) * Math.min(1, dt * 6);
        sit = 1;
        digitando = true;
        alvoYaw = Math.sin(tempo * 0.35) * 0.3 + (Math.sin(tempo * 0.11) > 0.8 ? 0.6 : 0); // olha para a cena de vez em quando
        alvoNod = 0.2; // olha para o teclado
        // Só levanta quando o App encerra a pesquisa (pesquisando = false)
        if (!pesquisandoRef.current) {
          fase = "levantando";
        }
      } else if (fase === "levantando") {
        sit = Math.max(0, sit - dt * 2.5);
        alvoYaw = 0;
        if (sit <= 0) {
          // Levantou: passeia por outro ponto da cena antes de voltar ao computador
          irPara(escolherPasseio());
        }
      } else if (fase === "olhando") {
        // Olha ao redor: a cabeça varre para os dois lados
        alvoYaw = Math.sin(tempo * 0.9) * 1.1;
        timer -= dt;
        if (timer <= 0) {
          proximoPasso();
        }
      }

      // Avisa o App quando a fase física muda (o App só pesquisa com a fase "digitando")
      const faseAtual =
        fase === "caminhando"
          ? destinoAtual.nome === CADEIRA.nome ? "indo-computador" : "passeando"
          : fase === "olhando"
            ? "passeando"
            : fase;
      if (faseAtual !== faseEmitida) {
        faseEmitida = faseAtual;
        // Fora do quadro: o App grava o evento (IO) depois, sem travar a animação
        const cb = faseCbRef.current;
        if (cb) setTimeout(() => cb(faseAtual), 0);
      }

      // Suaviza a intensidade do andar e o giro da cabeça
      walkAmp += ((andando ? 1 : 0) - walkAmp) * Math.min(1, dt * 6);
      headYaw += (alvoYaw - headYaw) * Math.min(1, dt * 4);

      // ---- Posição e pose ----
      person.position.set(px, -0.075 * sit, pz);
      person.rotation.y = facing;

      const balanco = Math.sin(cyc) * walkAmp;
      const respira = Math.sin(tempo * 1.7);
      const digitar = digitando ? Math.sin(tempo * 13) * 0.1 : 0;

      // Pernas: andar (balanço) ou sentada (estendidas para frente)
      quadrilL.rotation.x = balanco * 0.6 * (1 - sit) - (Math.PI / 2) * sit;
      quadrilR.rotation.x = -balanco * 0.6 * (1 - sit) - (Math.PI / 2) * sit;

      // Braços: balanço ao andar, digitando no teclado quando sentada
      const bracoAndar = 1 - sit;
      const idleL = Math.sin(tempo * 1.2) * 0.05;
      const idleR = Math.cos(tempo * 1.1) * 0.05;
      const digitoL = digitando ? -0.75 + digitar : -0.45;
      const digitoR = digitando ? -0.75 - digitar : -0.45;
      ombroL.rotation.x = -balanco * 0.5 * bracoAndar + idleL * bracoAndar + digitoL * sit;
      ombroR.rotation.x = balanco * 0.5 * bracoAndar + idleR * bracoAndar + digitoR * sit;

      // Respiração: tronco e peito sobem e descem de leve
      torso.scale.y = 1 + respira * 0.015;
      peito.scale.y = 1 + respira * 0.02;
      cabeca.position.y = 1.5 + respira * 0.01;

      // Cabeça: vira para os lados e inclina conforme a atividade
      cabeca.rotation.y = headYaw;
      cabeca.rotation.x += (alvoNod + respira * 0.01 - cabeca.rotation.x) * Math.min(1, dt * 4);

      // Cabelo: a franja e o rabo balançam devagar; o rabo vai atrasado ao andar
      cabelo.rotation.x = Math.sin(tempo * 1.3) * 0.02 - balanco * 0.03;
      rabo.rotation.x = 0.1 + Math.sin(tempo * 1.1) * 0.05 + balanco * 0.1;
      rabo.rotation.z = Math.sin(tempo * 0.9 + 0.6) * 0.04 - balanco * 0.04;

      // Piscar: a cada ~3,8 s, os olhos fecham por um instante
      const piscando = tempo % 3.8 < 0.14;
      olhos.forEach((o) => { o.scale.y = piscando ? 0.12 : 1; });

      // Monitor: atualiza só quando o tema ou o status mudam
      atualizarTela();

      // Ambiente sempre em movimento: árvores, grama, flores, vaga-lumes, nuvens e pássaros
      arvores.slice(0, 3).forEach(({ copa, fase: f }) => { // só poucas árvores balançam, de leve
        copa.rotation.z = Math.sin(tempo * 0.6 + f) * 0.012;
        copa.rotation.x = Math.cos(tempo * 0.5 + f) * 0.008;
      });
      if (ultimoVentoGrama < 0) { // grama parada: calcula uma vez só
      ultimoVentoGrama = tempo;
      for (let i = 0; i < N_GRAMA; i++) {
        const g = gramaBase[i];
        const vento = 0;
        dummy.position.set(g.x, 0, g.z);
        dummy.rotation.set(vento * 0.6, g.rot, vento);
        dummy.scale.set(g.s, g.s, g.s);
        dummy.updateMatrix();
        grama.setMatrixAt(i, dummy.matrix);
      }
      grama.instanceMatrix.needsUpdate = true;
      }

      for (let i = 0; i < fireflyCount; i++) {
        const k = i * 3;
        const f = i * 0.7;
        fireflyPos[k] = fireflyBase[k] + Math.sin(tempo * 0.6 + f) * 0.7;
        fireflyPos[k + 1] = fireflyBase[k + 1] + Math.sin(tempo * 1.1 + f * 2) * 0.35;
        fireflyPos[k + 2] = fireflyBase[k + 2] + Math.cos(tempo * 0.5 + f) * 0.7;
      }
      fireflyGeo.attributes.position.needsUpdate = true;
      fireflyMat.opacity = 0.5 + 0.5 * Math.abs(Math.sin(tempo * 1.7));

      nuvens.forEach((n) => {
        n.grupo.position.x += n.vel * dt;
        if (n.grupo.position.x > 35) n.grupo.position.x = -35;
      });
      passaros.forEach((b) => {
        b.ang += b.vel * dt;
        b.grupo.position.set(
          Math.cos(b.ang) * b.raio,
          b.alt + Math.sin(tempo * 0.7 + b.ang) * 0.4,
          Math.sin(b.ang) * b.raio - 4,
        );
        b.grupo.rotation.y = -b.ang + Math.PI / 2;
        const bater = Math.sin(tempo * 9 + b.ang * 3) * 0.6;
        b.asaE.rotation.z = bater;
        b.asaD.rotation.z = -bater;
      });

      // Câmera: órbita lenta, com balanço suave de altura e distância (nunca parada)
      const livre = modoLivreRef.current;
      if (livre && !estavaLivre) {
        // Entrou no modo livre: parte exatamente da posição atual da câmera, sem pulo
        livreTarget.copy(olharAtual);
        const ddx = camAtual.x - olharAtual.x;
        const ddz = camAtual.z - olharAtual.z;
        theta = Math.atan2(ddx, ddz);
        camDist = Math.min(12, Math.max(2.5, Math.hypot(ddx, ddz)));
        camHeight = Math.max(0.6, camAtual.y);
      }
      estavaLivre = livre;
      // Seguir: a órbita gira sozinha em volta da Lia. Livre: a câmera fica parada no lugar.
      if (!livre && !dragging) theta += dt * 0.03;
      const thetaVisto = theta;
      const altura = camHeight;
      const dist = camDist;
      const cx = livre ? livreTarget.x : px;
      const cz = livre ? livreTarget.z : pz;
      const cy = livre ? livreTarget.y : 1;
      alvoCam.set(cx + dist * Math.sin(thetaVisto), Math.max(0.6, altura), cz + dist * Math.cos(thetaVisto));
      alvoOlhar.set(cx, cy, cz);
      if (!camPrimeira) {
        camAtual.copy(alvoCam);
        olharAtual.copy(alvoOlhar);
        camPrimeira = true;
      } else {
        // Interpolação com deltaTime: a câmera chega devagar ao alvo, sem pular
        const k = 1 - Math.exp(-dt * 3);
        camAtual.lerp(alvoCam, k);
        olharAtual.lerp(alvoOlhar, k);
      }
      camera.position.copy(camAtual);
      camera.lookAt(olharAtual);

      if (cbRef.current) { cbRef.current(px, pz); }
      renderer.render(scene, camera);
    };

    // Aba em segundo plano: para o loop; ao voltar, retoma do ponto onde estava (a cena não é recriada)
    const onVisibilidade = () => {
      if (document.hidden) {
        rodando = false;
        cancelAnimationFrame(raf);
      } else if (!rodando) {
        rodando = true;
        ultimo = performance.now();
        raf = requestAnimationFrame(animate);
      }
    };
    document.addEventListener("visibilitychange", onVisibilidade);

    rodando = !document.hidden;
    if (rodando) animate();

    const handleResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      rodando = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibilidade);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("contextmenu", semMenu);
      if (container.contains(renderer.domElement)) { container.removeChild(renderer.domElement); }
      renderer.dispose();
    };
  }, []);

  const botaoCamera = (ativo: boolean): CSSProperties => ({
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #7c3aed",
    background: ativo ? "#7c3aed" : "white",
    color: ativo ? "white" : "#7c3aed",
    cursor: "pointer",
    fontSize: 13,
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, zIndex: 2 }}>
        <button type="button" onClick={() => definirModo(false)} style={botaoCamera(!modoLivre)}>
          Seguir a Lia
        </button>
        <button type="button" onClick={() => definirModo(true)} style={botaoCamera(modoLivre)}>
          Câmera livre
        </button>
      </div>
      {estadoServidor && (
        <div
          style={{
            position: "absolute", left: 16, bottom: 180, zIndex: 2, width: 240, pointerEvents: "none",
            padding: "8px 10px", background: "#f4efe3", borderRadius: 8,
            boxShadow: "0 2px 10px rgba(0,0,0,0.15)", fontFamily: "system-ui, sans-serif", fontSize: 12, color: "#666",
          }}
        >
          <div style={{ fontWeight: "bold", fontSize: 14, color: "#1a1a2e" }}>Pesquisa da Lia</div>
          <div style={{ marginTop: 2 }}>{estadoServidor.status || "Sem pesquisa rodando"}</div>
          <div style={{ marginTop: 2 }}>{tempoDesde(estadoServidor.ultimaPesquisa?.createdAt, agoraPainel)}</div>
          {estadoServidor.ultimaPesquisa && (
            <div style={{ marginTop: 2, color: "#7c3aed", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {estadoServidor.ultimaPesquisa.topic}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
