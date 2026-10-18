// Interactive 3D workshop. Each station acts out one project; the camera flies to it when selected.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PROJECTS } from "./data.js";

const PF = window.PF;
const canvas = document.getElementById("scene");
const hero = document.querySelector(".hero");

// ---------------------------------------------------------------- renderer
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch (err) {
  document.getElementById("nogl").hidden = false;
  canvas.style.display = "none";
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1014);
scene.fog = new THREE.Fog(0x0d1014, 26, 62);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 2.5;
controls.maxDistance = 48;
controls.maxPolarAngle = Math.PI * 0.47;
controls.autoRotateSpeed = 0.35;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches || location.search.includes("snap");
const isSmall = () => window.innerWidth < 860;

// ---------------------------------------------------------------- helpers
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const prog = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const lerpV = (a, b, t) => new THREE.Vector3().lerpVectors(a, b, t);
const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.6, metalness: o.m ?? 0.1, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1, transparent: o.opacity !== undefined, opacity: o.opacity ?? 1 });
const MAT = {
  floor: std(0x1d2127, { r: 0.95 }),
  body: std(0x2b3038, { r: 0.5, m: 0.35 }),
  dark: std(0x16191e, { r: 0.6, m: 0.2 }),
  steel: std(0xa3acb6, { r: 0.35, m: 0.75 }),
  yellow: std(0xf0b20a, { r: 0.45, m: 0.15 }),
  orange: std(0xff8a2a, { r: 0.5 }),
  white: std(0xdde3ea, { r: 0.55 }),
  wall: std(0x7d8794, { r: 0.8 }),
  card: std(0xc4945a, { r: 0.85 }),
  rubber: std(0x0f1113, { r: 0.9 }),
  blue: std(0x2f6fb0, { r: 0.6 }),
  glowBlue: new THREE.MeshBasicMaterial({ color: 0x3aa0ff }),
  glowOrange: new THREE.MeshBasicMaterial({ color: 0xff8a2a }),
  glowGreen: new THREE.MeshBasicMaterial({ color: 0x3ddc84 }),
  tape: new THREE.MeshBasicMaterial({ color: 0xd9a400 }),
  hit: new THREE.MeshBasicMaterial({ visible: false }),
};
function mesh(geo, mat, { cast = true, recv = true } = {}) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; }
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const box = (w, h, d, mat, o) => mesh(new THREE.BoxGeometry(w, h, d), mat, o);
const cyl = (rt, rb, h, mat, seg = 28, o) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, o);

// floor tape (thin flat strip from a to b)
function tape(group, ax, az, bx, bz, w = 0.06, mat = MAT.tape) {
  const L = Math.hypot(bx - ax, bz - az);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(L, w), mat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(bz - az, bx - ax);
  m.position.set((ax + bx) / 2, 0.004, (az + bz) / 2);
  group.add(m);
}
function tapeRect(group, cx, cz, w, d, mat) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  tape(group, x0, z0, x1, z0, 0.06, mat); tape(group, x1, z0, x1, z1, 0.06, mat);
  tape(group, x1, z1, x0, z1, 0.06, mat); tape(group, x0, z1, x0, z0, 0.06, mat);
}

// Two-link IK in the arm's vertical plane. Angles measured from vertical, elbow up.
function ik2(r, h, L1, L2) {
  const D = clamp((r * r + h * h - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
  const a2 = Math.acos(D);
  const a1 = Math.atan2(r, h) - Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));
  return [a1, a2];
}

// A generic arm: yaw -> shoulder -> elbow -> wrist -> tool tip. Links point along +y at zero angles.
function makeArm({ L1, L2, wrist, baseH, turretH, t, mat, jointMat, baseMat }) {
  const root = new THREE.Group();
  root.add(at(cyl(t * 1.9, t * 2.2, baseH, baseMat || MAT.dark), 0, baseH / 2, 0));
  const yaw = new THREE.Group(); yaw.position.y = baseH; root.add(yaw);
  yaw.add(at(cyl(t * 1.5, t * 1.7, turretH, mat), 0, turretH / 2, 0));
  const shoulder = new THREE.Group(); shoulder.position.y = turretH; yaw.add(shoulder);
  const j1 = cyl(t * 0.85, t * 0.85, t * 2.2, jointMat || MAT.dark); j1.rotation.z = Math.PI / 2; shoulder.add(j1);
  shoulder.add(at(box(t * 1.25, L1, t * 1.25, mat), 0, L1 / 2, 0));
  const elbow = new THREE.Group(); elbow.position.y = L1; shoulder.add(elbow);
  const j2 = cyl(t * 0.75, t * 0.75, t * 1.9, jointMat || MAT.dark); j2.rotation.z = Math.PI / 2; elbow.add(j2);
  elbow.add(at(box(t, L2, t, mat), 0, L2 / 2, 0));
  const wristJ = new THREE.Group(); wristJ.position.y = L2; elbow.add(wristJ);
  const j3 = cyl(t * 0.6, t * 0.6, t * 1.5, jointMat || MAT.dark); j3.rotation.z = Math.PI / 2; wristJ.add(j3);
  wristJ.add(at(cyl(t * 0.45, t * 0.5, wrist, MAT.steel), 0, wrist / 2, 0));
  const tool = new THREE.Group(); tool.position.y = wrist; wristJ.add(tool);
  const pivotY = baseH + turretH;
  const tmp = new THREE.Vector3();
  function reach(worldTarget) {
    root.updateWorldMatrix(true, false);
    tmp.copy(worldTarget); root.worldToLocal(tmp);
    const th = Math.atan2(tmp.x, tmp.z);
    const r = Math.max(0.05, Math.hypot(tmp.x, tmp.z));
    const h = tmp.y - pivotY + wrist;
    const [a1, a2] = ik2(r, h, L1, L2);
    yaw.rotation.y = th; shoulder.rotation.x = a1; elbow.rotation.x = a2; wristJ.rotation.x = Math.PI - a1 - a2;
  }
  return { root, yaw, shoulder, elbow, wristJ, tool, reach };
}
const toolWorld = (arm) => { arm.tool.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(arm.tool.matrixWorld); };

// A canvas used as a texture (screens in the scene).
function screenTexture(w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { c, ctx: c.getContext("2d"), tex };
}

// ---------------------------------------------------------------- lights + room
scene.add(new THREE.HemisphereLight(0xc9d6e6, 0x14171b, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(10, 18, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 20, bottom: -20, near: 1, far: 60 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun);
const warm = new THREE.PointLight(0xffa25a, 40, 22, 2); warm.position.set(-9, 6, 6); scene.add(warm);
const cool = new THREE.PointLight(0x7fb2ff, 30, 22, 2); cool.position.set(10, 6, -3); scene.add(cool);

const world = new THREE.Group(); scene.add(world);
const floor = mesh(new THREE.PlaneGeometry(90, 90), MAT.floor, { cast: false });
floor.rotation.x = -Math.PI / 2; world.add(floor);
const grid = new THREE.GridHelper(90, 90, 0x2c323b, 0x22272e);
grid.material.transparent = true; grid.material.opacity = 0.55; grid.position.y = 0.002; world.add(grid);

// back wall, racks, pillars, ceiling lamps
const backWall = box(60, 9, 0.4, std(0x14171c, { r: 0.95 }), { cast: false }); backWall.position.set(0, 4.5, -16); world.add(backWall);
const rackMatA = std(0xd8661c, { r: 0.6 }), rackMatB = std(0x24508a, { r: 0.6 });
const r0 = rng(7);
for (let k = -4; k <= 4; k++) {
  const rack = new THREE.Group(); rack.position.set(k * 3.4, 0, -14.6);
  for (const x of [-1.6, 1.6]) for (const z of [-0.45, 0.45]) { const u = box(0.08, 3.3, 0.08, rackMatA); u.position.set(x, 1.65, z); rack.add(u); }
  for (const y of [0.15, 1.2, 2.25, 3.25]) for (const z of [-0.45, 0.45]) { const b = box(3.2, 0.09, 0.06, rackMatB); b.position.set(0, y, z); rack.add(b); }
  for (const y of [0.2, 1.25, 2.3]) for (let i = 0; i < 4; i++) if (r0() > 0.3) {
    const s = 0.45 + r0() * 0.3; const b = box(s * 1.2, s, s, MAT.card); b.position.set(-1.2 + i * 0.8, y + s / 2 + 0.05, 0); rack.add(b);
  }
  world.add(rack);
}
for (const x of [-20, 20]) for (const z of [-10, 4]) { const p = box(0.7, 9, 0.7, std(0x2a2e34, { r: 0.9 })); p.position.set(x, 4.5, z); world.add(p); }
for (let k = -3; k <= 3; k++) { const l = box(3, 0.08, 0.3, new THREE.MeshBasicMaterial({ color: 0xeaf2ff }), { cast: false }); l.position.set(k * 6, 9, -2); world.add(l); }

// ---------------------------------------------------------------- stations
const stations = []; // { id, center, label, view, hit, update(t, dt), status(t) }
function addStation(id, center, { labelY = 2.3, viewOffset, lookY = 0.6, shift = 0.24 } = {}) {
  const idx = PROJECTS.findIndex((p) => p.id === id);
  const group = new THREE.Group(); group.position.copy(center); world.add(group);
  const s = { id, idx, group, center: center.clone(), anchor: center.clone().add(new THREE.Vector3(0, labelY, 0)), viewOffset, lookY, shift, update: () => {}, status: () => "" };
  stations.push(s);
  return s;
}
function addHit(s, w, h, d, x = 0, y = h / 2, z = 0) {
  const hb = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.hit);
  hb.position.set(x, y, z); hb.userData.station = s; s.group.add(hb);
  hits.push(hb);
  return hb;
}
const hits = [];

// ============ 1. Navigation: RRT* + DWA-style path following ============
{
  const s = addStation("nav", new THREE.Vector3(0, 0, -6.5), { viewOffset: new THREE.Vector3(1.2, 7.6, 8.6), lookY: 0 });
  const G = s.group;
  const B = { x0: -3.5, x1: 3.5, z0: -2.7, z1: 2.7 };
  tapeRect(G, 0, 0, 7.6, 5.8);
  const wallH = 0.32;
  const walls = [
    { x: 0, z: B.z0, w: 7.08, d: 0.08 }, { x: 0, z: B.z1, w: 7.08, d: 0.08 },
    { x: B.x0, z: 0, w: 0.08, d: 5.48 }, { x: B.x1, z: 0, w: 0.08, d: 5.48 },
  ];
  const obstacles = [
    { x: -1.3, z: -0.5, w: 0.8, d: 1.9 }, { x: 0.7, z: 1.1, w: 1.5, d: 0.7 },
    { x: 1.5, z: -1.3, w: 0.7, d: 1.1 }, { x: 2.7, z: 0.6, w: 0.6, d: 0.6 }, { x: -0.1, z: -2.1, w: 0.5, d: 0.5 },
  ];
  for (const w of walls) { const m = box(w.w, wallH, w.d, MAT.white); m.position.set(w.x, wallH / 2, w.z); G.add(m); }
  for (const o of obstacles) { const h = 0.45 + ((o.w * 7) % 0.3); const m = box(o.w, h, o.d, MAT.card); m.position.set(o.x, h / 2, o.z); G.add(m); }
  const allBoxes = walls.concat(obstacles);

  // occupancy-free checks for the planner (robot radius inflated)
  const R = 0.27;
  const free = (x, z) => {
    if (x < B.x0 + R || x > B.x1 - R || z < B.z0 + R || z > B.z1 - R) return false;
    for (const o of obstacles) if (x > o.x - o.w / 2 - R && x < o.x + o.w / 2 + R && z > o.z - o.d / 2 - R && z < o.z + o.d / 2 + R) return false;
    return true;
  };
  const segFree = (a, b) => { const L = Math.hypot(b.x - a.x, b.z - a.z); const n = Math.max(2, Math.ceil(L / 0.05)); for (let i = 0; i <= n; i++) { const u = i / n; if (!free(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u)) return false; } return true; };

  function rrtStar(start, goal, seed) {
    const rnd = rng(seed), step = 0.38, rad = 0.85;
    const nodes = [{ x: start.x, z: start.z, p: -1, c: 0 }];
    let goalIdx = -1, best = Infinity;
    for (let it = 0; it < 1100; it++) {
      let sx, sz;
      if (rnd() < 0.07) { sx = goal.x; sz = goal.z; } else { sx = B.x0 + rnd() * (B.x1 - B.x0); sz = B.z0 + rnd() * (B.z1 - B.z0); }
      let ni = 0, nd = Infinity;
      for (let i = 0; i < nodes.length; i++) { const d = (nodes[i].x - sx) ** 2 + (nodes[i].z - sz) ** 2; if (d < nd) { nd = d; ni = i; } }
      const n = nodes[ni], d = Math.sqrt(nd); if (d < 1e-6) continue;
      const k = Math.min(1, step / d), q = { x: n.x + (sx - n.x) * k, z: n.z + (sz - n.z) * k };
      if (!free(q.x, q.z) || !segFree(n, q)) continue;
      let pi = ni, pc = n.c + Math.hypot(q.x - n.x, q.z - n.z); const near = [];
      for (let i = 0; i < nodes.length; i++) { const m = nodes[i], dd = Math.hypot(m.x - q.x, m.z - q.z); if (dd < rad) { near.push(i); if (m.c + dd < pc && segFree(m, q)) { pc = m.c + dd; pi = i; } } }
      q.p = pi; q.c = pc; const qi = nodes.push(q) - 1;
      for (const i of near) { const m = nodes[i], dd = Math.hypot(m.x - q.x, m.z - q.z); if (q.c + dd < m.c && segFree(q, m)) { m.p = qi; m.c = q.c + dd; } }
      const gd = Math.hypot(q.x - goal.x, q.z - goal.z);
      if (gd < step && segFree(q, goal) && q.c + gd < best) { best = q.c + gd; goalIdx = qi; }
    }
    let path = [];
    if (goalIdx >= 0) { path.push({ x: goal.x, z: goal.z }); for (let i = goalIdx; i >= 0; i = nodes[i].p) path.push({ x: nodes[i].x, z: nodes[i].z }); path.reverse(); }
    else path = [start, goal];
    const short = [path[0]];
    for (let i = 0; i < path.length - 1;) { let j = path.length - 1; while (j > i + 1 && !segFree(path[i], path[j])) j--; short.push(path[j]); i = j; }
    return { nodes, path, short };
  }

  const waypoints = [{ x: -2.9, z: 2.05 }, { x: 2.95, z: -2.1 }, { x: -2.85, z: -2.0 }, { x: 2.9, z: 2.05 }];
  const legs = [];
  for (let k = 0; k < waypoints.length; k++) {
    const a = waypoints[k], b = waypoints[(k + 1) % waypoints.length];
    const plan = rrtStar(a, b, 11 + k * 7);
    // tree edges in creation order
    const pos = new Float32Array((plan.nodes.length - 1) * 6);
    for (let i = 1; i < plan.nodes.length; i++) {
      const n = plan.nodes[i], p = plan.nodes[n.p];
      pos.set([p.x, 0.03, p.z, n.x, 0.03, n.z], (i - 1) * 6);
    }
    const tg = new THREE.BufferGeometry(); tg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const tree = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0x3a7cc4, transparent: true, opacity: 0.55 }));
    tree.visible = false; G.add(tree);
    const pts = plan.short.map((p) => new THREE.Vector3(p.x, 0.05, p.z));
    const curve = new THREE.CatmullRomCurve3(pts.length > 2 ? pts : [pts[0], pts[0].clone().lerp(pts[pts.length - 1], 0.5), pts[pts.length - 1]], false, "centripetal", 0.3);
    const tube = mesh(new THREE.TubeGeometry(curve, 120, 0.028, 6, false), MAT.glowOrange, { cast: false });
    tube.visible = false; G.add(tube);
    const rawPts = plan.path.map((p) => new THREE.Vector3(p.x, 0.04, p.z));
    const raw = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rawPts), new THREE.LineBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.45 }));
    raw.visible = false; G.add(raw);
    const len = curve.getLength();
    const tGrow = 2.6, tShort = 0.9, tDrive = len / 0.75, tHold = 1.0;
    legs.push({ tree, tube, raw, curve, n: plan.nodes.length - 1, tGrow, tShort, tDrive, tHold, T: tGrow + tShort + tDrive + tHold, goal: b });
  }
  const goalRing = mesh(new THREE.RingGeometry(0.18, 0.26, 32), MAT.glowOrange, { cast: false }); goalRing.rotation.x = -Math.PI / 2; goalRing.position.y = 0.01; G.add(goalRing);

  // robot (small round base with a LiDAR)
  const bot = new THREE.Group(); G.add(bot);
  bot.add(at(cyl(0.2, 0.2, 0.1, MAT.body), 0, 0.08, 0));
  bot.add(at(cyl(0.19, 0.19, 0.02, MAT.white), 0, 0.14, 0));
  bot.add(at(cyl(0.05, 0.06, 0.07, MAT.dark), 0, 0.19, 0));
  bot.add(at(box(0.06, 0.02, 0.02, MAT.glowGreen), 0, 0.155, 0.17));
  for (const x of [-0.19, 0.19]) { const w = cyl(0.045, 0.045, 0.03, MAT.rubber); w.rotation.z = Math.PI / 2; w.position.set(x, 0.045, 0); bot.add(w); }
  const NR = 40, rayPos = new Float32Array(NR * 6);
  const rayGeo = new THREE.BufferGeometry(); rayGeo.setAttribute("position", new THREE.BufferAttribute(rayPos, 3));
  const rays = new THREE.LineSegments(rayGeo, new THREE.LineBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.35 }));
  G.add(rays);
  function castRay(ox, oz, dx, dz, maxR) {
    let best = maxR;
    for (const b of allBoxes) {
      const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
      let tmin = -Infinity, tmax = Infinity;
      if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) continue; } else { let a = (x0 - ox) / dx, c = (x1 - ox) / dx; if (a > c) [a, c] = [c, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); }
      if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) continue; } else { let a = (z0 - oz) / dz, c = (z1 - oz) / dz; if (a > c) [a, c] = [c, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); }
      if (tmax >= Math.max(tmin, 0) && tmin > 0 && tmin < best) best = tmin;
    }
    return best;
  }
  const total = legs.reduce((a, l) => a + l.T, 0);
  let curLeg = -1, phase = 0;
  s.update = (t) => {
    let u = t % total, k = 0;
    while (u > legs[k].T) { u -= legs[k].T; k++; }
    const L = legs[k];
    if (k !== curLeg) { legs.forEach((l, i) => { l.tree.visible = i === k; l.tube.visible = false; l.raw.visible = false; }); curLeg = k; }
    const g = prog(u, 0, L.tGrow);
    L.tree.geometry.setDrawRange(0, Math.floor(L.n * g) * 2);
    L.raw.visible = u > L.tGrow * 0.9;
    L.tube.visible = u > L.tGrow + L.tShort * 0.4;
    L.tree.material.opacity = u > L.tGrow + L.tShort ? 0.18 : 0.55;
    goalRing.position.x = L.goal.x; goalRing.position.z = L.goal.z;
    goalRing.scale.setScalar(1 + 0.15 * Math.sin(t * 5));
    let d = prog(u, L.tGrow + L.tShort, L.tGrow + L.tShort + L.tDrive);
    d = smooth(d) * 0.15 + d * 0.85;
    const p = L.curve.getPointAt(d), tg = L.curve.getTangentAt(Math.min(d, 0.999));
    bot.position.set(p.x, 0, p.z);
    const head = Math.atan2(tg.x, tg.z);
    if (u < L.tGrow + L.tShort) { const t0 = L.curve.getTangentAt(0.001); bot.rotation.y = angLerp(bot.rotation.y, Math.atan2(t0.x, t0.z), 0.08); }
    else bot.rotation.y = angLerp(bot.rotation.y, head, 0.25);
    for (let i = 0; i < NR; i++) {
      const a = bot.rotation.y + (i / NR) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      const r = castRay(p.x, p.z, dx, dz, 2.6);
      rayPos.set([p.x, 0.19, p.z, p.x + dx * r, 0.19, p.z + dz * r], i * 6);
    }
    rayGeo.attributes.position.needsUpdate = true;
    phase = u < L.tGrow ? 0 : u < L.tGrow + L.tShort ? 1 : u < L.T - L.tHold ? 2 : 3;
  };
  s.status = () => PROJECTS[s.idx].status[phase];
  addHit(s, 7.6, 1.2, 5.8);
}

// ============ 2. Mobile manipulator: find marker, pick, carry, place ============
{
  const s = addStation("manip", new THREE.Vector3(-9.5, 0, -4.5), { viewOffset: new THREE.Vector3(-1.4, 2.7, 3.9), lookY: 0.15 });
  const G = s.group;
  tapeRect(G, 0, 0, 5.4, 4.0);
  const A = new THREE.Vector3(1.7, 0, -0.9), Bz = new THREE.Vector3(-1.8, 0, 0.9), home = new THREE.Vector3(-0.2, 0, -0.3);
  tapeRect(G, Bz.x, Bz.z, 0.55, 0.55, MAT.glowOrange);
  // ArUco-like marker texture
  const mk = screenTexture(128, 128);
  { const c = mk.ctx; c.fillStyle = "#fff"; c.fillRect(0, 0, 128, 128); c.fillStyle = "#000"; c.fillRect(10, 10, 108, 108);
    const bits = [[1,0,1,1],[0,1,1,0],[1,1,0,1],[0,1,0,0]]; c.fillStyle = "#fff";
    bits.forEach((row, i) => row.forEach((b, j) => { if (b) c.fillRect(28 + j * 18, 28 + i * 18, 18, 18); })); mk.tex.needsUpdate = true; }
  const bs = 0.17;
  const boxMats = [MAT.card, MAT.card, new THREE.MeshStandardMaterial({ map: mk.tex, roughness: 0.6 }), MAT.card, MAT.card, MAT.card];
  const crate = new THREE.Mesh(new THREE.BoxGeometry(bs, bs, bs), boxMats); crate.castShadow = true; G.add(crate);

  // robot: round base + small arm
  const bot = new THREE.Group(); G.add(bot);
  bot.add(at(cyl(0.3, 0.3, 0.13, MAT.body), 0, 0.1, 0));
  bot.add(at(cyl(0.28, 0.28, 0.02, MAT.white), 0, 0.18, 0));
  bot.add(at(cyl(0.06, 0.07, 0.07, MAT.dark), 0, 0.22, -0.14));
  for (const x of [-0.29, 0.29]) { const w = cyl(0.06, 0.06, 0.04, MAT.rubber); w.rotation.z = Math.PI / 2; w.position.set(x, 0.06, 0); bot.add(w); }
  const arm = makeArm({ L1: 0.26, L2: 0.26, wrist: 0.09, baseH: 0.04, turretH: 0.07, t: 0.03, mat: MAT.dark, jointMat: MAT.body, baseMat: MAT.dark });
  arm.root.position.set(0, 0.19, 0.1); bot.add(arm.root);
  const cup = cyl(0.025, 0.035, 0.03, MAT.glowOrange); cup.position.y = 0.0; arm.tool.add(cup);

  const headTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
  const dirA = new THREE.Vector3().subVectors(A, home).setY(0).normalize();
  const P1 = A.clone().addScaledVector(dirA, -0.56);
  const dirB = new THREE.Vector3().subVectors(Bz, P1).setY(0).normalize();
  const P2 = Bz.clone().addScaledVector(dirB, -0.56);
  const hA = headTo(home, A), hB = headTo(P1, Bz), hHome = headTo(P2, home), h0 = hA;
  const T = 17;
  const stowLocal = new THREE.Vector3(0, 0.62, 0.16);
  let phase = 0;
  s.update = (t) => {
    const u = t % T;
    // base pose
    let pos = home.clone(), head = h0;
    if (u < 1.6) { head = hA + 0.45 * Math.sin(u * 4) * (1 - u / 1.6); phase = 0; }
    else if (u < 4.2) { pos = lerpV(home, P1, ease(prog(u, 1.6, 4.2))); head = hA; phase = 1; }
    else if (u < 6.8) { pos = P1; head = hA; phase = 2; }
    else if (u < 7.6) { pos = P1; head = angLerp(hA, hB, ease(prog(u, 6.8, 7.6))); phase = 3; }
    else if (u < 10.4) { pos = lerpV(P1, P2, ease(prog(u, 7.6, 10.4))); head = hB; phase = 3; }
    else if (u < 12.8) { pos = P2; head = hB; phase = 4; }
    else if (u < 13.6) { pos = P2; head = angLerp(hB, hHome, ease(prog(u, 12.8, 13.6))); phase = 5; }
    else if (u < 16.0) { pos = lerpV(P2, home, ease(prog(u, 13.6, 16.0))); head = hHome; phase = 5; }
    else { pos = home; head = angLerp(hHome, hA, ease(prog(u, 16.0, 17))); phase = 5; }
    bot.position.copy(pos); bot.rotation.y = head;
    bot.updateMatrixWorld(true);
    // arm target
    const stow = bot.localToWorld(stowLocal.clone());
    const aWorld = G.localToWorld(A.clone().setY(bs + 0.005));
    const bWorld = G.localToWorld(Bz.clone().setY(bs + 0.005));
    let tgt = stow, attached = false;
    if (u >= 4.2 && u < 6.8) {
      const above = aWorld.clone().add(new THREE.Vector3(0, 0.16, 0));
      if (u < 5.0) tgt = lerpV(stow, above, ease(prog(u, 4.2, 5.0)));
      else if (u < 5.5) tgt = lerpV(above, aWorld, ease(prog(u, 5.0, 5.5)));
      else { tgt = lerpV(aWorld, stow, ease(prog(u, 5.6, 6.8))); attached = u >= 5.55; }
    } else if (u >= 6.8 && u < 10.4) { attached = true; }
    else if (u >= 10.4 && u < 12.8) {
      const above = bWorld.clone().add(new THREE.Vector3(0, 0.16, 0));
      if (u < 11.2) { tgt = lerpV(stow, above, ease(prog(u, 10.4, 11.2))); attached = true; }
      else if (u < 11.7) { tgt = lerpV(above, bWorld, ease(prog(u, 11.2, 11.7))); attached = true; }
      else tgt = lerpV(bWorld, stow, ease(prog(u, 11.8, 12.8)));
    }
    arm.reach(tgt);
    if (attached) {
      const tp = toolWorld(arm); G.worldToLocal(tp); crate.position.set(tp.x, tp.y - bs / 2 - 0.012, tp.z); crate.rotation.y = head;
    } else if (u >= 11.7) { crate.position.set(Bz.x, bs / 2, Bz.z); }
    else if (u < 5.55) { crate.position.set(A.x, bs / 2, A.z); crate.rotation.y = 0.4; }
    cup.material = attached ? MAT.glowGreen : MAT.glowOrange;
  };
  s.status = () => PROJECTS[s.idx].status[phase];
  addHit(s, 5.4, 1.2, 4.0);
}

// ============ 3. Graph SLAM: drift, landmarks, loop closure ============
{
  const s = addStation("slam", new THREE.Vector3(9.5, 0, -4.5), { viewOffset: new THREE.Vector3(1.6, 6.6, 6.2), lookY: 0 });
  const G = s.group;
  tapeRect(G, 0, 0, 6.8, 5.4);
  const segs = [
    [-3, -2.3, 3, -2.3], [3, -2.3, 3, 2.3], [3, 2.3, -3, 2.3], [-3, 2.3, -3, -2.3],
    [-1.6, -0.75, 1.6, -0.75], [1.6, -0.75, 1.6, 0.75], [1.6, 0.75, -1.6, 0.75], [-1.6, 0.75, -1.6, -0.75],
  ];
  for (const [ax, az, bx, bz] of segs) {
    const L = Math.hypot(bx - ax, bz - az), m = box(L + 0.08, 0.42, 0.08, std(0x6f7a87, { r: 0.85 }));
    m.position.set((ax + bx) / 2, 0.21, (az + bz) / 2); m.rotation.y = -Math.atan2(bz - az, bx - ax); G.add(m);
  }
  // loop path: rounded rectangle through the corridor
  const pathPts = [];
  const rx = 2.3, rz = 1.52, cr = 0.55;
  const corners = [[rx - cr, -rz + cr, -Math.PI / 2], [rx - cr, rz - cr, 0], [-rx + cr, rz - cr, Math.PI / 2], [-rx + cr, -rz + cr, Math.PI]];
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= 10; i++) { const a = a0 + (i / 10) * (Math.PI / 2); pathPts.push(new THREE.Vector3(cx + cr * Math.cos(a), 0, cz + cr * Math.sin(a))); }
  const loop = new THREE.CatmullRomCurve3(pathPts, true, "centripetal");
  const Lp = loop.getLength();
  const P0 = loop.getPointAt(0);
  const drift = (sDist) => 0.02 * sDist; // radians of heading drift accumulated on odometry
  const warp = (p, d) => { const x = p.x - P0.x, z = p.z - P0.z, c = Math.cos(d), sn = Math.sin(d); return new THREE.Vector3(P0.x + c * x - sn * z, p.y, P0.z + sn * x + c * z); };

  const bot = new THREE.Group(); G.add(bot);
  bot.add(at(cyl(0.2, 0.2, 0.1, MAT.body), 0, 0.08, 0));
  bot.add(at(cyl(0.19, 0.19, 0.02, MAT.white), 0, 0.14, 0));
  bot.add(at(cyl(0.05, 0.06, 0.07, MAT.dark), 0, 0.19, 0));
  bot.add(at(box(0.06, 0.02, 0.02, MAT.glowGreen), 0, 0.155, 0.17));
  const ghost = mesh(new THREE.RingGeometry(0.16, 0.21, 28), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }), { cast: false });
  ghost.rotation.x = -Math.PI / 2; G.add(ghost);

  const MAXN = 80;
  const nodeMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 12, 10), MAT.glowBlue, MAXN); nodeMesh.count = 0; G.add(nodeMesh);
  const edgePos = new Float32Array(MAXN * 6);
  const edgeGeo = new THREE.BufferGeometry(); edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
  const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.8 })); G.add(edges);
  const lmColors = [0xff5fd2, 0x3ddc84, 0xffd34d, 0x5fd8ff];
  const lms = segs.map((sg, i) => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: lmColors[i % 4] })); line.visible = false; G.add(line);
    return { sg, line, seen: false, d: 0 };
  });
  const closeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xff8a2a }));
  closeLine.visible = false; G.add(closeLine);
  const speed = 1.05, tDrive = Lp / speed, tFix = 1.8, tHold = 2.2, T = tDrive + tFix + tHold;
  const dummy = new THREE.Object3D();
  let phase = 0, lastCycle = -1;
  const nodes = [];
  const distToSeg = (px, pz, [ax, az, bx, bz]) => { const vx = bx - ax, vz = bz - az; const w = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1); return Math.hypot(px - (ax + vx * w), pz - (az + vz * w)); };
  s.update = (t) => {
    const cyc = Math.floor(t / T), u = t - cyc * T;
    if (cyc !== lastCycle) { lastCycle = cyc; nodes.length = 0; lms.forEach((l) => { l.seen = false; l.line.visible = false; }); closeLine.visible = false; }
    const sd = Math.min(u, tDrive) * speed;
    const p = loop.getPointAt((sd / Lp) % 1), tg = loop.getTangentAt((sd / Lp) % 1);
    bot.position.set(p.x, 0, p.z); bot.rotation.y = Math.atan2(tg.x, tg.z);
    const fix = smooth(prog(u, tDrive, tDrive + tFix));
    // drop pose-graph nodes
    while (nodes.length < MAXN && nodes.length * 0.5 <= sd && u <= tDrive) {
      const sn = nodes.length * 0.5; nodes.push({ p: loop.getPointAt((sn / Lp) % 1), d: drift(sn) });
    }
    // observe walls (landmarks) when close
    for (const l of lms) if (!l.seen && u <= tDrive && distToSeg(p.x, p.z, l.sg) < 1.05) { l.seen = true; l.d = drift(sd); l.line.visible = true; }
    nodes.forEach((n, i) => {
      const q = warp(n.p, n.d * (1 - fix)); dummy.position.set(q.x, 0.05, q.z); dummy.updateMatrix(); nodeMesh.setMatrixAt(i, dummy.matrix);
      if (i > 0) { const a = nodes[i - 1], qa = warp(a.p, a.d * (1 - fix)); edgePos.set([qa.x, 0.05, qa.z, q.x, 0.05, q.z], (i - 1) * 6); }
    });
    nodeMesh.count = nodes.length; nodeMesh.instanceMatrix.needsUpdate = true;
    edgeGeo.setDrawRange(0, Math.max(0, nodes.length - 1) * 2); edgeGeo.attributes.position.needsUpdate = true;
    for (const l of lms) if (l.seen) {
      const [ax, az, bx, bz] = l.sg, d = l.d * (1 - fix);
      const a = warp(new THREE.Vector3(ax, 0.47, az), d), b = warp(new THREE.Vector3(bx, 0.47, bz), d);
      l.line.geometry.attributes.position.setXYZ(0, a.x, a.y, a.z); l.line.geometry.attributes.position.setXYZ(1, b.x, b.y, b.z); l.line.geometry.attributes.position.needsUpdate = true;
    }
    const est = warp(p, drift(sd) * (1 - fix)); ghost.position.set(est.x, 0.02, est.z);
    if (u > tDrive && nodes.length > 2) {
      closeLine.visible = true; const last = nodes[nodes.length - 1], qa = warp(last.p, last.d * (1 - fix)), q0 = nodes[0].p;
      closeLine.geometry.attributes.position.setXYZ(0, qa.x, 0.06, qa.z); closeLine.geometry.attributes.position.setXYZ(1, q0.x, 0.06, q0.z); closeLine.geometry.attributes.position.needsUpdate = true;
    }
    phase = u < tDrive * 0.35 ? 0 : u < tDrive ? 1 : u < tDrive + tFix ? 2 : 3;
  };
  s.status = () => PROJECTS[s.idx].status[phase];
  addHit(s, 6.8, 1.2, 5.4);
}

// ============ 4. Industrial arm cell: conveyor -> pallet ============
{
  const s = addStation("arm", new THREE.Vector3(-10.5, 0, 5.2), { viewOffset: new THREE.Vector3(-3.2, 3.6, 5.6), lookY: 0.9 });
  const G = s.group;
  tapeRect(G, 0, 0, 6.2, 4.4);
  const ped = box(0.8, 0.5, 0.8, MAT.dark); ped.position.y = 0.25; G.add(ped);
  const arm = makeArm({ L1: 1.15, L2: 1.0, wrist: 0.32, baseH: 0.22, turretH: 0.36, t: 0.11, mat: MAT.yellow, jointMat: MAT.dark });
  arm.root.position.y = 0.5; G.add(arm.root);
  // gripper fingers
  const palm = box(0.22, 0.05, 0.08, MAT.dark); arm.tool.add(palm);
  const fL = box(0.03, 0.12, 0.07, MAT.steel), fR = box(0.03, 0.12, 0.07, MAT.steel);
  fL.position.y = fR.position.y = 0.06; arm.tool.add(fL, fR);
  // conveyor
  const convZ = 1.35, convX0 = -3.0, convX1 = -0.75, convY = 0.55;
  const belt = box(convX1 - convX0 + 0.3, 0.08, 0.5, MAT.rubber); belt.position.set((convX0 + convX1) / 2, convY - 0.04, convZ); G.add(belt);
  const frame = box(convX1 - convX0 + 0.4, 0.06, 0.58, MAT.steel); frame.position.set((convX0 + convX1) / 2, convY - 0.11, convZ); G.add(frame);
  for (const x of [convX0, convX1]) for (const z of [-0.25, 0.25]) { const l = box(0.06, convY - 0.14, 0.06, MAT.steel); l.position.set(x, (convY - 0.14) / 2, convZ + z); G.add(l); }
  const rollers = [];
  for (let x = convX0; x <= convX1 + 0.01; x += 0.25) { const r = cyl(0.035, 0.035, 0.52, MAT.steel, 12); r.rotation.x = Math.PI / 2; r.position.set(x, convY - 0.02, convZ); G.add(r); rollers.push(r); }
  // pallet
  const pal = box(1.0, 0.14, 1.0, std(0x9c7448, { r: 0.9 })); pal.position.set(1.45, 0.07, 0.55); G.add(pal);
  const bs = 0.3;
  const slots = [[1.25, 0.35], [1.65, 0.35], [1.25, 0.75], [1.65, 0.75]].map(([x, z]) => new THREE.Vector3(x, 0.14 + bs, z));
  const crates = slots.map(() => { const c = box(bs, bs, bs, MAT.card); c.visible = false; G.add(c); return c; });
  const pick = new THREE.Vector3(convX1 - 0.05, convY + bs, convZ);
  const homeP = new THREE.Vector3(0.3, 1.55, 1.0);
  const T = 7.2;
  let phase = 0;
  const W = (v) => G.localToWorld(v.clone());
  s.update = (t) => {
    const n = Math.floor(t / T), u = t - n * T, k = n % 4;
    const slot = slots[k];
    const abovePick = pick.clone().add(new THREE.Vector3(0, 0.45, 0)), aboveSlot = slot.clone().add(new THREE.Vector3(0, 0.5, 0));
    let tgt = homeP;
    if (u < 2.0) tgt = homeP;
    else if (u < 3.0) tgt = lerpV(homeP, abovePick, ease(prog(u, 2.0, 3.0)));
    else if (u < 3.6) tgt = lerpV(abovePick, pick, ease(prog(u, 3.0, 3.6)));
    else if (u < 4.2) tgt = lerpV(pick, abovePick, ease(prog(u, 3.7, 4.2)));
    else if (u < 5.4) tgt = lerpV(abovePick, aboveSlot, ease(prog(u, 4.2, 5.4)));
    else if (u < 6.0) tgt = lerpV(aboveSlot, slot, ease(prog(u, 5.4, 6.0)));
    else if (u < 6.6) tgt = lerpV(slot, aboveSlot, ease(prog(u, 6.1, 6.6)));
    else tgt = lerpV(aboveSlot, homeP, ease(prog(u, 6.6, 7.2)));
    arm.reach(W(tgt));
    const holding = u >= 3.65 && u < 6.05;
    const grip = holding ? 0.165 : 0.21;
    fL.position.x = -grip / 2 - 0.015; fR.position.x = grip / 2 + 0.015;
    crates.forEach((c, j) => { c.visible = j < k || (k === 0 && false); if (j < k) c.position.copy(slots[j]).setY(slots[j].y - bs / 2); });
    const c = crates[k]; c.visible = true;
    if (u < 2.0) { const x = convX0 + (pick.x - convX0) * smooth(u / 2.0); c.position.set(x, convY + bs / 2, convZ); c.rotation.y = 0; }
    else if (u < 3.65) c.position.set(pick.x, convY + bs / 2, convZ);
    else if (holding) { const tp = toolWorld(arm); G.worldToLocal(tp); c.position.set(tp.x, tp.y - bs / 2 - 0.02, tp.z); c.rotation.y = arm.yaw.rotation.y; }
    else c.position.copy(slot).setY(slot.y - bs / 2);
    const moving = u < 2.0;
    rollers.forEach((r) => { if (moving) r.rotation.y += 0.15; });
    phase = u < 2.0 ? 0 : u < 4.2 ? 1 : 2;
  };
  s.status = () => PROJECTS[s.idx].status[phase];
  addHit(s, 6.2, 2.6, 4.4);
}

// ============ 5. Research: detection screen + patient graph ============
{
  const s = addStation("research", new THREE.Vector3(10.5, 0, 5.2), { viewOffset: new THREE.Vector3(1.6, 2.6, 6.2), lookY: 1.35, labelY: 3.3 });
  const G = s.group;
  tapeRect(G, 0, 0, 6.2, 4.4);
  const desk = box(2.6, 0.06, 1.0, std(0x3a3f47, { r: 0.7 })); desk.position.set(0, 0.76, 0.6); G.add(desk);
  for (const x of [-1.2, 1.2]) for (const z of [0.2, 1.0]) { const l = box(0.06, 0.76, 0.06, MAT.steel); l.position.set(x, 0.38, z); G.add(l); }
  const W_ = 3.4, H_ = 1.9;
  const scr = screenTexture(1024, 572);
  const screen = mesh(new THREE.PlaneGeometry(W_, H_), new THREE.MeshBasicMaterial({ map: scr.tex }), { cast: false });
  screen.position.set(0, 1.95, -0.6); G.add(screen);
  const bezel = box(W_ + 0.12, H_ + 0.12, 0.08, MAT.dark); bezel.position.set(0, 1.95, -0.65); G.add(bezel);
  const stand = box(0.12, 1.0, 0.12, MAT.dark); stand.position.set(0, 0.5, -0.65); G.add(stand);
  // lesion-like blobs (illustration only)
  const R = rng(3);
  const blobs = Array.from({ length: 8 }, (_, i) => ({ x: 120 + (i % 4) * 230 + R() * 60, y: 150 + Math.floor(i / 4) * 210 + R() * 40, r: 14 + R() * 20 }));
  const missIdx = 5, falseAlarm = { x: 470, y: 470, r: 22 };
  function drawScreen(t) {
    const c = scr.ctx, w = 1024, h = 572, u = t % 9;
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#d9a98a"); g.addColorStop(1, "#c98f71");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { c.fillStyle = "rgba(160,100,70,0.12)"; c.beginPath(); c.arc((i * 97) % w, (i * 53) % h, 30 + (i % 5) * 9, 0, 7); c.fill(); }
    for (const b of blobs) { const rg = c.createRadialGradient(b.x, b.y, 2, b.x, b.y, b.r); rg.addColorStop(0, "#3b2216"); rg.addColorStop(1, "rgba(80,45,30,0.15)"); c.fillStyle = rg; c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.fill(); }
    c.strokeStyle = "rgba(70,40,25,0.55)"; c.lineWidth = 2; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(430 + i * 14, 520); c.quadraticCurveTo(450 + i * 10, 470, 500 + i * 6, 430); c.stroke(); }
    const A = u < 4.5, k = A ? u / 4.5 : (u - 4.5) / 4.5, shown = Math.floor(k * 10);
    c.lineWidth = 4; c.font = "600 22px Inter, sans-serif";
    blobs.forEach((b, i) => {
      if (i >= shown) return;
      if (A && i === missIdx) { c.setLineDash([10, 8]); c.strokeStyle = "#ff3b3b"; c.beginPath(); c.arc(b.x, b.y, b.r + 18, 0, 7); c.stroke(); c.setLineDash([]); c.fillStyle = "#ff3b3b"; c.fillText("missed", b.x - 30, b.y + b.r + 44); return; }
      c.strokeStyle = A ? "#ff8a2a" : "#3aa0ff"; const p = b.r + 10; c.strokeRect(b.x - p, b.y - p, 2 * p, 2 * p);
    });
    if (!A && shown > 6) { const p = 34; c.strokeStyle = "#ff3b3b"; c.strokeRect(falseAlarm.x - p, falseAlarm.y - p, 2 * p, 2 * p); c.fillStyle = "#ff3b3b"; c.fillText("false alarm (hair)", falseAlarm.x - 80, falseAlarm.y - p - 10); }
    c.fillStyle = "rgba(10,12,15,0.78)"; c.fillRect(0, 0, w, 54);
    c.font = "700 26px Inter, sans-serif"; c.fillStyle = A ? "#ff8a2a" : "#3aa0ff";
    c.fillText(A ? "Detector A" : "Detector B", 22, 36);
    c.fillStyle = "#e8ecf1"; c.font = "500 22px Inter, sans-serif";
    c.fillText(A ? "misses a small lesion" : "finds them all, plus a false alarm", 180, 36);
    c.fillStyle = "#9aa5b3"; c.font = "500 18px Inter, sans-serif"; c.fillText("Illustration: similar F1, different mistakes", w - 400, 34);
    scr.tex.needsUpdate = true;
  }
  // patient graph above the desk
  const gGroup = new THREE.Group(); gGroup.position.set(-0.2, 1.25, 0.7); gGroup.scale.setScalar(0.62); G.add(gGroup);
  const RG = rng(21), gn = Array.from({ length: 14 }, () => new THREE.Vector3((RG() - 0.5) * 1.6, (RG() - 0.5) * 0.7, (RG() - 0.5) * 0.9));
  const hiMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a }), loMat = new THREE.MeshBasicMaterial({ color: 0x3aa0ff });
  const gNodes = gn.map((p, i) => { const m = mesh(new THREE.SphereGeometry(0.06, 14, 10), i % 4 === 0 ? hiMat : loMat, { cast: false }); m.position.copy(p); gGroup.add(m); return m; });
  const ep = [];
  gn.forEach((p, i) => { gn.map((q, j) => [j, p.distanceTo(q)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 2).forEach(([j]) => ep.push(p, gn[j])); });
  gGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ep), new THREE.LineBasicMaterial({ color: 0x8fb8e6, transparent: true, opacity: 0.45 })));
  let phase = 0, acc = 0;
  s.update = (t, dt, near) => {
    gGroup.rotation.y = t * 0.3;
    gNodes.forEach((m, i) => m.scale.setScalar(1 + 0.25 * Math.max(0, Math.sin(t * 2 + i))));
    acc += dt;
    if (near && acc > 1 / 20) { acc = 0; drawScreen(t); }
    phase = t % 9 < 4.5 ? 0 : 1;
  };
  drawScreen(0.1);
  s.status = () => PROJECTS[s.idx].status[phase];
  addHit(s, 6.2, 3.0, 4.4);
}

// ============ Terrain: camera predicts hazards, IMU confirms ============
{
  const s = addStation("terrain", new THREE.Vector3(0, 0, 5.0), { viewOffset: new THREE.Vector3(0.2, 4.4, 7.0), lookY: 0.3, labelY: 2.2, shift: 0.14 });
  const G = s.group;
  tapeRect(G, 0, 0, 7.8, 3.3);
  const X0 = -3.4, X1 = 3.4, Wd = 1.5;
  const surf = [
    { name: "red rubber path", x0: -3.4, x1: -1.6, cam: 3.6, imu: 0.51, col: "#8c3a33" },
    { name: "wood chips", x0: -1.6, x1: -0.1, cam: 7.5, imu: 0.41, col: "#7a5a3a" },
    { name: "grass", x0: -0.1, x1: 1.5, cam: 6.8, imu: 0.29, col: "#3f6a31" },
    { name: "asphalt", x0: 1.5, x1: 3.4, cam: 3.9, imu: 2.2, col: "#3b3e44" },
  ];
  // ground strip texture
  const gt = screenTexture(2048, 452), R = rng(5), gx = (x) => ((x - X0) / (X1 - X0)) * 2048;
  for (const sf of surf) {
    const a = gx(sf.x0), b = gx(sf.x1); gt.ctx.fillStyle = sf.col; gt.ctx.fillRect(a, 0, b - a, 452);
    const n = sf.name === "wood chips" ? 2600 : sf.name === "grass" ? 3200 : 900;
    for (let i = 0; i < n; i++) {
      const x = a + R() * (b - a), y = R() * 452;
      if (sf.name === "wood chips") { gt.ctx.fillStyle = R() > 0.5 ? "#a07a4e" : "#5a3f27"; gt.ctx.fillRect(x, y, 6 + R() * 10, 2 + R() * 3); }
      else if (sf.name === "grass") { gt.ctx.strokeStyle = R() > 0.5 ? "#5e8f45" : "#2f5426"; gt.ctx.beginPath(); gt.ctx.moveTo(x, y); gt.ctx.lineTo(x + (R() - 0.5) * 6, y - 6 - R() * 8); gt.ctx.stroke(); }
      else { gt.ctx.fillStyle = R() > 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.18)"; gt.ctx.fillRect(x, y, 3, 3); }
    }
  }
  gt.ctx.strokeStyle = "rgba(20,20,20,0.6)"; gt.ctx.lineWidth = 3; // a few cracks in the asphalt
  for (let k = 0; k < 3; k++) { let x = gx(1.8 + k * 0.5), y = 60 + k * 120; gt.ctx.beginPath(); gt.ctx.moveTo(x, y); for (let i = 0; i < 8; i++) { x += 12 + R() * 14; y += (R() - 0.5) * 30; gt.ctx.lineTo(x, y); } gt.ctx.stroke(); }
  gt.tex.needsUpdate = true;
  const strip = mesh(new THREE.PlaneGeometry(X1 - X0, Wd), new THREE.MeshStandardMaterial({ map: gt.tex, roughness: 0.95 }), { cast: false });
  strip.rotation.x = -Math.PI / 2; strip.position.y = 0.006; G.add(strip);

  // hazards along the route
  const outline = (w, h, d) => new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: 0xff8a2a }));
  function label(text) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 64; const x = c.getContext("2d");
    x.fillStyle = "rgba(13,16,20,0.85)"; x.fillRect(0, 0, 256, 64); x.font = "700 30px Inter, sans-serif"; x.fillStyle = "#ffb15c"; x.fillText(text, 14, 43);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); sp.scale.set(0.62, 0.155, 1); return sp;
  }
  const hz = [
    { x: -2.3, w: 0.22, h: 0.05, d: 0.16, z: 0.18, mat: std(0x22345c), text: "bump 47 mm" },
    { x: 0.6, w: 0.12, h: 0.025, d: 1.0, z: 0, mat: std(0xb8875a), text: "bump 19 mm" },
    { x: 2.45, w: 0.3, h: 0.04, d: 0.22, z: -0.2, mat: std(0x1a1d22), text: "hole 40 mm", hole: true },
  ].map((h) => {
    const m = h.hole ? mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshBasicMaterial({ color: 0x0b0c0e }), { cast: false }) : box(h.w, h.h, h.d, h.mat);
    if (h.hole) { m.rotation.x = -Math.PI / 2; m.scale.set(1, 0.75, 1); m.position.set(h.x, 0.009, h.z); } else m.position.set(h.x, h.h / 2, h.z);
    G.add(m);
    const o = outline(h.w + 0.06, Math.max(h.h, 0.02) + 0.05, h.d + 0.06); o.position.set(h.x, 0.04, h.z); o.visible = false; G.add(o);
    const l = label(h.text); l.position.set(h.x, 0.42, h.z); l.visible = false; G.add(l);
    return { ...h, o, l, seen: false, front: false, rear: false };
  });

  // skid-steer robot with an arm holding the depth camera
  const robot = new THREE.Group(); G.add(robot);
  const body = new THREE.Group(); body.position.y = 0.2; robot.add(body);
  body.add(at(box(0.93, 0.2, 0.6, MAT.body), 0, 0.1, 0));
  body.add(at(box(0.95, 0.03, 0.62, MAT.orange), 0, 0.215, 0));
  body.add(at(cyl(0.06, 0.07, 0.08, MAT.dark), -0.2, 0.27, 0));
  const armBase = at(cyl(0.06, 0.07, 0.06, MAT.dark), 0.3, 0.26, 0); body.add(armBase);
  const up = at(box(0.05, 0.36, 0.05, MAT.white), 0.3, 0.46, 0); body.add(up);
  const fore = at(box(0.34, 0.045, 0.045, MAT.white), 0.45, 0.62, 0); fore.rotation.z = -0.35; body.add(fore);
  const cam = at(box(0.05, 0.03, 0.11, MAT.dark), 0.62, 0.55, 0); cam.rotation.z = -0.7; body.add(cam);
  const wheels = [];
  for (const wx of [-0.3, 0.3]) for (const wz of [-0.35, 0.35]) {
    const w = cyl(0.165, 0.165, 0.11, MAT.rubber, 20); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.165, wz); robot.add(w); wheels.push(w);
  }
  // camera footprint on the ground, 0.75 to 1.65 m ahead of the robot centre
  const band = new THREE.Shape([new THREE.Vector2(0.75, -0.42), new THREE.Vector2(1.65, -0.62), new THREE.Vector2(1.65, 0.62), new THREE.Vector2(0.75, 0.42)]);
  const fp = mesh(new THREE.ShapeGeometry(band), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }), { cast: false });
  fp.rotation.x = Math.PI / 2; fp.position.y = 0.02; robot.add(fp);

  // live chart: camera unevenness and IMU shaking
  const scr = screenTexture(768, 300);
  const screen = mesh(new THREE.PlaneGeometry(2.3, 0.9), new THREE.MeshBasicMaterial({ map: scr.tex }), { cast: false });
  screen.position.set(-0.4, 1.35, -1.25); G.add(screen);
  const sb = box(2.38, 0.98, 0.05, MAT.dark); sb.position.set(-0.4, 1.35, -1.29); G.add(sb);
  for (const x of [-1.4, 0.6]) { const p = box(0.05, 0.9, 0.05, MAT.dark); p.position.set(x, 0.45, -1.29); G.add(p); }
  const hist = [];
  function drawChart(sf, jolt) {
    const c = scr.ctx, W = 768, H = 300;
    c.fillStyle = "#18202a"; c.fillRect(0, 0, W, H);
    c.font = "700 22px Inter, sans-serif"; c.fillStyle = "#d6dde6"; c.fillText("Surface: " + sf.name, 16, 30);
    c.font = "500 17px Inter, sans-serif"; c.fillStyle = "#9aa5b3"; c.fillText("typical values from our outdoor runs", W - 330, 30);
    const rows = [["camera unevenness (mm)", 0, 10, "#ff8a2a", 0], ["IMU fast/slow shaking", 0, 2.6, "#3aa0ff", 1], ["IMU vertical jolt", 0, 1, "#3ddc84", 2]];
    rows.forEach(([name, lo, hi, col, k], i) => {
      const y0 = 70 + i * 76, y1 = y0 + 58;
      c.fillStyle = "#9aa5b3"; c.font = "500 15px JetBrains Mono, monospace"; c.fillText(name, 16, y0 - 6);
      c.strokeStyle = "#2f3945"; c.lineWidth = 1; c.strokeRect(16, y0, W - 32, 58);
      c.strokeStyle = col; c.lineWidth = 3; c.beginPath();
      hist.forEach((v, j) => { const x = 16 + (j / 300) * (W - 32), y = y1 - ((v[k] - lo) / (hi - lo)) * 58; j ? c.lineTo(x, Math.max(y0, y)) : c.moveTo(x, Math.max(y0, y)); });
      c.stroke();
    });
    scr.tex.needsUpdate = true;
  }
  const speed = 0.45, T = (X1 - X0 + 0.6) / speed + 1.2;
  let pitch = 0, pitchV = 0, joltT = -9, cycle = -1, acc = 0, msg = "";
  s.update = (t, dt, near) => {
    const n = Math.floor(t / T), u = t - n * T;
    if (n !== cycle) { cycle = n; hz.forEach((h) => { h.seen = h.front = h.rear = false; h.o.visible = h.l.visible = false; h.o.material.color.set(0xff8a2a); }); hist.length = 0; }
    const x = Math.min(X0 - 0.3 + u * speed, X1 + 0.3);
    robot.position.set(x, 0, 0);
    const moving = x < X1 + 0.3;
    wheels.forEach((w) => { if (moving) w.rotation.y += (speed * dt) / 0.165; });
    msg = "";
    for (const h of hz) {
      const ahead = h.x - x;
      if (!h.seen && ahead > 0.75 && ahead < 1.65) { h.seen = true; h.o.visible = h.l.visible = true; }
      if (h.seen && !h.front && ahead > 0) msg = "Camera sees a " + h.text + " ahead";
      if (!h.front && x + 0.3 >= h.x) { h.front = true; pitchV += h.hole ? -0.9 : 1.1; joltT = t; h.o.material.color.set(0x3ddc84); msg = "IMU confirms: front wheels hit it"; }
      if (!h.rear && x - 0.3 >= h.x) { h.rear = true; pitchV += h.hole ? 0.7 : -0.9; joltT = t; msg = "Second jolt from the rear wheels"; }
      if (h.front && t - joltT < 0.9 && !msg) msg = h.rear ? "Second jolt from the rear wheels" : "IMU confirms: front wheels hit it";
    }
    pitchV += (-90 * pitch - 9 * pitchV) * dt; pitch += pitchV * dt;
    body.rotation.z = pitch * 0.12;
    const sf = x < X0 ? surf[0] : surf.find((q) => x >= q.x0 && x < q.x1) || surf[surf.length - 1];
    const jitter = (R() - 0.5);
    const jolt = Math.max(0, 1 - (t - joltT) * 3) * (0.7 + 0.3 * R());
    hist.push([sf.cam + jitter * 0.8, sf.imu * (1 + jitter * 0.35), jolt]); if (hist.length > 300) hist.shift();
    acc += dt;
    if (near && acc > 1 / 20) { acc = 0; drawChart(sf, jolt); }
    if (!msg) msg = "Surface: " + sf.name + " · IMU fast/slow about " + sf.imu;
  };
  s.status = () => msg;
  addHit(s, 7.8, 1.6, 3.3);
}

// ============ 6. AGV on the perimeter lane ============
{
  const s = addStation("agv", new THREE.Vector3(0, 0, 0), { viewOffset: new THREE.Vector3(4.5, 3.4, 5.5), lookY: 0.3, labelY: 1.2 });
  const G = s.group;
  const lx = 15.8, lz0 = -11.2, lz1 = 10.6, rr = 1.5;
  const lanePts = [];
  const cc = [[lx - rr, lz0 + rr, -Math.PI / 2], [lx - rr, lz1 - rr, 0], [-lx + rr, lz1 - rr, Math.PI / 2], [-lx + rr, lz0 + rr, Math.PI]];
  for (const [cx, cz, a0] of cc) for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * (Math.PI / 2); lanePts.push(new THREE.Vector3(cx + rr * Math.cos(a), 0, cz + rr * Math.sin(a))); }
  const lane = new THREE.CatmullRomCurve3(lanePts, true, "centripetal");
  const LL = lane.getLength();
  const lp = lane.getSpacedPoints(130);
  for (let i = 0; i < lp.length - 1; i += 2) for (const o of [-0.55, 0.55]) {
    const a = lp[i], b = lp[i + 1], d = new THREE.Vector3().subVectors(b, a).normalize(), n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(o);
    tape(G, a.x + n.x, a.z + n.z, b.x + n.x, b.z + n.z, 0.07);
  }
  const agv = new THREE.Group(); G.add(agv);
  agv.add(at(box(0.7, 0.18, 1.0, MAT.body), 0, 0.14, 0));
  agv.add(at(box(0.72, 0.03, 1.02, MAT.orange), 0, 0.235, 0));
  agv.add(at(box(0.5, 0.3, 0.6, std(0x2f6fb0, { r: 0.7 })), 0, 0.4, 0));
  agv.add(at(box(0.08, 0.05, 0.03, MAT.glowGreen), 0, 0.16, 0.51));
  agv.add(at(cyl(0.05, 0.06, 0.06, MAT.dark), 0, 0.28, 0.42));
  const hb = addHit(s, 1.0, 0.9, 1.3, 0, 0.45, 0); agv.add(hb);
  s.dynamic = agv;
  s.update = (t) => {
    const u = ((t * 1.3) / LL) % 1, p = lane.getPointAt(u), tg = lane.getTangentAt(u);
    agv.position.copy(p); agv.rotation.y = Math.atan2(tg.x, tg.z);
    s.anchor.set(p.x, 1.25, p.z);
    s.center.set(p.x, 0, p.z);
  };
  s.status = () => PROJECTS[s.idx].status[0];
}

// ---------------------------------------------------------------- labels
const labelsEl = document.getElementById("labels");
for (const s of stations) {
  const el = document.createElement("button");
  el.className = "tag3d";
  el.innerHTML = `<span class="num">${String(s.idx + 1).padStart(2, "0")}</span>${PROJECTS[s.idx].label}`;
  el.onclick = () => PF.select(s.idx);
  labelsEl.appendChild(el);
  s.label = el;
}
const v3 = new THREE.Vector3();
const introEl = document.getElementById("intro");
function updateLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const ir = !introEl.classList.contains("away") ? introEl.getBoundingClientRect() : null;
  for (const s of stations) {
    v3.copy(s.anchor).project(camera);
    const vis = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
    const sx = ((v3.x + 1) / 2) * w, sy = ((1 - v3.y) / 2) * h;
    const underIntro = ir && sx < ir.right + 40 && sy > ir.top - 40 && sy < ir.bottom + 20;
    const hide = !vis || underIntro || (PF.current >= 0 && PF.current !== s.idx);
    s.label.classList.toggle("hidden", hide);
    s.label.classList.toggle("active", PF.current === s.idx);
    if (vis) s.label.style.transform = `translate(-50%, -100%) translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px)`;
    s.label.style.left = "0"; s.label.style.top = "0";
  }
}

// ---------------------------------------------------------------- camera views + flying
const OVERVIEW = () => (isSmall()
  ? { pos: new THREE.Vector3(0, 30, 36), target: new THREE.Vector3(0, 0, 0) }
  : { pos: new THREE.Vector3(-2.6, 19.5, 27), target: new THREE.Vector3(-2.6, 0, 0.8) });
function viewFor(s) {
  const target = s.center.clone().add(new THREE.Vector3(0, s.lookY, 0));
  const pos = target.clone().add(s.viewOffset);
  const dir = new THREE.Vector3().subVectors(target, pos).normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  if (isSmall()) { target.y -= 0.9; pos.y -= 0.2; pos.addScaledVector(dir, -1.5); }
  else { const shift = s.viewOffset.length() * s.shift; target.addScaledVector(right, shift); pos.addScaledVector(right, shift); }
  return { pos, target };
}
let fly = null, follow = null;
function flyTo(v, dur = 1.6) {
  controls.autoRotate = false;
  if (reduceMotion) dur = 0.01;
  fly = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to: v, t: 0, dur };
  controls.enabled = false;
}
PF.hooks.select = (i) => {
  const s = stations.find((x) => x.idx === i);
  if (!s) return;
  follow = s.dynamic ? s : null;
  flyTo(viewFor(s));
};
PF.hooks.overview = () => { follow = null; flyTo(OVERVIEW()); };

// ---------------------------------------------------------------- picking
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null;
function pickAt(ev) {
  const r = canvas.getBoundingClientRect();
  mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(hits, false)[0];
  return hit ? hit.object.userData.station : null;
}
canvas.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; idleT = 0; controls.autoRotate = false; });
canvas.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
  const s = pickAt(e);
  if (s) PF.select(s.idx);
});
let lastMove = 0;
canvas.addEventListener("pointermove", (e) => {
  const now = performance.now(); if (now - lastMove < 60) return; lastMove = now;
  canvas.classList.toggle("pointer", !!pickAt(e));
});
controls.addEventListener("start", () => { idleT = 0; controls.autoRotate = false; });

// ---------------------------------------------------------------- loop
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
const ov = OVERVIEW(); camera.position.copy(ov.pos); controls.target.copy(ov.target); controls.update();

let running = true;
new IntersectionObserver(([e]) => { running = e.isIntersecting; if (running) clock.getDelta(); }, { threshold: 0.02 }).observe(hero);
document.addEventListener("visibilitychange", () => { if (!document.hidden) clock.getDelta(); });

scene.updateMatrixWorld(true);
const clock = new THREE.Clock();
let t = 0, idleT = 0;
const lastAgv = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  if (!running || document.hidden) return;
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);
  t += dt;
  for (const s of stations) {
    const near = PF.current === s.idx || PF.current < 0 || camera.position.distanceTo(s.center) < 14;
    s.update(t, dt, near);
  }
  if (fly) {
    fly.t += Math.min(raw, 0.25) / fly.dur;
    const k = ease(Math.min(1, fly.t));
    let toPos = fly.to.pos, toTarget = fly.to.target;
    if (follow) { const v = viewFor(follow); toPos = v.pos; toTarget = v.target; }
    camera.position.lerpVectors(fly.from.pos, toPos, k);
    controls.target.lerpVectors(fly.from.target, toTarget, k);
    if (fly.t >= 1) { fly = null; controls.enabled = true; if (follow) lastAgv.copy(follow.center); }
  } else if (follow) {
    const d = new THREE.Vector3().subVectors(follow.center, lastAgv);
    camera.position.add(d); controls.target.add(d); lastAgv.copy(follow.center);
  }
  if (PF.current < 0 && !fly && !reduceMotion) { idleT += dt; if (idleT > 5) controls.autoRotate = true; }
  controls.update();
  updateLabels();
  const cur = stations.find((s) => s.idx === PF.current);
  PF.setStatus(cur && !fly ? cur.status() : "");
  renderer.render(scene, camera);
}
frame();
