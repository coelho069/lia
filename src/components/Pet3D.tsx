import { useEffect, useRef } from "react";
import * as THREE from "three";

type Destino = { nome: string; x: number; z: number };

export function Pet3D({
  onPetPositionChange,
  life,
}: {
  onPetPositionChange?: (x: number, z: number) => void;
  life?: {
    fome?: number;
    energia?: number;
    humor?: number;
    sociability?: number;
    acaoAtual?: string | null;
  };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onPetPositionChange);
  cbRef.current = onPetPositionChange;

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
      { nome: "computador", x: 0, z: 0 },
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

    // Obstáculos para não atravessar: casa, árvores, pedras
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

    const chooseDestination = () => {
      // Decide baseado nas necessidades da vida
      const fome = life?.fome ?? 70;
      const energia = life?.energia ?? 80;
      const humor = life?.humor ?? 70;
      const sociability = life?.sociability ?? 60;
      const acao = life?.acaoAtual ?? null;

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

      // Atualiza necessidade da vida a cada frame (usa o prop life se disponível)
      if (life && waitTimer <= 0 && !isWalking) {
        pickNext();
      }

      // Movimento em direção ao destino
      if (isWalking && destinoAtual) {
        const dx = targetX - px;
        const dz = targetZ - pz;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.25) {
          // Não atravessar obstáculos: se muito perto, desvia ligeiramente
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

          // Corpo virado para a direção do movimento
          person.rotation.y = Math.atan2(dx, dz);
          walkCycle += 0.25;
          isWalking = true;
        } else {
          // Chegou ao destino: espera um pouco
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

      person.position.set(px, 0, pz);

      // Animação de andar: pernas e braços balançando no ritmo do passo
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

      fireflies.rotation.y += 0.002;
      camera.position.set(px + camDist * Math.sin(theta), camHeight, pz + camDist * Math.cos(theta));
      camera.lookAt(px, 1, pz);
      if (cbRef.current) { cbRef.current(px, pz); }
      renderer.render(scene, camera);
    };

    let raf = 0;
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
  }, [life]);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}
