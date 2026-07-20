"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const TAU = Math.PI * 2;

type ViewName = "best" | "axis" | "field";

type SceneSettings = {
  playing: boolean;
  rpm: number;
  currentFlowSpeed: number;
  fieldStrength: number;
  showField: boolean;
  showCurrent: boolean;
  showRule: boolean;
};

function wrapAngle(value: number) {
  return ((value % TAU) + TAU) % TAU;
}

function radToDeg(value: number) {
  return Math.round((wrapAngle(value) * 180) / Math.PI);
}

function makeTextSprite(
  text: string,
  color: string,
  scale = 0.68,
  background = "rgba(4, 14, 24, .82)",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(18, 18, 220, 92, 26);
  ctx.fill();
  ctx.strokeStyle = `${color}aa`;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = color;
  const fontSize = text.length > 4 ? 36 : text.length > 2 ? 48 : 62;
  ctx.font = `700 ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale * 2, scale, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function makePoleLabel(label: "N" | "S") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 256);
  ctx.font = "900 188px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0, 0, 0, .32)";
  ctx.lineWidth = 16;
  ctx.strokeText(label, 128, 137);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, 128, 137);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 1.18),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    }),
  );
  mesh.renderOrder = 2;
  return mesh;
}

function cylinderBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 18),
    material,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  return mesh;
}

function makeHandFaceTexture(side: "palm" | "back") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 512);
  ctx.fillStyle = side === "palm" ? "rgba(255, 231, 214, .96)" : "rgba(184, 103, 71, .94)";
  ctx.beginPath();
  ctx.roundRect(38, 42, 436, 428, 88);
  ctx.fill();

  if (side === "palm") {
    ctx.strokeStyle = "rgba(150, 69, 42, .72)";
    ctx.lineWidth = 15;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(255, 255, 135, Math.PI * 0.12, Math.PI * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(235, 275, 92, Math.PI * 1.08, Math.PI * 1.82);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(130, 340);
    ctx.quadraticCurveTo(255, 395, 382, 342);
    ctx.stroke();
    ctx.fillStyle = "#7c2d12";
    ctx.font = "800 94px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("掌心", 256, 265);
  } else {
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "800 92px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("手背", 256, 285);
    ctx.font = "700 38px Arial, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.fillText("指甲这一面", 256, 365);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function palmDepth(side: "palm" | "back", normalizedX: number, normalizedY: number) {
  const center = Math.max(0, 1 - normalizedX * normalizedX - normalizedY * normalizedY);
  if (side === "palm") {
    return 0.11 - 0.1 * Math.pow(center, 1.35);
  }
  return -0.09 - 0.12 * Math.pow(center, 0.82);
}

function makePalmVolumeGeometry() {
  const segmentsX = 8;
  const segmentsY = 10;
  const width = 0.78;
  const height = 0.9;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const addSurface = (side: "palm" | "back") => {
    const offset = vertices.length / 3;
    for (let yIndex = 0; yIndex <= segmentsY; yIndex += 1) {
      const v = yIndex / segmentsY;
      const y = (v - 0.5) * height;
      for (let xIndex = 0; xIndex <= segmentsX; xIndex += 1) {
        const u = xIndex / segmentsX;
        const x = (u - 0.5) * width;
        vertices.push(x, y, palmDepth(side, x / (width / 2), y / (height / 2)));
        uvs.push(side === "back" ? 1 - u : u, v);
      }
    }
    return offset;
  };

  const frontOffset = addSurface("palm");
  const backOffset = addSurface("back");
  const row = segmentsX + 1;

  for (let yIndex = 0; yIndex < segmentsY; yIndex += 1) {
    for (let xIndex = 0; xIndex < segmentsX; xIndex += 1) {
      const a = yIndex * row + xIndex;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(frontOffset + a, frontOffset + b, frontOffset + d, frontOffset + a, frontOffset + d, frontOffset + c);
      indices.push(backOffset + a, backOffset + d, backOffset + b, backOffset + a, backOffset + c, backOffset + d);
    }
  }

  const perimeter: number[] = [];
  for (let xIndex = 0; xIndex < segmentsX; xIndex += 1) perimeter.push(xIndex);
  for (let yIndex = 0; yIndex < segmentsY; yIndex += 1) perimeter.push(yIndex * row + segmentsX);
  for (let xIndex = segmentsX; xIndex > 0; xIndex -= 1) perimeter.push(segmentsY * row + xIndex);
  for (let yIndex = segmentsY; yIndex > 0; yIndex -= 1) perimeter.push(yIndex * row);

  perimeter.forEach((frontIndex, index) => {
    const nextFrontIndex = perimeter[(index + 1) % perimeter.length];
    const backIndex = backOffset + frontIndex;
    const nextBackIndex = backOffset + nextFrontIndex;
    indices.push(frontIndex, backIndex, nextBackIndex, frontIndex, nextBackIndex, nextFrontIndex);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makePalmSurfaceGeometry(side: "palm" | "back") {
  const segmentsX = 10;
  const segmentsY = 12;
  const width = 0.72;
  const height = 0.8;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let yIndex = 0; yIndex <= segmentsY; yIndex += 1) {
    const v = yIndex / segmentsY;
    const y = (v - 0.5) * height - 0.02;
    for (let xIndex = 0; xIndex <= segmentsX; xIndex += 1) {
      const u = xIndex / segmentsX;
      const x = (u - 0.5) * width;
      const surfaceOffset = side === "palm" ? 0.004 : -0.004;
      vertices.push(x, y, palmDepth(side, x / 0.39, y / 0.45) + surfaceOffset);
      uvs.push(side === "back" ? 1 - u : u, v);
    }
  }

  const row = segmentsX + 1;
  for (let yIndex = 0; yIndex < segmentsY; yIndex += 1) {
    for (let xIndex = 0; xIndex < segmentsX; xIndex += 1) {
      const a = yIndex * row + xIndex;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      if (side === "palm") {
        indices.push(a, b, d, a, d, c);
      } else {
        indices.push(a, d, b, a, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeRightHandModel() {
  const hand = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({
    color: 0xf3b58f,
    emissive: 0x572517,
    emissiveIntensity: 0.24,
    metalness: 0.02,
    roughness: 0.62,
  });
  const palm = new THREE.Mesh(makePalmVolumeGeometry(), skin);
  palm.position.y = -0.02;
  palm.castShadow = true;
  hand.add(palm);

  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12), skin);
  knuckle.scale.set(1, 0.42, 0.3);
  knuckle.position.set(0, 0.43, 0);
  hand.add(knuckle);

  const fingerSpecs = [
    { x: -0.3, length: 0.7 },
    { x: -0.1, length: 0.91 },
    { x: 0.1, length: 0.96 },
    { x: 0.3, length: 0.76 },
  ];
  const nailMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff7ed,
    emissive: 0x3b241d,
    emissiveIntensity: 0.12,
    roughness: 0.42,
    side: THREE.FrontSide,
  });
  fingerSpecs.forEach(({ x, length }) => {
    const start = new THREE.Vector3(x, 0.38, 0);
    const end = new THREE.Vector3(x, 0.38 + length, 0);
    const finger = cylinderBetween(start, end, 0.078, skin);
    finger.castShadow = true;
    hand.add(finger);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.079, 14, 10), skin);
    tip.position.copy(end);
    hand.add(tip);
    const nail = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.17), nailMaterial);
    nail.position.set(x, end.y - 0.045, -0.083);
    nail.rotation.y = Math.PI;
    nail.renderOrder = 6;
    hand.add(nail);
  });

  const thumbStart = new THREE.Vector3(0.32, 0.05, 0);
  const thumbEnd = new THREE.Vector3(1.02, 0.09, 0);
  const thumb = cylinderBetween(thumbStart, thumbEnd, 0.11, skin);
  thumb.castShadow = true;
  hand.add(thumb);
  const thumbTip = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 12), skin);
  thumbTip.position.copy(thumbEnd);
  hand.add(thumbTip);
  const thumbNail = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.1), nailMaterial);
  thumbNail.position.set(thumbEnd.x - 0.035, thumbEnd.y, -0.116);
  thumbNail.rotation.y = Math.PI;
  thumbNail.renderOrder = 6;
  hand.add(thumbNail);

  const wrist = cylinderBetween(
    new THREE.Vector3(0, -0.42, 0),
    new THREE.Vector3(0, -0.98, 0),
    0.23,
    skin,
  );
  wrist.castShadow = true;
  hand.add(wrist);

  const palmFace = new THREE.Mesh(
    makePalmSurfaceGeometry("palm"),
    new THREE.MeshBasicMaterial({
      map: makeHandFaceTexture("palm"),
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
    }),
  );
  palmFace.renderOrder = 5;
  hand.add(palmFace);

  const backFace = new THREE.Mesh(
    makePalmSurfaceGeometry("back"),
    new THREE.MeshBasicMaterial({
      map: makeHandFaceTexture("back"),
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
    }),
  );
  backFace.renderOrder = 5;
  hand.add(backFace);

  hand.scale.setScalar(0.62);
  return hand;
}

function pointOnLoop(progress: number) {
  const a = 1.42;
  const h = 2.05;
  const p = ((progress % 1) + 1) % 1;
  const side = p * 4;
  if (side < 1) return new THREE.Vector3(0, -h + side * 2 * h, -a);
  if (side < 2) return new THREE.Vector3(0, h, -a + (side - 1) * 2 * a);
  if (side < 3) return new THREE.Vector3(0, h - (side - 2) * 2 * h, a);
  return new THREE.Vector3(0, -h, a - (side - 3) * 2 * a);
}

function GeneratorScene({
  angleRef,
  settingsRef,
  onAngleUpdate,
  viewRequest,
}: {
  angleRef: React.MutableRefObject<number>;
  settingsRef: React.MutableRefObject<SceneSettings>;
  onAngleUpdate: (angle: number) => void;
  viewRequest: { name: ViewName; nonce: number };
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const panRef = useRef({ x: 0, y: 0 });

  const updatePanX = (value: number) => {
    panRef.current.x = value;
    setPanX(value);
  };

  const updatePanY = (value: number) => {
    panRef.current.y = value;
    setPanY(value);
  };

  const applyView = useCallback((name: ViewName) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const positions: Record<ViewName, THREE.Vector3> = {
      best: new THREE.Vector3(8.8, 5.2, 8.6),
      axis: new THREE.Vector3(0.01, 9.8, 0.01),
      field: new THREE.Vector3(10.8, 1.4, 0.01),
    };
    camera.position.copy(positions[name]);
    camera.up.set(0, 1, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  }, []);

  useEffect(() => {
    applyView(viewRequest.name);
  }, [applyView, viewRequest]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06121d);
    scene.fog = new THREE.Fog(0x06121d, 13, 24);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(8.8, 5.2, 8.6);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      const fallbackTimer = window.setTimeout(() => setWebglFailed(true), 0);
      return () => window.clearTimeout(fallbackTimer);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.zoomSpeed = 1.15;
    controls.minDistance = 1.8;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.target.set(0, 0, 0);
    controls.update();
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xaedfff, 0x071017, 1.3));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(5, 8, 7);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x22d3ee, 25, 18);
    rimLight.position.set(-1, 3, -5);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(10, 80),
      new THREE.MeshStandardMaterial({
        color: 0x071a28,
        metalness: 0.35,
        roughness: 0.8,
        transparent: true,
        opacity: 0.82,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.72;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(15, 30, 0x17445a, 0x0d2b3a);
    grid.position.y = -2.7;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.38;
    scene.add(grid);

    const redMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x4b0909,
      emissiveIntensity: 0.65,
      metalness: 0.3,
      roughness: 0.32,
    });
    const blueMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      emissive: 0x061f63,
      emissiveIntensity: 0.75,
      metalness: 0.3,
      roughness: 0.32,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x1b3546,
      metalness: 0.75,
      roughness: 0.3,
    });

    const addMagnet = (x: number, material: THREE.MeshStandardMaterial, label: "N" | "S") => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.55, 5.15, 4.7), material);
      body.position.set(x, 0, 0);
      body.castShadow = true;
      body.receiveShadow = true;
      scene.add(body);

      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.78, 3.7, 3.5), material);
      pole.position.set(x + (label === "N" ? 1.1 : -1.1), 0, 0);
      pole.castShadow = true;
      scene.add(pole);

      const back = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5.4, 4.95), darkMetal);
      back.position.set(x + (label === "N" ? -0.86 : 0.86), 0, 0);
      scene.add(back);

      const surfaceLabel = makePoleLabel(label);
      surfaceLabel.position.set(x + (label === "N" ? 1.1 : -1.1), 0, 1.761);
      scene.add(surfaceLabel);
    };
    addMagnet(-4.45, redMat, "N");
    addMagnet(4.45, blueMat, "S");

    const fieldGroup = new THREE.Group();
    scene.add(fieldGroup);
    const fieldMaterial = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.48,
    });
    const yRows = [-1.55, -0.75, 0, 0.75, 1.55];
    const zRows = [-1.22, 0, 1.22];
    yRows.forEach((y) => {
      zRows.forEach((z) => {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-3.15, y, z),
          new THREE.Vector3(3.15, y, z),
        ]);
        fieldGroup.add(new THREE.Line(geometry, fieldMaterial));
        const arrow = new THREE.ArrowHelper(
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(-0.5, y, z),
          1.05,
          0x38bdf8,
          0.26,
          0.16,
        );
        fieldGroup.add(arrow);
      });
    });

    const axis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 5.6, 24),
      darkMetal,
    );
    axis.castShadow = true;
    scene.add(axis);
    [-2.48, 2.48].forEach((y) => {
      const bearing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.24, 28),
        darkMetal,
      );
      bearing.position.y = y;
      scene.add(bearing);
    });

    const coilGroup = new THREE.Group();
    scene.add(coilGroup);
    const copper = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0x7c2d12,
      emissiveIntensity: 0.56,
      metalness: 0.82,
      roughness: 0.22,
    });
    const corners = [
      new THREE.Vector3(0, -2.05, -1.42),
      new THREE.Vector3(0, 2.05, -1.42),
      new THREE.Vector3(0, 2.05, 1.42),
      new THREE.Vector3(0, -2.05, 1.42),
    ];
    corners.forEach((point, index) => {
      const edge = cylinderBetween(point, corners[(index + 1) % 4], 0.075, copper);
      edge.castShadow = true;
      coilGroup.add(edge);
    });

    const aLabel = makeTextSprite("A", "#fde68a", 0.46);
    aLabel.position.set(0, 0, -1.42);
    coilGroup.add(aLabel);
    const bLabel = makeTextSprite("B", "#fde68a", 0.46);
    bLabel.position.set(0, 0, 1.42);
    coilGroup.add(bLabel);

    const currentParticles: THREE.Mesh[] = [];
    const currentMaterial = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 1,
    });
    for (let i = 0; i < 18; i += 1) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.078, 12, 12), currentMaterial.clone());
      coilGroup.add(dot);
      currentParticles.push(dot);
    }

    const sideAOrigin = new THREE.Vector3();
    const sideBOrigin = new THREE.Vector3();
    const velocityParallelB = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), sideBOrigin, 1, 0xa78bfa, 0.25, 0.16);
    const velocityPerpB = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), sideBOrigin, 1, 0xfb923c, 0.25, 0.16);
    const velocityResultantB = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), sideBOrigin, 1, 0xf8fafc, 0.27, 0.17);
    const velocityParallelBLabel = makeTextSprite("v∥", "#ddd6fe", 0.3, "#312e81dc");
    const velocityPerpBLabel = makeTextSprite("v⊥", "#fed7aa", 0.3, "#7c2d12dc");
    const velocityResultantBLabel = makeTextSprite("v", "#f8fafc", 0.3, "#334155dc");
    const currentA = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), sideAOrigin, 1.15, 0x4ade80, 0.25, 0.16);
    const currentB = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), sideBOrigin, 1.15, 0x4ade80, 0.25, 0.16);
    scene.add(
      velocityParallelB,
      velocityPerpB,
      velocityResultantB,
      velocityParallelBLabel,
      velocityPerpBLabel,
      velocityResultantBLabel,
      currentA,
      currentB,
    );

    const ruleGroup = new THREE.Group();
    scene.add(ruleGroup);
    const rightHand = makeRightHandModel();
    ruleGroup.add(rightHand);

    let frame = 0;
    let last = performance.now();
    let lastUi = 0;
    let currentFlow = 0;
    const appliedPan = new THREE.Vector2();

    const resize = () => {
      const { clientWidth, clientHeight } = mount;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const settings = settingsRef.current;
      let angle = angleRef.current;
      if (settings.playing) {
        const omega = (settings.rpm * TAU) / 60;
        angle = wrapAngle(angle + omega * dt);
        angleRef.current = angle;
      }
      if (now - lastUi > 45) {
        onAngleUpdate(angle);
        lastUi = now;
      }

      coilGroup.rotation.y = angle;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      const magnitude = Math.abs(sin);
      const u = new THREE.Vector3(sin, 0, cos);
      const sideA = u.clone().multiplyScalar(-1.42);
      const sideB = u.clone().multiplyScalar(1.42);
      sideA.y = 0;
      sideB.y = 0;
      const bTeachingAnchor = sideB.clone().add(new THREE.Vector3(0, 2.35, 0));

      const parallelMagnitude = Math.abs(cos);
      const perpendicularMagnitude = Math.abs(sin);
      const speedLength = 1.05 + Math.min(settings.rpm, 20) / 50;
      const parallelLength = parallelMagnitude * speedLength;
      const perpendicularLength = perpendicularMagnitude * speedLength;
      const parallelDirectionB = new THREE.Vector3(cos >= 0 ? 1 : -1, 0, 0);
      const perpendicularDirectionB = new THREE.Vector3(0, 0, sin >= 0 ? -1 : 1);
      const resultantDirectionB = new THREE.Vector3(cos, 0, -sin);
      const velocityOriginB = bTeachingAnchor;

      velocityParallelB.position.copy(velocityOriginB);
      velocityPerpB.position.copy(velocityOriginB);
      velocityResultantB.position.copy(velocityOriginB);
      velocityParallelB.setDirection(parallelDirectionB);
      velocityPerpB.setDirection(perpendicularDirectionB);
      velocityResultantB.setDirection(resultantDirectionB);
      velocityParallelB.setLength(parallelLength, Math.min(0.25, parallelLength * 0.35), Math.min(0.16, parallelLength * 0.22));
      velocityPerpB.setLength(perpendicularLength, Math.min(0.25, perpendicularLength * 0.35), Math.min(0.16, perpendicularLength * 0.22));
      velocityResultantB.setLength(speedLength, 0.27, 0.17);

      const parallelVisible = parallelMagnitude > 0.035;
      const perpendicularVisible = perpendicularMagnitude > 0.035;
      velocityParallelB.visible = parallelVisible;
      velocityParallelBLabel.visible = parallelVisible;
      velocityPerpB.visible = perpendicularVisible;
      velocityPerpBLabel.visible = perpendicularVisible;
      velocityParallelBLabel.position.copy(velocityOriginB).addScaledVector(parallelDirectionB, parallelLength + 0.25).add(new THREE.Vector3(0, 0.22, 0));
      velocityPerpBLabel.position.copy(velocityOriginB).addScaledVector(perpendicularDirectionB, perpendicularLength + 0.25).add(new THREE.Vector3(0, -0.22, 0));
      velocityResultantBLabel.position.copy(velocityOriginB).addScaledVector(resultantDirectionB, speedLength + 0.28).add(new THREE.Vector3(0, 0.38, 0));

      const currentVisible = settings.showCurrent && magnitude > 0.035;
      currentA.visible = currentVisible;
      currentB.visible = currentVisible;
      currentA.position.copy(sideA).add(new THREE.Vector3(0, -0.58, 0));
      currentB.position.copy(sideB).add(new THREE.Vector3(0, 0.58, 0));
      currentA.setDirection(new THREE.Vector3(0, sin >= 0 ? 1 : -1, 0));
      currentB.setDirection(new THREE.Vector3(0, sin >= 0 ? -1 : 1, 0));
      currentA.setLength(0.72 + magnitude * 0.72, 0.25, 0.16);
      currentB.setLength(0.72 + magnitude * 0.72, 0.25, 0.16);

      currentFlow += dt * settings.currentFlowSpeed * (0.12 + 0.88 * magnitude) * (sin >= 0 ? 1 : -1);
      currentParticles.forEach((dot, index) => {
        dot.position.copy(pointOnLoop(index / currentParticles.length + currentFlow));
        dot.visible = currentVisible;
        (dot.material as THREE.MeshBasicMaterial).opacity = 0.25 + magnitude * 0.75;
        dot.scale.setScalar(0.72 + magnitude * 0.42);
      });

      fieldGroup.visible = settings.showField;
      (fieldMaterial as THREE.LineBasicMaterial).opacity = 0.22 + settings.fieldStrength * 0.32;

      const ruleVisible = settings.showRule && magnitude > 0.04;
      ruleGroup.visible = ruleVisible;
      if (ruleVisible) {
        const magneticDirection = new THREE.Vector3(1, 0, 0);
        const perpendicularVelocity = new THREE.Vector3(0, 0, sin >= 0 ? -1 : 1);
        const currentDirection = new THREE.Vector3(0, sin >= 0 ? -1 : 1, 0);
        const palmNormal = magneticDirection.clone().negate();
        const handPosition = bTeachingAnchor
          .clone()
          .addScaledVector(palmNormal, -0.16);
        const handBasis = new THREE.Matrix4().makeBasis(
          perpendicularVelocity,
          currentDirection,
          palmNormal,
        );
        rightHand.position.copy(handPosition);
        rightHand.quaternion.setFromRotationMatrix(handBasis);

      }

      const requestedPan = panRef.current;
      const panDeltaX = requestedPan.x - appliedPan.x;
      const panDeltaY = requestedPan.y - appliedPan.y;
      if (panDeltaX !== 0 || panDeltaY !== 0) {
        camera.position.x += panDeltaX;
        camera.position.y += panDeltaY;
        controls.target.x += panDeltaX;
        controls.target.y += panDeltaY;
        appliedPan.set(requestedPan.x, requestedPan.y);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry?.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material?.dispose());
        }
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, [angleRef, onAngleUpdate, settingsRef]);

  return (
    <div className="scene-wrap">
      <div ref={mountRef} className="scene-canvas" aria-label="可拖动观察的单匝线圈发电机三维模型" />
      <div className="scene-pan-control scene-pan-x" aria-label="水平移动动画观察位置">
        <span aria-hidden="true">←</span>
        <input
          type="range"
          min="-4"
          max="4"
          step="0.05"
          value={panX}
          onChange={(event) => updatePanX(Number(event.target.value))}
          aria-label="水平移动"
        />
        <span aria-hidden="true">→</span>
      </div>
      <div className="scene-pan-control scene-pan-y" aria-label="垂直移动动画观察位置">
        <span aria-hidden="true">↑</span>
        <input
          type="range"
          min="-4"
          max="4"
          step="0.05"
          value={panY}
          onChange={(event) => updatePanY(Number(event.target.value))}
          aria-label="垂直移动"
        />
        <span aria-hidden="true">↓</span>
      </div>
      {webglFailed && (
        <div className="webgl-fallback" aria-label="三维模型静态示意">
          <div className="fallback-field"><span>磁场 B</span><i>→</i><i>→</i><i>→</i></div>
          <div className="fallback-magnet north">N</div>
          <div className="fallback-coil"><i className="current-one" /><i className="current-two" /><b>A</b><strong>B</strong></div>
          <div className="fallback-axis" />
          <div className="fallback-hand" aria-hidden="true">
            <i /><i /><i /><i /><b>右手</b><span />
          </div>
          <div className="fallback-magnet south">S</div>
          <p>当前预览环境未开启 3D 图形加速；在普通浏览器中将显示可旋转的完整三维动画。</p>
        </div>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? "is-on" : ""}`}
      onClick={onChange}
      aria-pressed={checked}
      aria-label={`${checked ? "隐藏" : "显示"}${label}`}
    >
      <span className="toggle-track"><span /></span>
      {label}
    </button>
  );
}

export default function Home() {
  const [playing, setPlaying] = useState(true);
  const [rpm, setRpm] = useState(3);
  const [currentFlowSpeed, setCurrentFlowSpeed] = useState(0.15);
  const [fieldStrength, setFieldStrength] = useState(0.8);
  const showField = true;
  const showCurrent = true;
  const [showRule, setShowRule] = useState(true);
  const [angle, setAngle] = useState(Math.PI / 4);
  const [viewRequest] = useState<{ name: ViewName; nonce: number }>({ name: "best", nonce: 0 });
  const angleRef = useRef(angle);
  const settingsRef = useRef<SceneSettings>({ playing, rpm, currentFlowSpeed, fieldStrength, showField, showCurrent, showRule });

  useEffect(() => {
    settingsRef.current = { playing, rpm, currentFlowSpeed, fieldStrength, showField, showCurrent, showRule };
  }, [playing, rpm, currentFlowSpeed, fieldStrength, showField, showCurrent, showRule]);

  const onAngleUpdate = useCallback((nextAngle: number) => setAngle(nextAngle), []);
  const setExactAngle = (degrees: number) => {
    const next = (degrees / 180) * Math.PI;
    angleRef.current = next;
    setAngle(next);
  };

  const togglePlaying = () => {
    setPlaying((value) => {
      const next = !value;
      settingsRef.current.playing = next;
      return next;
    });
  };

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#lab" aria-label="返回实验台顶部">
          <span className="brand-mark">动</span>
          <span><b>动量物理</b><small>发电机 3D</small></span>
        </a>
      </header>

      <section id="lab" className="lab-layout">
        <div className="stage-panel">
          <GeneratorScene
            angleRef={angleRef}
            settingsRef={settingsRef}
            onAngleUpdate={onAngleUpdate}
            viewRequest={viewRequest}
          />
        </div>

        <aside className="control-panel" aria-label="实验控制面板">
          <div className="pause-control">
            <div><span>动画状态</span><strong>{playing ? "运行中" : "已暂停"}</strong></div>
            <button type="button" onClick={togglePlaying}>
              {playing ? "Ⅱ 暂停" : "▶ 继续"}
            </button>
          </div>

          <div className="range-group">
            <label htmlFor="angle-range"><span>线圈转角 θ</span><b>{radToDeg(angle)}°</b></label>
            <input
              id="angle-range"
              type="range"
              min="0"
              max="360"
              step="1"
              value={radToDeg(angle)}
              onChange={(event) => setExactAngle(Number(event.target.value))}
            />
          </div>

          <div className="range-grid">
            <div className="range-group compact">
              <label htmlFor="speed-range"><span>线圈转速</span><b>{rpm.toFixed(1)} rpm</b></label>
              <input id="speed-range" type="range" min="0.1" max="20" step="0.1" value={rpm} onChange={(e) => setRpm(Number(e.target.value))} />
            </div>
            <div className="range-group compact">
              <label htmlFor="current-speed-range"><span>电流粒子速度</span><b>{currentFlowSpeed.toFixed(2)}×</b></label>
              <input id="current-speed-range" type="range" min="0.01" max="1" step="0.01" value={currentFlowSpeed} onChange={(e) => setCurrentFlowSpeed(Number(e.target.value))} />
            </div>
            <div className="range-group compact full-range">
              <label htmlFor="field-range"><span>磁感应强度</span><b>{fieldStrength.toFixed(1)} T</b></label>
              <input id="field-range" type="range" min="0.2" max="1.4" step="0.1" value={fieldStrength} onChange={(e) => setFieldStrength(Number(e.target.value))} />
            </div>
          </div>

          <div className="toggles">
            <Toggle checked={showRule} onChange={() => setShowRule((v) => !v)} label="3D 右手" />
          </div>
        </aside>
      </section>
    </main>
  );
}
