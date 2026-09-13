"use strict";
/* ================= 库仑扭秤实验 3D 模拟 =================
 * 教学流程（自动演示，可用控制条暂停/重播）：
 *  第一步：C 球充电 → C 与 A 接触起电（A 带上同种电荷）→ 分开后两球排斥，A 偏转。
 *  第二步：保持 qA、qC 不变，探究 F 与距离 r 的关系：
 *    C 依次放在 r、r/2、r/4 处，A 偏转后用手逆时针转旋钮使 A 回原点，
 *    旋钮转角依次为 θ、4θ、16θ ⟹ F ∝ 1/r²。
 *  第三步：保持 r、qA 不变，探究 F 与电荷量的关系：
 *    第 1 次：C（电荷量 q）放在 r 处 → 转旋钮归零，转角为 θ；
 *    用与 C 完全相同的不带电小球 D 碰 C，qC 减半（q/2）→ 归零转角 θ/2；
 *    再次用 D（已放电）碰 C，qC 变为 q/4 → 归零转角 θ/4 ⟹ F ∝ qC。
 *  旋钮转角（= 悬丝扭转角）的大小反映库仑力的大小；A 的偏转角只作演示，不记录。
 *  注：C 球进入装置后始终与 A 在同一圆周上（到悬丝轴的距离都等于 R）。
 */

// ---------- 常量 ----------
var Q0    = 1.0e-7;        // 起电电荷量 q₀ (C)
var R_M   = 0.10;          // A、C 圆周半径 10 cm（两球到悬丝轴的距离）
var BALLR_M  = 0.006;      // 小球 A 半径 0.6 cm（教学放大）
var BALLRC_M = 0.011;      // 小球 C 半径 1.1 cm（教学放大）
var TH0   = 2 * Math.asin((BALLR_M + BALLRC_M) / (2 * R_M)); // A 的原点角（接触位 ≈ 9.7°）
var DEG   = Math.PI / 180;

// ---------- 实验参数 ----------
var R_EXP   = 0.14;        // 第 1 次 A、C 距离 r = 14 cm（第 2、3 次为 r/2、r/4）
var THETA_D = 10;          // 第 1 次旋钮转角 θ = 10°（距离实验为 4θ、16θ；电荷量实验为 θ/2、θ/4）
var BETAS_D = [6, 20, 60]; // 距离实验三次 A 的偏转角（每次不同；小于对应旋钮角：偏转时 A 远离 C、力变小）
var BETAS_Q = [6, 3, 1.5]; // 电荷量实验三次 A 的偏转角（越来越小；同样小于对应旋钮角）
var RAD_OUT = 1.6;         // C 移出装置时的径向外移量（球心距轴 2.0+1.6=3.6 单位=18 cm）

// ---------- 场景尺寸（1 单位 = 5 cm） ----------
var SU = 20;
var RU = R_M * SU;         // 圆周半径 2.0
var BU = BALLR_M * SU;     // A 球半径 0.12
var BUC = BALLRC_M * SU;   // C 球半径 0.22
var ROD_Y = 1.0;           // 绝缘棒高度

// C 与 A 在同一圆周上（半径 R_M）。C 的位置 = 角度 cPsi + 径向外移 cRad（0=在圆周上）。
// 由目标弦距 r 反推 C 的角位置：弦长 r = 2·R·sin(Δθ/2)，C 在 A 的另一侧（Δθ = TH0 − cPsi）
function psiForDist(rM) { return TH0 - 2 * Math.asin(rM / (2 * R_M)); }
var PSI_R  = psiForDist(R_EXP);      // r  = 14 cm → 与 A 相隔 ≈ 88.9°
var PSI_R2 = psiForDist(R_EXP / 2);  // r/2 = 7 cm  → ≈ 41.0°
var PSI_R4 = psiForDist(R_EXP / 4);  // r/4 = 3.5 cm → ≈ 20.2°
var PSI_OUT = 0;           // C 在装置外的停靠角（+x 方向）

// 辅助小球 D（与 C 完全相同，使 qC 减半用）：在装置外沿 z 轴滑动去碰 C
var DZ_OUT   = 1.2;        // D 的待机位置（保持在画面内）
var DZ_TOUCH = 2 * BUC;    // D 与 C 表面接触时的 z 坐标

// A 偏转的弹簧阻尼参数（产生自然的回摆效果）
var OMEGA = 4.2, ZETA = 0.4;

// ---------- 状态 ----------
var state = {
  qA: 0, qC: 0, qD: 0,     // 电荷量 (C)
  beta: 0, betaV: 0, betaT: 0, // A 相对原点的偏转角、角速度、弹簧目标角 (rad)
  phi: 0,                    // 旋钮转角 (rad，负值 = 逆时针)
  cPsi: PSI_OUT,             // C 的角位置 (rad)
  cRad: RAD_OUT,             // C 的径向外移量（场景单位，0=在圆周上）
  dZ: DZ_OUT,                // D 的 z 坐标（场景单位）
  spring: false,             // 是否启用偏转弹簧（转旋钮时改为直接插值）
  handT: 0,                  // 手的就位程度 0=隐藏 1=握住旋钮
  rText: null,               // r 标注文字（"r" / "r/2" / "r/4" / null）
  forceRel: 0,               // 库仑力相对大小（控制箭头长度）
  sparkT: 0, sparkPos: null
};

// ---------- 渲染器 / 场景 / 相机 ----------
if (typeof THREE === "undefined") {
  document.getElementById("hint").innerHTML = "<b>错误：</b>未找到 three.min.js，请确认它与本文件在同一文件夹内。";
  throw new Error("three.min.js missing");
}
var container = document.getElementById("scene");
var renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(980, 860);
renderer.shadowMap.enabled = false;
container.appendChild(renderer.domElement);

var scene = new THREE.Scene();
scene.background = new THREE.Color(0xf7fafc);

var camera = new THREE.PerspectiveCamera(45, 980 / 860, 0.1, 100);
var camAz = 0.85, camPol = 1.22, camDist = 12.5, camTarget = new THREE.Vector3(0, 1.4, 0);
function updateCamera() {
  camera.position.set(
    camTarget.x + camDist * Math.sin(camPol) * Math.sin(camAz),
    camTarget.y + camDist * Math.cos(camPol),
    camTarget.z + camDist * Math.sin(camPol) * Math.cos(camAz)
  );
  camera.lookAt(camTarget);
}
updateCamera();

// 鼠标/触摸 轨道控制
(function () {
  var dragging = false, lx = 0, ly = 0, pinch = 0;
  var el = renderer.domElement;
  el.addEventListener("mousedown", function (e) { dragging = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    camAz -= (e.clientX - lx) * 0.005;
    camPol = Math.min(1.5, Math.max(0.15, camPol - (e.clientY - ly) * 0.005));
    lx = e.clientX; ly = e.clientY; updateCamera();
  });
  window.addEventListener("mouseup", function () { dragging = false; });
  el.addEventListener("wheel", function (e) {
    e.preventDefault();
    camDist = Math.min(20, Math.max(4.5, camDist * (1 + e.deltaY * 0.001)));
    updateCamera();
  }, { passive: false });
  el.addEventListener("touchstart", function (e) {
    if (e.touches.length === 1) { dragging = true; lx = e.touches[0].clientX; ly = e.touches[0].clientY; }
    if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  }, { passive: true });
  el.addEventListener("touchmove", function (e) {
    e.preventDefault();
    if (e.touches.length === 1 && dragging) {
      camAz -= (e.touches[0].clientX - lx) * 0.006;
      camPol = Math.min(1.5, Math.max(0.15, camPol - (e.touches[0].clientY - ly) * 0.006));
      lx = e.touches[0].clientX; ly = e.touches[0].clientY; updateCamera();
    } else if (e.touches.length === 2) {
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      camDist = Math.min(20, Math.max(4.5, camDist * pinch / d)); pinch = d; updateCamera();
    }
  }, { passive: false });
  el.addEventListener("touchend", function () { dragging = false; });
})();

// ---------- 灯光 ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
var dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
dirLight.position.set(6, 10, 5);
scene.add(dirLight);
var fillLight = new THREE.DirectionalLight(0xdfefff, 0.25);
fillLight.position.set(-6, 4, -5);
scene.add(fillLight);

// ---------- 材质 ----------
var matCopper = new THREE.MeshStandardMaterial({ color: 0xb0713f, metalness: 0.6, roughness: 0.5 });
var matDarkM  = new THREE.MeshStandardMaterial({ color: 0x5b6470, metalness: 0.8, roughness: 0.4 });
var matWood   = new THREE.MeshStandardMaterial({ color: 0x8a5a33, metalness: 0.1, roughness: 0.75 });
var matInsul  = new THREE.MeshStandardMaterial({ color: 0xf0e6c0, metalness: 0.0, roughness: 0.8 });
var matCharged = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.35, roughness: 0.4 });
var matNeutral = new THREE.MeshStandardMaterial({ color: 0x8fa3b8, metalness: 0.5, roughness: 0.45 });
var matGlass  = new THREE.MeshPhysicalMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.16, roughness: 0.06, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
var matSkin   = new THREE.MeshStandardMaterial({ color: 0xf2c19b, metalness: 0.0, roughness: 0.65 });

function addMesh(geo, mat, x, y, z, parent, shadow) {
  var m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
  (parent || scene).add(m);
  return m;
}

// ---------- 地面 / 底座 ----------
var ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0xe9eef4, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

addMesh(new THREE.CylinderGeometry(3.5, 3.7, 0.22, 48), matWood, 0, 0.11, 0);        // 木底座
addMesh(new THREE.CylinderGeometry(3.1, 3.2, 0.10, 48), matCopper, 0, 0.27, 0);      // 铜垫板

// ---------- 外罩框架 ----------
var HEAD_Y = 4.9;            // 扭秤头（旋钮）高度：装置整体压矮
var COVER_TOP = HEAD_Y - 2.10;
addMesh(new THREE.TorusGeometry(2.6, 0.06, 12, 64), matCopper, 0, 0.36, 0).rotation.x = Math.PI / 2; // 下铜圈
addMesh(new THREE.TorusGeometry(2.6, 0.06, 12, 64), matCopper, 0, COVER_TOP, 0).rotation.x = Math.PI / 2; // 上铜圈

// ---------- 刻度盘 ----------
function makeScaleTexture() {
  var cv = document.createElement("canvas"); cv.width = cv.height = 1024;
  var ctx = cv.getContext("2d");
  var cx = 512, cy = 512, px = 1024 / 5.0;
  ctx.clearRect(0, 0, 1024, 1024);
  ctx.fillStyle = "rgba(230,238,246,0.92)";
  ctx.beginPath(); ctx.arc(cx, cy, 2.5 * px, 0, 7); ctx.fill();
  ctx.strokeStyle = "#8aa0b4"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 2.5 * px, 0, 7); ctx.stroke();
  ctx.fillStyle = "#33475b"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (var d = 0; d < 360; d += 2) {
    var a = d * Math.PI / 180;
    var major = d % 10 === 0;
    var r1 = (major ? 2.26 : 2.36) * px, r2 = 2.48 * px;
    ctx.strokeStyle = major ? "#33475b" : "#94a3b8";
    ctx.lineWidth = major ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
    ctx.lineTo(cx + r2 * Math.cos(a), cy + r2 * Math.sin(a));
    ctx.stroke();
    if (d % 30 === 0) {
      ctx.font = "bold 26px Microsoft YaHei, sans-serif";
      var rl = 2.05 * px;
      ctx.fillText(d + "°", cx + rl * Math.cos(a), cy + rl * Math.sin(a));
    }
  }
  return new THREE.CanvasTexture(cv);
}
var scalePlane = new THREE.Mesh(new THREE.PlaneGeometry(5, 5),
  new THREE.MeshStandardMaterial({ map: makeScaleTexture(), transparent: true, roughness: 0.9 }));
scalePlane.rotation.x = -Math.PI / 2;
scalePlane.position.y = 0.395;
scalePlane.receiveShadow = true;
scene.add(scalePlane);

// ---------- 顶部：盖板、立管、扭秤头 ----------
addMesh(new THREE.CylinderGeometry(2.7, 2.7, 0.08, 48), matCopper, 0, HEAD_Y - 2.02, 0);       // 顶盖
var tube = addMesh(new THREE.CylinderGeometry(0.17, 0.17, 1.75, 24, 1, true), matGlass, 0, HEAD_Y - 1.10, 0, scene, false);
tube.renderOrder = 5;
addMesh(new THREE.CylinderGeometry(0.22, 0.26, 0.14, 24), matCopper, 0, HEAD_Y - 1.96, 0);     // 管座
addMesh(new THREE.CylinderGeometry(0.6, 0.65, 0.10, 32), matCopper, 0, HEAD_Y - 0.17, 0);      // 头部底盘

// 头部刻度盘（顶面）
function makeDialTexture() {
  var cv = document.createElement("canvas"); cv.width = cv.height = 512;
  var ctx = cv.getContext("2d"); var cx = 256, cy = 256;
  ctx.fillStyle = "#f4f0e4"; ctx.beginPath(); ctx.arc(cx, cy, 250, 0, 7); ctx.fill();
  ctx.strokeStyle = "#7a6a4a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 248, 0, 7); ctx.stroke();
  ctx.fillStyle = "#4a3f28"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (var d = 0; d < 360; d += 5) {
    var a = d * Math.PI / 180;
    var major = d % 30 === 0;
    var r1 = major ? 205 : 222, r2 = 242;
    ctx.strokeStyle = "#4a3f28"; ctx.lineWidth = major ? 4 : 2;
    ctx.beginPath(); ctx.moveTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)); ctx.lineTo(cx + r2 * Math.cos(a), cy + r2 * Math.sin(a)); ctx.stroke();
    if (major) { ctx.font = "bold 30px sans-serif"; ctx.fillText(String(d), cx + 175 * Math.cos(a), cy + 175 * Math.sin(a)); }
  }
  return new THREE.CanvasTexture(cv);
}
var dial = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48),
  new THREE.MeshStandardMaterial({ map: makeDialTexture(), roughness: 0.8 }));
dial.rotation.x = -Math.PI / 2; dial.position.y = HEAD_Y - 0.115; scene.add(dial);

// 旋钮（随 φ 转动）
var headGroup = new THREE.Group(); headGroup.position.y = HEAD_Y; scene.add(headGroup);
addMesh(new THREE.CylinderGeometry(0.34, 0.38, 0.22, 32), matDarkM, 0, 0, 0, headGroup);
addMesh(new THREE.CylinderGeometry(0.10, 0.10, 0.16, 16), matDarkM, 0, 0.18, 0, headGroup);
var pointer = addMesh(new THREE.BoxGeometry(0.5, 0.035, 0.07), new THREE.MeshStandardMaterial({ color: 0xe11d48 }), 0.25, -0.09, 0, headGroup, false);

// ---------- 悬丝 ----------
var wireTop = HEAD_Y - 0.10, wireBot = ROD_Y;
var wire = addMesh(new THREE.CylinderGeometry(0.012, 0.012, wireTop - wireBot, 8),
  new THREE.MeshStandardMaterial({ color: 0xd7dde5, metalness: 0.9, roughness: 0.3 }),
  0, (wireTop + wireBot) / 2, 0, scene, false);

// ---------- 绝缘棒 + 小球 A + 平衡物 B（随 θ 转动） ----------
var beamGroup = new THREE.Group(); beamGroup.position.y = ROD_Y; scene.add(beamGroup);
var beam = addMesh(new THREE.CylinderGeometry(0.035, 0.035, 2 * (RU + 0.35), 12), matInsul, 0, 0, 0, beamGroup);
beam.rotation.z = Math.PI / 2;
var ballA = addMesh(new THREE.SphereGeometry(BU, 32, 24), matCharged, RU, 0, 0, beamGroup);
addMesh(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 8), matInsul, RU, -0.13, 0, beamGroup);
var ballB = addMesh(new THREE.SphereGeometry(BU * 1.35, 32, 24), matNeutral, -RU, 0, 0, beamGroup);

// ---------- 小球 C 及其绝缘柄 ----------
// cGroup 控制角位置（rotation.y = −cPsi），cSlide 控制径向进出（position.x = cRad）
var cGroup = new THREE.Group(); scene.add(cGroup);
var cSlide = new THREE.Group(); cGroup.add(cSlide);
var ballC = addMesh(new THREE.SphereGeometry(BUC, 32, 24), matCopper, RU, ROD_Y, 0, cSlide);
var rodC = addMesh(new THREE.CylinderGeometry(0.045, 0.045, 2.6, 12), matInsul, RU + 1.42, ROD_Y, 0, cSlide);
rodC.rotation.z = Math.PI / 2;
addMesh(new THREE.CylinderGeometry(0.09, 0.09, 0.35, 16), matWood, RU + 2.75, ROD_Y, 0, cSlide).rotation.z = Math.PI / 2; // 手柄

// ---------- 小球标签 ----------
function makeLabelSprite(text, bg) {
  var cv = document.createElement("canvas"); cv.width = cv.height = 128;
  var ctx = cv.getContext("2d");
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(64, 64, 54, 0, 7); ctx.fill();
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6; ctx.stroke();
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 68px Microsoft YaHei, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 68);
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
  sp.renderOrder = 8;
  return sp;
}
var labelA = makeLabelSprite("A", "#dc2626");
labelA.scale.set(0.32, 0.32, 1); labelA.position.set(RU, BU + 0.30, 0); beamGroup.add(labelA);
var labelB = makeLabelSprite("B", "#64748b");
labelB.scale.set(0.32, 0.32, 1); labelB.position.set(-RU, BU * 1.35 + 0.30, 0); beamGroup.add(labelB);
var labelC = makeLabelSprite("C", "#b0713f");
labelC.scale.set(0.42, 0.42, 1); labelC.position.set(RU, ROD_Y + BUC + 0.34, 0); cSlide.add(labelC);

// ---------- 电荷 "+" 符号 ----------
function makePlusTexture() {
  var cv = document.createElement("canvas"); cv.width = cv.height = 64;
  var ctx = cv.getContext("2d");
  ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 11; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(32, 12); ctx.lineTo(32, 52); ctx.moveTo(12, 32); ctx.lineTo(52, 32); ctx.stroke();
  return new THREE.CanvasTexture(cv);
}
var plusTex = makePlusTexture();
var fibDirs = [];
(function () {
  for (var i = 0; i < 8; i++) {
    var y = 1 - (i / 7) * 2, r = Math.sqrt(1 - y * y), t = i * 2.399963;
    fibDirs.push(new THREE.Vector3(r * Math.cos(t), y, r * Math.sin(t)));
  }
})();
function makePlusGroup(parent, cx, cy, cz, br) {
  var sprites = [];
  var s = 0.09 * br / BU;
  for (var i = 0; i < 8; i++) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: plusTex, depthTest: false }));
    sp.scale.set(s, s, 1);
    sp.position.set(cx + fibDirs[i].x * br * 1.35, cy + fibDirs[i].y * br * 1.35, cz + fibDirs[i].z * br * 1.35);
    sp.visible = false; sp.renderOrder = 8;
    parent.add(sp); sprites.push(sp);
  }
  return sprites;
}
var plusA = makePlusGroup(beamGroup, RU, 0, 0, BU);
var plusC = makePlusGroup(cSlide, RU, ROD_Y, 0, BUC);
function updatePlus(sprites, q) {
  var n = q > 0 ? Math.max(1, Math.min(8, Math.round(q / Q0 * 8))) : 0;
  for (var i = 0; i < 8; i++) sprites[i].visible = i < n;
}

// ---------- 辅助小球 D（与 C 完全相同，用于使 qC 减半；在装置外沿 z 滑动） ----------
var dGroup = new THREE.Group();
dGroup.position.set(RU + RAD_OUT, 0, DZ_OUT);
scene.add(dGroup);
addMesh(new THREE.SphereGeometry(BUC, 32, 24), matCopper, 0, ROD_Y, 0, dGroup);
var rodD = addMesh(new THREE.CylinderGeometry(0.045, 0.045, 1.8, 12), matInsul, 0, ROD_Y, BUC + 0.9, dGroup);
rodD.rotation.x = Math.PI / 2;
addMesh(new THREE.CylinderGeometry(0.09, 0.09, 0.35, 16), matWood, 0, ROD_Y, BUC + 2.0, dGroup).rotation.x = Math.PI / 2; // 手柄
var labelD = makeLabelSprite("D", "#64748b");
labelD.scale.set(0.42, 0.42, 1); labelD.position.set(0, ROD_Y + BUC + 0.34, 0); dGroup.add(labelD);
var plusD = makePlusGroup(dGroup, 0, ROD_Y, 0, BUC);

// ---------- D 的接地线（放电时出现：导线从 D 垂到地面 + 接地符号） ----------
var groundWire = new THREE.Group(); groundWire.visible = false; scene.add(groundWire);
(function buildGroundWire() {
  var gx = RU + RAD_OUT, gz = DZ_OUT;
  var wireMat = new THREE.MeshStandardMaterial({ color: 0x3f4750, metalness: 0.6, roughness: 0.5 });
  var wyTop = ROD_Y - BUC - 0.02, wyBot = 0.11;      // 从 D 球底部到接地符号
  addMesh(new THREE.CylinderGeometry(0.02, 0.02, wyTop - wyBot, 8), wireMat,
    gx, (wyTop + wyBot) / 2, gz, groundWire, false);
  // 接地符号：三条长度递减的横线（长的在地面侧）
  addMesh(new THREE.BoxGeometry(0.13, 0.018, 0.018), wireMat, gx, 0.09, gz, groundWire, false);
  addMesh(new THREE.BoxGeometry(0.26, 0.018, 0.018), wireMat, gx, 0.06, gz, groundWire, false);
  addMesh(new THREE.BoxGeometry(0.40, 0.018, 0.018), wireMat, gx, 0.03, gz, groundWire, false);
})();

// ---------- 电火花 ----------
function makeSparkTexture() {
  var cv = document.createElement("canvas"); cv.width = cv.height = 128;
  var ctx = cv.getContext("2d");
  ctx.translate(64, 64); ctx.strokeStyle = "#fbbf24"; ctx.lineCap = "round";
  for (var i = 0; i < 12; i++) {
    var a = i * Math.PI / 6 + (i % 2) * 0.2;
    ctx.lineWidth = i % 2 ? 3 : 5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (40 + (i % 3) * 10), Math.sin(a) * (40 + (i % 3) * 10)); ctx.stroke();
  }
  ctx.fillStyle = "#fff7d6"; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.fill();
  return new THREE.CanvasTexture(cv);
}
var spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeSparkTexture(), transparent: true, opacity: 0, depthTest: false }));
spark.scale.set(0.6, 0.6, 1); spark.renderOrder = 9; scene.add(spark);

// ---------- 库仑力箭头 ----------
var arrowA = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xe11d48, 0.22, 0.12);
var arrowC = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0x2563eb, 0.22, 0.12);
scene.add(arrowA); scene.add(arrowC);
arrowA.visible = arrowC.visible = false;

// ---------- r 标注线 + 标签 ----------
var rLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
var rLine = new THREE.Line(rLineGeo, new THREE.LineDashedMaterial({ color: 0x0f766e, dashSize: 0.08, gapSize: 0.06 }));
rLine.visible = false; scene.add(rLine);
var rLabelCv = document.createElement("canvas"); rLabelCv.width = 256; rLabelCv.height = 72;
var rLabelTex = new THREE.CanvasTexture(rLabelCv);
var rLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: rLabelTex, depthTest: false }));
rLabel.scale.set(1.5, 0.42, 1); rLabel.renderOrder = 9; rLabel.visible = false; scene.add(rLabel);
var lastRText = "";
function drawRLabel(text) {
  if (text === lastRText) return; lastRText = text;
  var ctx = rLabelCv.getContext("2d");
  ctx.clearRect(0, 0, 256, 72);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.strokeStyle = "#0f766e"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.rect(6, 6, 244, 60); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#0f766e"; ctx.font = "bold 34px Microsoft YaHei, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 38);
  rLabelTex.needsUpdate = true;
}

// ---------- 右手（转旋钮时出现，握住旋钮随之转动） ----------
// 用圆柱 + 球头拼成“胶囊”（本 three 版本无 CapsuleGeometry）
function capsule(r, len, mat) {
  var g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat));
  var s1 = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat); s1.position.y = len / 2; g.add(s1);
  var s2 = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat); s2.position.y = -len / 2; g.add(s2);
  return g;
}
function aimY(obj, dir) {   // 让物体的 +y 轴指向 dir
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
}
// 从 from 到 to 的一段“手指/手臂”（圆柱+两端球头）
function fingerSeg(x1, y1, z1, x2, y2, z2, r) {
  var from = new THREE.Vector3(x1, y1, z1), to = new THREE.Vector3(x2, y2, z2);
  var f = capsule(r, from.distanceTo(to), matSkin);
  f.position.copy(from).add(to).multiplyScalar(0.5);
  aimY(f, to.clone().sub(from));
  return f;
}
var handGroup = new THREE.Group(); handGroup.position.y = HEAD_Y; handGroup.visible = false; scene.add(handGroup);
var handSlide = new THREE.Group(); handGroup.add(handSlide);   // 沿局部 +x 滑入/滑出
(function buildHand() {
  // 拳头（掌背）：盖在旋钮上方，手指从拳沿延伸下来——手指与手掌相连
  var palm = new THREE.Mesh(new THREE.SphereGeometry(0.30, 20, 16), matSkin);
  palm.scale.set(1.3, 0.78, 1.15);
  palm.position.set(0.02, 0.35, 0);
  handSlide.add(palm);
  // 四指：从拳的前沿向下扣在旋钮前侧（朝向相机），中间两指略长
  var fx = [-0.24, -0.08, 0.08, 0.24];
  var tipY = [-0.02, -0.06, -0.06, -0.02];
  for (var i = 0; i < 4; i++) {
    handSlide.add(fingerSeg(fx[i], 0.30, 0.10, fx[i] * 1.15, tipY[i], 0.46, 0.075));
  }
  // 拇指：扣在旋钮 +x 侧面
  handSlide.add(fingerSeg(0.28, 0.26, 0.14, 0.50, 0.04, -0.10, 0.085));
  // 手腕（与拳相连）
  var wrist = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), matSkin);
  wrist.position.set(0.44, 0.46, -0.04);
  handSlide.add(wrist);
  // 小臂（向右上方延伸）
  handSlide.add(fingerSeg(0.55, 0.55, -0.06, 1.45, 1.28, -0.18, 0.145));
  // 袖口
  var cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.24, 16),
    new THREE.MeshStandardMaterial({ color: 0x3b6ea5, roughness: 0.7 }));
  cuff.position.set(1.50, 1.33, -0.19);
  aimY(cuff, new THREE.Vector3(0.90, 0.73, -0.12));
  handSlide.add(cuff);
})();

// ================= 工具函数 =================
function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function easeIn(t) { return t * t * t; }
function cPosWorld() {   // C 球心的世界坐标
  var rad = RU + state.cRad;
  return new THREE.Vector3(rad * Math.cos(state.cPsi), ROD_Y, rad * Math.sin(state.cPsi));
}

// ================= DOM =================
var $ = function (id) { return document.getElementById(id); };
var hintEl = $("hint"), progEl = $("prog");
function setHint(html) { hintEl.innerHTML = html; }
function setProg(text) { progEl.textContent = text; }

var SYM = ["θ = 10°", "4θ = 40°", "16θ = 160°"];      // r 模式表格
var SYM2 = ["θ = 10°", "θ/2 = 5°", "θ/4 = 2.5°"];     // q 模式表格
function fillRow(id, sym) {
  var tr = $(id);
  tr.querySelector(".val").textContent = sym;
  tr.classList.add("done");
  tr.classList.remove("flash"); void tr.offsetWidth; tr.classList.add("flash");
}
function recordRow(i) { fillRow("row" + i, SYM[i - 1]); }
function recordQRow(i) { fillRow("qrow" + i, SYM2[i - 1]); }

// ---------- 放大镜：显示悬丝扭转 ----------
// 悬丝两端各自跟随：顶部 = 旋钮（转角 −φ），底部 = 横杆（偏转 −β）。
// A 偏转时旋钮不动——上端固定、下端随 A 顺时针转（俯视）；逆时针转旋钮时上端才动。
// 两端角差 β−φ 即为扭转角；丝表面画 6 条竖向条纹（扭转时一起卷成麻花），红色为参考条纹。
var lensCv = $("lensCv"), lensCtx = lensCv.getContext("2d"), lensCap = $("lensCap");
var LENS_Y0 = 32, LENS_Y1 = 170, LENS_RW = 15;
var LENS_NL = 6;                              // 表面条纹数
function drawLens() {
  var ctx = lensCtx, cx = 110, k, yy;
  var AMP = 2.5;                              // 视觉放大倍数
  var topAng = -state.phi * AMP;              // 顶部角度（随旋钮）
  var botAng = -state.beta * AMP;             // 底部角度（随横杆/A）
  var twist = state.beta - state.phi;         // 扭转角 (rad)
  ctx.clearRect(0, 0, 220, 220);
  // 丝柱（圆柱渐变）
  var grad = ctx.createLinearGradient(cx - LENS_RW, 0, cx + LENS_RW, 0);
  grad.addColorStop(0, "#aeb8c2"); grad.addColorStop(0.5, "#f2f5f8"); grad.addColorStop(1, "#96a1ad");
  ctx.fillStyle = grad;
  ctx.fillRect(cx - LENS_RW, LENS_Y0, 2 * LENS_RW, LENS_Y1 - LENS_Y0);
  // 表面竖向条纹（两端各自随动，扭转时卷成麻花；背面半透明）
  for (k = 0; k < LENS_NL; k++) {
    var base = k * 2 * Math.PI / LENS_NL;
    for (yy = LENS_Y0; yy < LENS_Y1; yy += 4) {
      var f1 = (LENS_Y1 - yy) / (LENS_Y1 - LENS_Y0);       // 顶=1，底=0
      var f2 = (LENS_Y1 - yy - 4) / (LENS_Y1 - LENS_Y0);
      var a1 = base + botAng + (topAng - botAng) * f1;
      var a2 = base + botAng + (topAng - botAng) * f2;
      ctx.strokeStyle = k === 0 ? "#e11d48" : "#64748b";
      ctx.globalAlpha = Math.cos((a1 + a2) / 2) > 0 ? 1 : 0.22;
      ctx.lineWidth = k === 0 ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(cx + LENS_RW * Math.sin(a1), yy);
      ctx.lineTo(cx + LENS_RW * Math.sin(a2), yy + 4);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // 上下端面
  ctx.fillStyle = "#8a939e";
  ctx.beginPath(); ctx.ellipse(cx, LENS_Y0, LENS_RW, 4, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx, LENS_Y1, LENS_RW, 4, 0, 0, 7); ctx.fill();
  // 端部标签
  ctx.fillStyle = "#7a8a99"; ctx.font = "12px Microsoft YaHei, sans-serif"; ctx.textAlign = "left";
  ctx.fillText("旋钮端", cx + LENS_RW + 8, LENS_Y0 + 10);
  ctx.fillText("横杆端", cx + LENS_RW + 8, LENS_Y1 - 4);
  // 扭转角读数
  lensCap.textContent = "扭转角 α = " + (Math.abs(twist) / DEG).toFixed(1) + "°";
}

// ---------- 放大镜：显示旋钮转角 ----------
// 放大旋钮刻度盘：0° 在顶端（红三角为基准），红指针随旋钮逆时针转动，
// 浅红扇形为已转过的角度，底部数字读数 φ = −φ（逆时针）。
var knobCv = $("knobCv"), knobCtx = knobCv.getContext("2d"), knobCap = $("knobCap");
function drawKnobLens() {
  var ctx = knobCtx, cx = 110, cy = 112, R = 78;
  var a = -state.phi / DEG;            // 旋钮转角（逆时针，度）
  var d, ang;
  ctx.clearRect(0, 0, 220, 220);
  // 表盘
  ctx.fillStyle = "#f6f2e6";
  ctx.beginPath(); ctx.arc(cx, cy, R + 12, 0, 7); ctx.fill();
  ctx.strokeStyle = "#7a6a4a"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, R + 12, 0, 7); ctx.stroke();
  // 已转过角度的扇形（自顶端逆时针）
  if (a > 0.3) {
    ctx.fillStyle = "rgba(225,29,72,0.15)";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 - a * DEG, true);
    ctx.closePath(); ctx.fill();
  }
  // 刻度（0° 在顶端，数字沿逆时针增大，指针转角即读数）
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (d = 0; d < 360; d += 5) {
    ang = d * DEG;
    var major = d % 30 === 0;
    var r1 = major ? R - 12 : R - 6;
    ctx.strokeStyle = "#4a3f28"; ctx.lineWidth = major ? 2.5 : 1;
    ctx.beginPath();
    ctx.moveTo(cx - r1 * Math.sin(ang), cy - r1 * Math.cos(ang));
    ctx.lineTo(cx - R * Math.sin(ang), cy - R * Math.cos(ang));
    ctx.stroke();
    if (major) {
      ctx.fillStyle = "#4a3f28"; ctx.font = "bold 13px sans-serif";
      ctx.fillText(String(d), cx - (R - 24) * Math.sin(ang), cy - (R - 24) * Math.cos(ang));
    }
  }
  // 0° 基准红三角
  ctx.fillStyle = "#e11d48";
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - R - 11); ctx.lineTo(cx + 5, cy - R - 11); ctx.lineTo(cx, cy - R - 2);
  ctx.closePath(); ctx.fill();
  // 指针（逆时针 a 度）
  var px = cx - (R - 16) * Math.sin(a * DEG), py = cy - (R - 16) * Math.cos(a * DEG);
  ctx.strokeStyle = "#e11d48"; ctx.lineWidth = 4; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
  ctx.fillStyle = "#5b6470";
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 7); ctx.fill();
  // 读数
  knobCap.textContent = "φ = " + a.toFixed(1) + "°（逆时针）";
}

// ================= 时间线（分镜片段） =================
// 片段：{ dur, begin(), update(p, t), end() }；dur=0 且无 update 的为瞬时片段
function segHint(html) { return { dur: 0, begin: function () { setHint(html); } }; }
function segStage(text) { return { dur: 0, begin: function () { setProg(text); } }; }
function segWait(dur) { return { dur: dur }; }
function segSet(fn) { return { dur: 0, begin: fn }; }

// C 绕悬丝轴转到指定角位置；alsoZero=true 时转动过程中 A 在悬丝作用下回原点
function segRotateC(psi, dur, alsoZero) {
  var p0;
  return {
    dur: dur,
    begin: function () {
      p0 = state.cPsi;
      if (alsoZero) { state.spring = true; state.betaT = 0; }
    },
    update: function (p) { state.cPsi = lerp(p0, psi, easeInOut(p)); }
  };
}

// C 沿径向滑入/滑出装置（rad=0 表示进入装置、位于圆周上）
function segSlideC(rad, dur, alsoZero) {
  var r0;
  return {
    dur: dur,
    begin: function () {
      r0 = state.cRad;
      if (alsoZero) { state.spring = true; state.betaT = 0; }
    },
    update: function (p) { state.cRad = lerp(r0, rad, easeInOut(p)); }
  };
}

// D 移到指定 z 位置（去碰 C / 移走）
function segMoveD(target, dur) {
  var z0;
  return {
    dur: dur,
    begin: function () { z0 = state.dZ; },
    update: function (p) { state.dZ = lerp(z0, target, easeInOut(p)); }
  };
}

// A 偏转到指定角度（弹簧阻尼，带回摆）
function segDeflect(deg, dur) {
  return { dur: dur || 2.4, begin: function () { state.spring = true; state.betaT = deg * DEG; } };
}

// 手出现 → 转旋钮到 phiDeg → A 同步回原点 → 手退出
// opts.rate：手转速 °/s（默认 55）；opts.minTurn：转动阶段最短时长；
// opts.moveCOut=true：转动的同时把 C 移出装置并转回停靠角（用于每次测量间归零复位）
function segTurnKnob(phiDeg, betaDeg, opts) {
  opts = opts || {};
  var T_IN = 0.7, T_HOLD1 = 0.25, T_HOLD2 = 0.35, T_OUT = 0.7;
  var RATE = opts.rate || 55;
  var MIN_TURN = opts.minTurn || 0;
  var phi0 = 0, dTurn = 1, cr0 = 0, cp0 = 0;
  return {
    dur: 1,
    begin: function () {
      phi0 = state.phi / DEG;
      dTurn = Math.max(Math.abs(phiDeg - phi0) / RATE, MIN_TURN);
      this.dur = T_IN + T_HOLD1 + dTurn + T_HOLD2 + T_OUT;
      state.spring = false;
      if (opts.moveCOut) {
        cr0 = state.cRad; cp0 = state.cPsi;
        state.rText = null; state.forceRel = 0;
      }
    },
    update: function (p, t) {
      var t1 = T_IN, t2 = t1 + T_HOLD1, t3 = t2 + dTurn, t4 = t3 + T_HOLD2;
      if (t < t1) {
        state.handT = easeOut(t / t1);
      } else if (t < t2) {
        state.handT = 1;
      } else if (t < t3) {
        state.handT = 1;
        var q = easeInOut((t - t2) / dTurn);
        state.phi = lerp(phi0, phiDeg, q) * DEG;
        state.beta = lerp(betaDeg, 0, q) * DEG;
        state.betaV = 0;
        if (opts.moveCOut) {
          state.cRad = lerp(cr0, RAD_OUT, q);
          state.cPsi = lerp(cp0, PSI_OUT, q);
        }
      } else if (t < t4) {
        state.handT = 1;
        state.phi = phiDeg * DEG;   // 兜底：跳帧时也保证到达目标角
        state.beta = 0; state.betaV = 0;
        if (opts.moveCOut) { state.cRad = RAD_OUT; state.cPsi = PSI_OUT; }
      } else {
        state.handT = 1 - easeIn((t - t4) / T_OUT);
      }
    },
    end: function () {
      state.handT = 0;
      state.phi = phiDeg * DEG;
      state.beta = 0; state.betaV = 0;
      if (opts.moveCOut) { state.cRad = RAD_OUT; state.cPsi = PSI_OUT; }
    }
  };
}

var TL_INTRO = [
  // ===== 第一步：起电 =====
  segStage("第一步：使 C 带电并传给 A"),
  segHint("实验装置：悬丝下端吊着绝缘横杆，A 球可绕悬丝在水平面内转动，B 为平衡球；C 球固定在绝缘柄上，可沿径向移进移出，进入装置后与 A 球在<b>同一圆周</b>上（到悬丝轴的距离相等）。"),
  segWait(3.4),
  segHint("<b>第一步：</b>先让 C 球带上正电荷（如用起电机充电）。"),
  segSet(function () {
    state.qC = Q0; updatePlus(plusC, state.qC);
    state.sparkT = 0.5; state.sparkPos = cPosWorld();
  }),
  segWait(1.6),
  segHint("把 C 球移入装置，与 A 球接触。"),
  segSlideC(0, 2.0),
  segSet(function () {
    // 大小不同的导体球接触：电荷按球半径（电容）比例分配，A 球小分得少（qA < qC），不平分
    var qTot = state.qA + state.qC;
    state.qA = qTot * BALLR_M / (BALLR_M + BALLRC_M);
    state.qC = qTot * BALLRC_M / (BALLR_M + BALLRC_M);
    updatePlus(plusA, state.qA); updatePlus(plusC, state.qC);
    state.sparkT = 0.5;
    state.sparkPos = new THREE.Vector3((RU * Math.cos(TH0) + RU) / 2, ROD_Y, RU * Math.sin(TH0) / 2);
    setHint("<b>接触起电：</b>大小不同的导体球接触，电荷按球的半径比例分配——A 球较小，带电量<b>小于</b> C 球（q<sub>A</sub> < q<sub>C</sub>），但电性相同（同为正）。");
  }),
  segWait(1.8),
  segHint("分开时 C 球固定在绝缘柄上不动：A、C 带同种电荷相互排斥，<b>A 球先离开 C</b>（从上往下看为顺时针），悬丝被扭转。"),
  segDeflect(60, 2.8),
  segWait(1.0),
  segHint("再把 C 球移开——移到距 A 较远的位置（装置外）。"),
  segSlideC(RAD_OUT, 2.0),
  segHint("C 远离后，斥力消失，A 在悬丝弹力作用下<b>回到原点</b>（0° 位置）。"),
  segDeflect(0, 2.4),
  segWait(1.0)
];

var TL_R = [
  // ===== 第二步：探究 F 与 r 的关系 =====
  segStage("第二步：探究库仑力 F 与距离 r 的关系"),
  segHint("<b>第二步：</b>探究库仑力 F 与两球距离 r 的关系。保持 q<sub>A</sub>、q<sub>C</sub> 不变。"),
  segWait(1.4),

  // 第 1 次
  segHint("<b>第 1 次：</b>把 C 放进装置，置于距 A 为 <b>r</b> 的位置（C 与 A 在同一圆周上）。"),
  segSet(function () { state.rText = "r"; state.forceRel = 1; }),
  segRotateC(PSI_R, 1.8),
  segSlideC(0, 2.0),
  segDeflect(BETAS_D[0]),
  segHint("A 受库仑斥力发生偏转。"),
  segWait(1.4),
  segHint("<b>逆时针</b>转动旋钮，扭转悬丝，使 A 回到原点。此时旋钮的转角记为 <b>θ</b>。"),
  segTurnKnob(-THETA_D, BETAS_D[0]),
  segSet(function () { recordRow(1); setHint("记录：距离 r → 旋钮转角 <b>θ</b>。旋钮转角（悬丝扭转角）的大小反映库仑力的大小。"); }),
  segWait(2.0),

  // 复位：旋钮转回零，悬丝恢复自然；移出 C，A 保持在原点
  segHint("<b>复位：</b>手把旋钮<b>转回零</b>，悬丝恢复自然（无转角）；同时移出 C，A 保持在原点。"),
  segTurnKnob(0, 0, { rate: 55, minTurn: 1.4, moveCOut: true }),
  segWait(0.8),

  // 第 2 次
  segHint("<b>第 2 次：</b>保持电荷量不变，把 C 沿圆周移到距 A 为 <b>r/2</b> 的位置。"),
  segSet(function () { state.rText = "r/2"; state.forceRel = 4; }),
  segRotateC(PSI_R2, 1.8),
  segSlideC(0, 1.6),
  segDeflect(BETAS_D[1]),
  segHint("距离减半，A 偏转的角度明显变大——库仑力变大了。"),
  segWait(1.6),
  segHint("再次<b>逆时针</b>转动旋钮，使 A 回到原点：旋钮转角为 <b>4θ</b>。"),
  segTurnKnob(-4 * THETA_D, BETAS_D[1]),
  segSet(function () { recordRow(2); setHint("记录：距离 r/2 → 旋钮转角 <b>4θ</b>。"); }),
  segWait(2.0),

  // 复位
  segHint("<b>复位：</b>旋钮转回零，悬丝恢复自然；移出 C，A 保持在原点。"),
  segTurnKnob(0, 0, { rate: 55, minTurn: 1.4, moveCOut: true }),
  segWait(0.8),

  // 第 3 次
  segHint("<b>第 3 次：</b>把 C 移到距 A 为 <b>r/4</b> 的位置。"),
  segSet(function () { state.rText = "r/4"; state.forceRel = 16; }),
  segRotateC(PSI_R4, 1.6),
  segSlideC(0, 1.6),
  segDeflect(BETAS_D[2]),
  segHint("距离变为 1/4，A 偏转的角度更大。"),
  segWait(1.6),
  segHint("<b>逆时针</b>转动旋钮，使 A 回到原点：旋钮转角达到 <b>16θ</b>。"),
  segTurnKnob(-16 * THETA_D, BETAS_D[2]),
  segSet(function () { recordRow(3); setHint("记录：距离 r/4 → 旋钮转角 <b>16θ</b>。"); }),
  segWait(2.0),

  // 复位（最后一次）
  segHint("<b>复位：</b>旋钮转回零，悬丝恢复自然；移出 C。"),
  segTurnKnob(0, 0, { rate: 55, minTurn: 1.4, moveCOut: true }),
  segWait(0.8),

  // ===== 第二步结论 =====
  segStage("实验结论（一）"),
  segSet(function () {
    setHint("旋钮转角（悬丝扭转角）反映库仑力大小：r 减半 → 力变为 <b>4 倍</b>；r 变为 1/4 → 力变为 <b>16 倍</b>。<b>电荷量不变时，F ∝ 1/r²。</b>");
  }),
  segWait(3.2)
];

var TL_Q = [
  segStage("第三步：探究库仑力 F 与电荷量的关系"),
  // 第 1 次（qC = q，与第二步第 1 次位形相同，转角同为 θ）
  segHint("<b>第 1 次：</b>保持两球距离为 <b>r</b> 不变，把 C 放到距 A 为 r 处（两球电荷量保持不变，q<sub>A</sub> < q<sub>C</sub>）。"),
  segSet(function () { state.rText = "r"; state.forceRel = 1; }),
  segRotateC(PSI_R, 1.8),
  segSlideC(0, 2.0),
  segDeflect(BETAS_Q[0]),
  segHint("A 受库仑斥力发生偏转。"),
  segWait(1.2),
  segHint("<b>逆时针</b>转动旋钮使 A 回到原点，记录此时旋钮的转角 <b>θ</b>。"),
  segTurnKnob(-THETA_D, BETAS_Q[0], { rate: 15, minTurn: 0.4 }),
  segSet(function () { recordQRow(1); setHint("记录：C 的电荷量 q → 旋钮转角 <b>θ</b>。"); }),
  segWait(2.2),

  // 第 2 次（qC 减半）
  segHint("<b>第 2 次：</b>先把旋钮转回零，并移出 C——"),
  segTurnKnob(0, 0, { rate: 55, minTurn: 1.2, moveCOut: true }),
  segHint("取一个与 C <b>完全相同</b>的不带电金属球 D，与 C 接触。"),
  segMoveD(DZ_TOUCH, 1.6),
  segSet(function () {
    state.qC = state.qC / 2; state.qD = state.qC;
    updatePlus(plusC, state.qC); updatePlus(plusD, state.qD);
    state.sparkT = 0.5; state.sparkPos = new THREE.Vector3(RU + RAD_OUT, ROD_Y, DZ_TOUCH / 2);
    setHint("<b>接触起电：</b>电荷在 C、D 之间平分——q<sub>C</sub> 变为原来的一半（q/2），D 带走另一半。");
  }),
  segWait(2.2),
  segHint("移走 D。"),
  segMoveD(DZ_OUT, 1.6),
  segSet(function () {
    groundWire.visible = true;   // D 接地放电
    setHint("让 D <b>接地</b>：D 上的电荷经导线导入大地（放电），D 恢复不带电，可再次使用。");
    state.sparkT = 0.4; state.sparkPos = new THREE.Vector3(RU + RAD_OUT, ROD_Y, DZ_OUT);
    state.qD = 0; updatePlus(plusD, 0);
    state.forceRel = 0.5;
  }),
  segWait(1.8),
  segSet(function () { groundWire.visible = false; }),
  segHint("保持 q<sub>A</sub> 不变，把 C 重新放到距 A 为 <b>r</b> 的位置。"),
  segRotateC(PSI_R, 1.6),
  segSlideC(0, 2.0),
  segDeflect(BETAS_Q[1]),
  segHint("q<sub>C</sub> 减半，A 偏转的角度明显<b>变小</b>——库仑力变小了。"),
  segWait(1.8),
  segHint("<b>逆时针</b>转动旋钮使 A 回到原点：旋钮转角为 <b>θ/2</b>。"),
  segTurnKnob(-THETA_D / 2, BETAS_Q[1], { rate: 15, minTurn: 0.4 }),
  segSet(function () { recordQRow(2); setHint("记录：C 的电荷量 q/2 → 旋钮转角 <b>θ/2</b>。"); }),
  segWait(2.2),

  // 第 3 次（qC 再减半）
  segHint("<b>第 3 次：</b>先把旋钮转回零，并移出 C——"),
  segTurnKnob(0, 0, { rate: 55, minTurn: 1.2, moveCOut: true }),
  segHint("再取一个不带电的相同小球 D（已放电），再次与 C 接触。"),
  segMoveD(DZ_TOUCH, 1.6),
  segSet(function () {
    state.qC = state.qC / 2; state.qD = state.qC;
    updatePlus(plusC, state.qC); updatePlus(plusD, state.qD);
    state.sparkT = 0.5; state.sparkPos = new THREE.Vector3(RU + RAD_OUT, ROD_Y, DZ_TOUCH / 2);
    setHint("电荷再次平分——q<sub>C</sub> 变为第一次的 <b>1/4</b>（q/4）。");
  }),
  segWait(2.0),
  segHint("移走 D。"),
  segMoveD(DZ_OUT, 1.6),
  segSet(function () {
    groundWire.visible = true;   // D 再次接地放电
    setHint("让 D <b>接地</b>放电，恢复不带电。保持 q<sub>A</sub> 不变，把 C 重新放到距 A 为 <b>r</b> 的位置。");
    state.sparkT = 0.4; state.sparkPos = new THREE.Vector3(RU + RAD_OUT, ROD_Y, DZ_OUT);
    state.qD = 0; updatePlus(plusD, 0);
    state.forceRel = 0.25;
  }),
  segWait(1.8),
  segSet(function () { groundWire.visible = false; }),
  segRotateC(PSI_R, 1.6),
  segSlideC(0, 2.0),
  segDeflect(BETAS_Q[2]),
  segHint("q<sub>C</sub> 变为 1/4，A 的偏转角更小了。"),
  segWait(1.8),
  segHint("<b>逆时针</b>转动旋钮使 A 回到原点：旋钮转角为 <b>θ/4</b>。"),
  segTurnKnob(-THETA_D / 4, BETAS_Q[2], { rate: 15, minTurn: 0.4 }),
  segSet(function () { recordQRow(3); setHint("记录：C 的电荷量 q/4 → 旋钮转角 <b>θ/4</b>。"); }),
  segWait(2.0)
];

// 完整流程的总结（两步都做完，给出库仑定律）
var TL_QEND_FULL = [
  // ===== 实验总结 =====
  segStage("实验总结"),
  segHint("<b>复位：</b>旋钮转回零，悬丝恢复自然；移出 C。分析表二的三次测量数据——"),
  segTurnKnob(0, 0, { rate: 55, minTurn: 1.4, moveCOut: true }),
  segSet(function () {
    setHint("距离不变时，库仑力与两球电荷量的乘积成正比；结合第二步的 F ∝ 1/r² —— <b>库仑定律：F = k·q<sub>1</sub>q<sub>2</sub>/r²。</b>");
  }),
  segWait(3.0)
];

// q 单独模式的结论（不引用表一）
var TL_QEND_ONLY = [
  segStage("实验结论（二）"),
  segHint("<b>复位：</b>旋钮转回零，悬丝恢复自然；移出 C。分析表二的三次测量数据——"),
  segTurnKnob(0, 0, { rate: 55, minTurn: 1.4, moveCOut: true }),
  segSet(function () {
    setHint("旋钮转角随 q<sub>C</sub> 同比变化：<b>距离不变时，库仑力 F 与两球电荷量的乘积成正比：F ∝ q<sub>1</sub>q<sub>2</sub>。</b>");
  }),
  segWait(3.0)
];

// 时间线按模式组合：full=完整流程，r=力与距离，q=力与电荷量
var TL = [];
function setTimeline(mode) {
  TL = mode === "r" ? TL_INTRO.concat(TL_R)
    : mode === "q" ? TL_INTRO.concat(TL_Q, TL_QEND_ONLY)
    : TL_INTRO.concat(TL_R, TL_Q, TL_QEND_FULL);
}
setTimeline("full");

// ================= 播放器 =================
var tl = { i: -1, t: 0, playing: false, started: false, done: false };
var btnPlay = $("btnPlay");

function nextSeg() {
  tl.i++; tl.t = 0;
  while (tl.i < TL.length) {
    var s = TL[tl.i];
    if (s.begin) s.begin.call(s);
    if (s.dur > 0 || s.update) break;   // 有内容待播放
    tl.i++; tl.t = 0;                   // 瞬时片段，直接进入下一片段
  }
  if (tl.i >= TL.length) {
    tl.playing = false; tl.done = true;
    setProg("实验结束");
    updatePlayBtn();
  }
}
function updatePlayBtn() {
  btnPlay.textContent = tl.done ? "▶ 重新播放"
    : tl.playing ? "⏸ 暂停"
    : tl.started ? "▶ 继续" : "▶ 开始实验";
}
function startPlay() {
  tl.started = true; tl.playing = true;
  if (tl.i < 0 || tl.done) { tl.done = false; nextSeg(); }
  updatePlayBtn();
}
function resetAll() {
  state.qA = 0; state.qC = 0; state.qD = 0;
  state.beta = 0; state.betaV = 0; state.betaT = 0; state.spring = false;
  state.phi = 0; state.cPsi = PSI_OUT; state.cRad = RAD_OUT; state.dZ = DZ_OUT; state.handT = 0;
  state.rText = null; state.forceRel = 0; state.sparkT = 0;
  updatePlus(plusA, 0); updatePlus(plusC, 0); updatePlus(plusD, 0);
  groundWire.visible = false;
  var i, tr;
  for (i = 1; i <= 3; i++) {
    tr = $("row" + i);
    if (tr) { tr.querySelector(".val").textContent = "—"; tr.classList.remove("done", "flash"); }
    tr = $("qrow" + i);
    if (tr) { tr.querySelector(".val").textContent = "—"; tr.classList.remove("done", "flash"); }
  }
  setProg("准备就绪");
  tl.i = -1; tl.t = 0; tl.playing = false; tl.started = false; tl.done = false;
  updatePlayBtn();
}
// 界面随模式切换：未选模式时隐藏开始按钮和数据卡；r/q 模式显示开始按钮 + 对应数据表
function setModeUI(mode) {
  btnPlay.style.display = mode === "full" ? "none" : "";
  $("dataCard").style.display = mode === "full" ? "none" : "";
  $("tblR").style.display = mode === "q" ? "none" : "";
  $("tblQ").style.display = mode === "r" ? "none" : "";
}
btnPlay.onclick = function () {
  if (tl.done || !tl.started) { if (tl.done) resetAll(); startPlay(); }
  else { tl.playing = !tl.playing; updatePlayBtn(); }
};
$("btnModeR").onclick = function () {
  setTimeline("r"); setModeUI("r"); resetAll();
  setHint("已选择【<b>力与 r 的关系</b>】，点击 <b>【开始实验】</b>开始演示。");
};
$("btnModeQ").onclick = function () {
  setTimeline("q"); setModeUI("q"); resetAll();
  setHint("已选择【<b>力与 q 的关系</b>】，点击 <b>【开始实验】</b>开始演示。");
};

// ================= 动画循环 =================
var clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  var dt = clock.getDelta();
  if (dt <= 0) dt = 1 / 60;
  dt = Math.min(dt, 0.05);

  // 时间线推进
  if (tl.playing && tl.i >= 0 && tl.i < TL.length) {
    var seg = TL[tl.i];
    tl.t += dt;
    var p = seg.dur > 0 ? Math.min(1, tl.t / seg.dur) : 1;
    if (seg.update) seg.update(p, tl.t);
    if (tl.t >= seg.dur) { if (seg.end) seg.end(); nextSeg(); }
  }

  // A 偏转的弹簧阻尼（偏转/回原点阶段）；子步积分保证大 dt 下稳定
  if (state.spring) {
    var rem = dt;
    while (rem > 0) {
      var h = Math.min(rem, 0.02);
      var acc = OMEGA * OMEGA * (state.betaT - state.beta) - 2 * ZETA * OMEGA * state.betaV;
      state.betaV += acc * h;
      state.beta += state.betaV * h;
      rem -= h;
    }
  }

  // 同步 3D 姿态（从上往下看：beta 增大 = 顺时针；−phi 增大 = 逆时针）
  beamGroup.rotation.y = -(TH0 + state.beta);
  headGroup.rotation.y = -state.phi;
  handGroup.rotation.y = -state.phi;
  handSlide.position.x = (1 - state.handT) * 2.4;
  handGroup.visible = state.handT > 0.01;
  cGroup.rotation.y = -state.cPsi;
  cSlide.position.x = state.cRad;
  dGroup.position.z = state.dZ;

  // 火花动画
  if (state.sparkT > 0) {
    state.sparkT -= dt;
    spark.visible = true;
    spark.material.opacity = Math.max(0, state.sparkT / 0.5);
    var ss = 0.5 + (0.5 - state.sparkT) * 1.6;
    spark.scale.set(ss, ss, 1);
    if (state.sparkPos) spark.position.copy(state.sparkPos);
  } else spark.visible = false;

  // 库仑力箭头（长度 ∝ √F，示意）
  var showF = state.forceRel > 0 && state.cRad < RAD_OUT - 0.05;
  arrowA.visible = arrowC.visible = showF;
  if (showF) {
    var pA = new THREE.Vector3(RU * Math.cos(TH0 + state.beta), ROD_Y, RU * Math.sin(TH0 + state.beta));
    var pC = cPosWorld();
    var dirAC = pA.clone().sub(pC).normalize();
    var len = 0.3 + 0.4 * Math.sqrt(state.forceRel);
    arrowA.position.copy(pA).add(dirAC.clone().multiplyScalar(BU + 0.02));
    arrowA.setDirection(dirAC); arrowA.setLength(len, 0.2, 0.11);
    arrowC.position.copy(pC).add(dirAC.clone().multiplyScalar(-BUC - 0.02));
    arrowC.setDirection(dirAC.clone().negate()); arrowC.setLength(len, 0.2, 0.11);
  }

  // r 标注
  var showR = state.rText !== null && state.cRad < RAD_OUT - 0.05;
  rLine.visible = rLabel.visible = showR;
  if (showR) {
    var pA2 = new THREE.Vector3(RU * Math.cos(TH0 + state.beta), ROD_Y, RU * Math.sin(TH0 + state.beta));
    var pC2 = cPosWorld();
    rLineGeo.setFromPoints([pA2, pC2]);
    rLine.computeLineDistances();
    rLabel.position.set(-3.8, 2.0, 0);
    drawRLabel(state.rText);
  }

  // 放大镜：悬丝扭转 + 旋钮转角
  drawLens();
  drawKnobLens();

  renderer.render(scene, camera);
}
animate();
