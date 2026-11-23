import { useEffect, useRef } from "react";
import * as THREE from "three";

type Destino = { nome: string; x: number; z: number };

export function Pet3D({
  onPetPositionChange,
  life,
  pesquisando,
  temaPesquisa,
}: {
  onPetPositionChange?: (x: number, z: number) => void;
  life?: {
    fome?: number;
    energia?: number;
    humor?: number;
    sociability?: number;
    acaoAtual?: string | null;
  };
  pesquisando?: boolean;
  temaPesquisa?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onPetPositionChange);
  cbRef.current = onPetPositionChange;
  const lifeRef = useRef(life);
  lifeRef.current = life;
  const pesquisandoRef = useRef(pesquisando);
  pesquisandoRef.current = pesquisando;
  const temaPesquisaRef = useRef(temaPesquisa);
  temaPesquisaRef.current = temaPesquisa;

  useEffect(() => {
    const container = ref.current;
    if (container === null) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 15, 30);
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 2.5, 6);
    camera.lookAt(0, 1, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(5, 10, 5);
    sun.castShadow = true;
    scene.add(sun);

    // Chão
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x5aa84f }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Caminho de terra ligando os destinos (faixa visível no chão)
    const pathMat = new THREE.MeshStandardMaterial({ color: 0xb08954 });
    const path = new THREE.Mesh(new THREE.PlaneGeometry(18, 2), pathMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.02, 0);
    path.receiveShadow = true;
    scene.add(path);

    const dirt = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshStandardMaterial({ color: 0xb08954 }));
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.set(0, 0.01, 1);
    scene.add(dirt);

    // Destinos com nomes e coordenadas
    const destinos: Destino[] = [
      { nome: "casa", x: -4, z: -6 },
      { nome: "arvore", x: -6, z: -4 },
      { nome: "flores", x: 4, z: -6 },
      { nome: "computador", x: 2, z: -2 },
      { nome: "lago", x: 0, z: 6 },
    ];

    // Marcadores visuais dos destinos (pequenos cones coloridos no chão)
    const destMat = new THREE.MeshStandardMaterial({ color: 0xffd700 });
    destinos.forEach((d) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 8), destMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(d.x, 0.06, d.z);
      scene.add(m);
    });

    // Computador (mesa, monitor, teclado, cadeira) perto da casa
    const compGroup = new THREE.Group();
    compGroup.position.set(2, 0, -2);

    // Mesa
    const mesaMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a });
    const mesa = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.7), mesaMat);
    mesa.position.y = 0.35;
    mesa.castShadow = true;
    mesa.receiveShadow = true;
    compGroup.add(mesa);

    // Pés da mesa
    const peMat = new THREE.MeshStandardMaterial({ color: 0x5a3e25 });
    const peL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.05), peMat);
    peL.position.set(-0.5, 0.175, -0.25);
    compGroup.add(peL);
    const peR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.05), peMat);
    peR.position.set(0.5, 0.175, -0.25);
    compGroup.add(peR);
    const peL2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.05), peMat);
    peL2.position.set(-0.5, 0.175, 0.25);
    compGroup.add(peL2);
    const peR2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.05), peMat);
    peR2.position.set(0.5, 0.175, 0.25);
    compGroup.add(peR2);

    // Monitor
    const monMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.1), monMat);
    monitor.position.set(0, 0.95, -0.3);
    monitor.castShadow = true;
    compGroup.add(monitor);

    // Suporte do monitor
    const supMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const suporte = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.08), supMat);
    suporte.position.set(0, 0.5, -0.3);
    compGroup.add(suporte);

    // Tela do monitor (mostra tema da pesquisa via canvas texture)
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const telaTexture = new THREE.CanvasTexture(canvas);
    const telaMat = new THREE.MeshBasicMaterial({ map: telaTexture });
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.82), telaMat);
    tela.position.set(0, 0.95, -0.2);
    tela.lookAt(new THREE.Vector3(0, 0.95, -1));
    compGroup.add(tela);

    function desenharTela(texto: string) {
      const c = canvas;
      const cx = c.getContext("2d")!;
      cx.fillStyle = "#000000";
      cx.fillRect(0, 0, c.width, c.height);
      cx.fillStyle = "#00ff00";
      cx.font = "bold 24px monospace";
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      cx.fillText("PESQUISA:", c.width / 2, c.height / 2 - 40);
      cx.font = "20px monospace";
      const linhas = quebrarTexto(texto, cx, c.width - 40);
      linhas.forEach((linha, i) => {
        cx.fillText(linha, c.width / 2, c.height / 2 + i * 30);
      });
      telaTexture.needsUpdate = true;
    }

    desenharTela(temaPesquisaRef.current || "");

    // Teclado
    const teclado = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    teclado.position.set(0, 0.72, 0.1);
    compGroup.add(teclado);

    // Cadeira
    const cadeiraMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const cadeira = new THREE.Group();
    const assento = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), cadeiraMat);
    assento.position.y = 0.45;
    cadeira.add(assento);
    const encosto = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), cadeiraMat);
    encosto.position.set(0, 0.7, -0.25);
    cadeira.add(encosto);
    const pernaC = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), cadeiraMat);
    pernaC.position.set(-0.22, 0.225, -0.22);
    cadeira.add(pernaC);
    const pernaC2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), cadeiraMat);
    pernaC2.position.set(0.22, 0.225, -0.22);
    cadeira.add(pernaC2);
    const pernaC3 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), cadeiraMat);
    pernaC3.position.set(-0.22, 0.225, 0.22);
    cadeira.add(pernaC3);
    const pernaC4 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), cadeiraMat);
    pernaC4.position.set(0.22, 0.225, 0.22);
    cadeira.add(pernaC4);
    cadeira.position.set(0, 0, 0.6);
    compGroup.add(cadeira);

    scene.add(compGroup);

    // Pessoa (Lia)
    const person = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2c9a0 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x4a2c1a });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x7c5cff });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2d2d4a });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 32), skinMat);
    head.position.y = 1.45;
    head.castShadow = true;
    person.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.29, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
    hair.position.y = 1.5;
    person.add(hair);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), shirtMat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    person.add(torso);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 16), skinMat);
    armL.position.set(-0.35, 0.95, 0);
    person.add(armL);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 16), skinMat);
    armR.position.set(0.35, 0.95, 0);
    person.add(armR);
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 16), pantsMat);
    legL.position.set(-0.14, 0.3, 0);
    person.add(legL);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 16), pantsMat);
    legR.position.set(0.14, 0.3, 0);
    person.add(legR);
    person.position.set(0, 0, 1);
    scene.add(person);

    // Obstáculos para não atravessar: casa, árvores, pedras, computador
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32 });
    const treePositions: number[][] = [
      [-6, -4],
      [6, -4],
      [-7, 0],
      [7, 0],
      [-5, -7],
      [5, -7],
      [-8, -2],
      [8, -2],
    ];
    const obstacles: { x: number; z: number; r: number }[] = [];
    treePositions.forEach(([tx, tz]) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 12), trunkMat);
      trunk.position.y = 0.5;
      tree.add(trunk);
      const cone1 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 16), leafMat);
      cone1.position.y = 1.6;
      tree.add(cone1);
      const cone2 = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.1, 16), leafMat);
      cone2.position.y = 2.4;
      tree.add(cone2);
      tree.position.set(tx, 0, tz);
      scene.add(tree);
      obstacles.push({ x: tx, z: tz, r: 1.0 });
    });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e });
    const rockPositions: number[][] = [
      [-6, 3],
      [6, 3],
      [-7, -5],
      [7, -5],
    ];
    rockPositions.forEach(([rx, rz]) => {
      const rock = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), rockMat);
      rock.scale.y = 0.6;
      rock.position.set(rx, 0.2, rz);
      scene.add(rock);
      obstacles.push({ x: rx, z: rz, r: 0.6 });
    });
    const house = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 1.8), new THREE.MeshStandardMaterial({ color: 0xe8b48a }));
    walls.position.y = 0.75;
    house.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1, 4), new THREE.MeshStandardMaterial({ color: 0xa34a2a }));
    roof.position.y = 2;
    roof.rotation.y = Math.PI / 4;
    house.add(roof);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xffd21f, emissive: 0xffd21f, emissiveIntensity: 0.8 }));
    win.position.set(-0.3, 0.8, 0.91);
    house.add(win);
    house.position.set(-4, 0, -6);
    scene.add(house);
    obstacles.push({ x: -4, z: -6, r: 1.5 });
    obstacles.push({ x: 2, z: -2, r: 1.2 }); // computador

    const flowerColors = [0xff6fa5, 0xffd21f, 0xffffff];
    for (let i = 0; i < 12; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: flowerColors[i % 3] }));
      f.position.set((Math.random() - 0.5) * 10, 0.08, (Math.random() - 0.5) * 10);
      scene.add(f);
    }

    const fireflyCount = 30;
    const fireflyGeo = new THREE.BufferGeometry();
    const fireflyPos = new Float32Array(fireflyCount * 3);
    for (let i = 0; i < fireflyCount; i++) {
      fireflyPos[i * 3] = (Math.random() - 0.5) * 12;
      fireflyPos[i * 3 + 1] = 0.5 + Math.random() * 2;
      fireflyPos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    fireflyGeo.setAttribute("position", new THREE.BufferAttribute(fireflyPos, 3));
    const fireflies = new THREE.Points(fireflyGeo, new THREE.PointsMaterial({ color: 0xffd21f, size: 0.12 }));
    scene.add(fireflies);

    // --- Estado de caminhada ---
    let px = 0;
    let pz = 1;
    let targetX = 0;
    let targetZ = 1;
    let speed = 0.04;
    let walkCycle = 0;
    let isWalking = false;
    let waitTimer = 0;
    let destinoAtual: Destino | null = null;
    let theta = 0;
    let camHeight = 2.5;
    let camDist = 6;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let raf = 0;

    const chooseDestination = () => {
      // Se estiver pesquisando, ir para o computador
      if (pesquisandoRef.current) {
        return destinos.find((d) => d.nome === "computador") ?? destinos[0];
      }
      // Decide baseado nas necessidades da vida
      const fome = lifeRef.current?.fome ?? 70;
      const energia = lifeRef.current?.energia ?? 80;
      const humor = lifeRef.current?.humor ?? 70;
      const sociability = lifeRef.current?.sociability ?? 60;
      const acao = lifeRef.current?.acaoAtual ?? null;

      if (acao === "dormir" || energia < 25) {
        return destinos.find((d) => d.nome === "casa") ?? destinos[0];
      }
      if (acao === "comer" || fome < 30) {
        return destinos.find((d) => d.nome === "casa") ?? destinos[0];
      }
      if (acao === "brincar" || humor < 30) {
        const flores = destinos.find((d) => d.nome === "flores");
        const arvore = destinos.find((d) => d.nome === "arvore");
        return flores ?? arvore ?? destinos[Math.floor(Math.random() * destinos.length)];
      }
      if (acao === "conversar" || sociability < 30) {
        return destinos.find((d) => d.nome === "arvore") ?? destinos[Math.floor(Math.random() * destinos.length)];
      }
      // Sem necessidade urgente: explorar aleatório
      return destinos[Math.floor(Math.random() * destinos.length)];
    };

    const startWalkingTo = (dest: Destino) => {
      targetX = dest.x;
      targetZ = dest.z;
      destinoAtual = dest;
      isWalking = true;
      waitTimer = 0;
    };

    const pickNext = () => {
      const dest = chooseDestination();
      startWalkingTo(dest);
    };

    pickNext();

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

    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
    const onMove = (e: PointerEvent) => {
      if (dragging === false) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      theta += dx * 0.005;
      camHeight += dy * 0.01;
      if (camHeight < 1) camHeight = 1;
      if (camHeight > 5) camHeight = 5;
    };
    const onUp = () => { dragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camDist += e.deltaY * 0.01;
      if (camDist < 3) camDist = 3;
      if (camDist > 12) camDist = 12;
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const animate = () => {
      raf = requestAnimationFrame(animate);

      // Se pesquisando e chegou no computador, para de andar
      if (pesquisandoRef.current && destinoAtual && destinoAtual.nome === "computador") {
        const dx = targetX - px;
        const dz = targetZ - pz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.3) {
          px += (dx / dist) * speed;
          pz += (dz / dist) * speed;
          person.rotation.y = Math.atan2(dx, dz);
          walkCycle += 0.25;
          isWalking = true;
        } else {
          isWalking = false;
          person.rotation.y = Math.atan2(dx, dz);
          walkCycle = 0;
        }
      } else if (!pesquisandoRef.current) {
        // Caminhada normal
        if (lifeRef.current && waitTimer <= 0 && !isWalking) {
          pickNext();
        }

        if (isWalking && destinoAtual) {
          const dx = targetX - px;
          const dz = targetZ - pz;
          const dist = Math.sqrt(dx * dx + dz * dz);

          if (dist > 0.25) {
            let avoidX = 0;
            let avoidZ = 0;
            for (const obs of obstacles) {
              const odx = px - obs.x;
              const odz = pz - obs.z;
              const odist = Math.sqrt(odx * odx + odz * odz);
              if (odist < obs.r + 1.2) {
                avoidX += (odx / Math.max(odist, 0.01)) * 0.02;
                avoidZ += (odz / Math.max(odist, 0.01)) * 0.02;
              }
            }

            px += (dx / dist) * speed + avoidX;
            pz += (dz / dist) * speed + avoidZ;

            person.rotation.y = Math.atan2(dx, dz);
            walkCycle += 0.25;
            isWalking = true;
          } else {
            isWalking = false;
            waitTimer += 0.016;
            if (waitTimer > 3) {
              pickNext();
            }
          }
        } else {
          waitTimer += 0.016;
          if (waitTimer > 3) {
            pickNext();
          }
        }
      }

      person.position.set(px, 0, pz);

      // Animação de andar
      if (isWalking) {
        legL.rotation.x = Math.sin(walkCycle) * 0.6;
        legR.rotation.x = -Math.sin(walkCycle) * 0.6;
        armL.rotation.x = -Math.sin(walkCycle) * 0.5;
        armR.rotation.x = Math.sin(walkCycle) * 0.5;
        torso.rotation.z = Math.sin(walkCycle * 2) * 0.05;
      } else {
        legL.rotation.x = 0;
        legR.rotation.x = 0;
        armL.rotation.x = 0;
        armR.rotation.x = 0;
        torso.rotation.z = 0;
      }

      // Atualizar tela do monitor se o tema mudou
      if (temaPesquisaRef.current) {
        desenharTela(temaPesquisaRef.current);
      }

      fireflies.rotation.y += 0.002;
      camera.position.set(px + camDist * Math.sin(theta), camHeight, pz + camDist * Math.cos(theta));
      camera.lookAt(px, 1, pz);
      if (cbRef.current) { cbRef.current(px, pz); }
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      if (container.contains(renderer.domElement)) { container.removeChild(renderer.domElement); }
      renderer.dispose();
    };
  }, []);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}
