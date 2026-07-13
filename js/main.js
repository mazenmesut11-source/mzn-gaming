import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildSupercar, randomTrafficCar } from './cars.js';
import { HandControl } from './hand.js';
import { NetPeer, makeRoomCode } from './net.js';

// #test → run the loop even in a hidden tab (headless verification)
const TEST_MODE = location.hash === '#test';
if (TEST_MODE) {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  addEventListener('error', (e) => console.error('GAME ERROR:', e.message, e.filename, e.lineno));
}

/* ================= DOM ================= */
const $ = (id) => document.getElementById(id);
const menuEl = $('menu'), overEl = $('gameover'), hudEl = $('hud');
const camBox = $('camBox'), wheelBox = $('wheelBox'), wheelSvg = $('wheelSvg');
const scoreEl = $('score'), bestEl = $('best'), speedEl = $('speed'), comboEl = $('combo');

/* ================= RENDERER / SCENE ================= */
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // full sharpness — perf comes from merged draw calls instead
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // cinematic contrast
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const DUSK = 0x1c1233; // deep synthwave purple night
scene.background = new THREE.Color(DUSK);
scene.fog = new THREE.Fog(DUSK, 70, 260);

// Reflection environment — a synthwave sky/sun/ground gradient baked into an
// env map so car paint reflects the scene mood (glossy premium look).
(function buildEnvironment() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.00, '#120a2a'); // zenith
  g.addColorStop(0.42, '#3a2470');
  g.addColorStop(0.55, '#ff7b3a'); // sun band on the horizon
  g.addColorStop(0.60, '#ff9d4a');
  g.addColorStop(0.66, '#2a1a44');
  g.addColorStop(1.00, '#08040f'); // ground
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  pmrem.dispose();
})();

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 500);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* Lights — sunset vibe */
scene.add(new THREE.HemisphereLight(0x7a5cff, 0x120a22, 0.85));
const sun = new THREE.DirectionalLight(0xff9d4a, 1.1);
sun.position.set(0, 35, -80);
sun.castShadow = true;
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

// Big orange sun centered at the end of the road (synthwave horizon)
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(42, 48),
  new THREE.MeshBasicMaterial({ color: 0xff8c2a, fog: false })
);
sunDisc.position.set(0, 26, -290);
scene.add(sunDisc);
const sunGlow = new THREE.Mesh(
  new THREE.CircleGeometry(62, 48),
  new THREE.MeshBasicMaterial({ color: 0xff6a2a, fog: false, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending })
);
sunGlow.position.set(0, 26, -291);
scene.add(sunGlow);

// Starfield
{
  const pos = [];
  for (let i = 0; i < 500; i++) {
    pos.push((Math.random() - 0.5) * 700, 30 + Math.random() * 220, -140 - Math.random() * 260);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, fog: false, transparent: true, opacity: 0.85 }));
  scene.add(stars);
}

/* ================= ROAD & WORLD ================= */
const ROAD_W = 15, LANES = [-5.25, -1.75, 1.75, 5.25], EDGE = 6.2;
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(ROAD_W, 600),
  new THREE.MeshStandardMaterial({ color: 0x121218, roughness: 0.45, metalness: 0.35 }) // wet asphalt sheen
);
road.rotation.x = -Math.PI / 2;
road.position.z = -200;
road.receiveShadow = true;
scene.add(road);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshStandardMaterial({ color: 0x0a0616, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, -0.02, -200);
scene.add(ground);

// Lane dashes + edge studs — merged into just 2 meshes. The layout repeats every
// 9 units, so the whole group scrolls and wraps by one period: same look, ~2 draw calls.
const stripeGroup = new THREE.Group();
{
  const dashGeos = [], studGeos = [];
  for (const x of [-3.5, 0, 3.5]) {
    for (let z = 18; z > -420; z -= 9) {
      const g = new THREE.PlaneGeometry(0.22, 3);
      g.rotateX(-Math.PI / 2);
      g.translate(x, 0.01, z);
      dashGeos.push(g);
    }
  }
  for (const x of [-ROAD_W / 2 - 0.6, ROAD_W / 2 + 0.6]) {
    for (let z = 18; z > -420; z -= 9) {
      const g = new THREE.SphereGeometry(0.16, 6, 6);
      g.translate(x, 0.12, z);
      studGeos.push(g);
    }
  }
  stripeGroup.add(
    new THREE.Mesh(mergeGeometries(dashGeos), new THREE.MeshBasicMaterial({ color: 0xcfcfd8 })),
    new THREE.Mesh(mergeGeometries(studGeos), new THREE.MeshBasicMaterial({ color: 0xffe04a }))
  );
  scene.add(stripeGroup);
}
// Edge lines (static)
for (const x of [-ROAD_W / 2 + 0.3, ROAD_W / 2 - 0.3]) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 600),
    new THREE.MeshBasicMaterial({ color: 0xffd10a, transparent: true, opacity: 0.55 }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(x, 0.01, -200);
  scene.add(line);
}

// Streetlights + neon buildings — all static geometry is merged into two big
// "chunks" that scroll and leapfrog: a handful of draw calls instead of hundreds.

// --- Facade textures: tileable emissive window grids (a few variants shared by all towers) ---
function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#07070d';
  ctx.fillRect(0, 0, 64, 128);
  const cols = 4, rows = 8, cw = 64 / cols, rh = 128 / rows;
  for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
    const r = Math.random();
    if (r < 0.30) ctx.fillStyle = 'rgba(255,214,150,0.95)';       // warm lit office
    else if (r < 0.42) ctx.fillStyle = 'rgba(160,200,255,0.85)';  // cool lit
    else if (r < 0.50) ctx.fillStyle = 'rgba(96,96,150,0.55)';    // dim
    else ctx.fillStyle = 'rgba(16,16,28,0.95)';                   // dark
    ctx.fillRect(x * cw + 2.5, y * rh + 2.5, cw - 5, rh - 5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const WINDOW_TEXES = Array.from({ length: 5 }, windowTexture);
// 5 shared facade materials — window tiling is baked into each tower's UVs instead
// of per-building texture clones, so towers with the same variant can merge.
const FACADE_MATS = WINDOW_TEXES.map((tex) => new THREE.MeshStandardMaterial({
  color: 0x0f0f1c, roughness: 0.85,
  emissive: 0xffffff, emissiveIntensity: 0.9, emissiveMap: tex,
}));

// --- Glowing rooftop/facade signs ---
const SIGN_TEXES = (() => {
  const texts = ['MZN GAMING', 'NITRO', 'SYNTH FM', 'TURBO', 'NIGHT DRIVE', 'MZN'];
  const colors = ['#ff2d6e', '#18e2ff', '#ffd10a', '#b02dff', '#2dff6e', '#ff9d0a'];
  return texts.map((t, i) => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, 256, 96);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = colors[i]; ctx.shadowBlur = 18;
    ctx.fillStyle = colors[i];
    ctx.font = `bold ${t.length > 8 ? 34 : 46}px Arial`;
    ctx.fillText(t, 128, 50);
    return new THREE.CanvasTexture(c);
  });
})();

const SIGN_MATS = SIGN_TEXES.map((tex) => new THREE.MeshBasicMaterial({ map: tex }));
const DARK_MAT = new THREE.MeshStandardMaterial({ color: 0x23232e, roughness: 0.85 });
const NEON_MAT = new THREE.MeshBasicMaterial({ vertexColors: true });
const OUTLINE_MAT = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75 });
const NEON_COLORS = [0xff2d6e, 0x18e2ff, 0xb02dff, 0x18c2ff];
const CHUNK_LEN = 450;

// One 450m band of city, merged into ≤8 draw calls + a few billboard planes.
function buildSceneryChunk() {
  const chunk = new THREE.Group();
  const windowGeos = [[], [], [], [], []];
  const darkGeos = [], neonGeos = [], lineGeos = [];
  const col = new THREE.Color();

  const tint = (geo, hex) => { // per-vertex color so one material draws all neon parts
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    col.set(hex);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  };

  // Tower block: window texture tiles at constant real-world size (baked into UVs).
  const tower = (w, h, d, x, z, y0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const repX = Math.max(1, Math.round(Math.max(w, d) / 3.2));
    const repY = Math.max(1, Math.round(h / 3.4));
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repX, uv.getY(i) * repY);
    g.translate(x, y0 + h / 2, z);
    windowGeos[Math.floor(Math.random() * 5)].push(g);
    const cap = new THREE.BoxGeometry(w + 0.06, 0.12, d + 0.06); // dark roof
    cap.translate(x, y0 + h + 0.06, z);
    darkGeos.push(cap);
  };

  for (let z = -10; z > -CHUNK_LEN + 10; z -= 22) {
    for (const side of [-1, 1]) {
      if (Math.random() >= 0.85) continue;
      const W = 6 + Math.random() * 7, D = 7 + Math.random() * 4;
      const H = 7 + Math.random() * 26;
      const x = side * (18 + Math.random() * 20);
      const zz = z + Math.random() * 8;
      tower(W, H, D, x, zz, 0);

      let topY = H, topW = W, topD = D;
      if (Math.random() < 0.3) { // setback upper block
        const w2 = W * 0.65, d2 = D * 0.7, h2 = 4 + Math.random() * 8;
        tower(w2, h2, d2, x, zz, H);
        topY = H + h2; topW = w2; topD = d2;
      }
      if (Math.random() < 0.6) { // antenna + red beacon
        const ax = x + (Math.random() - 0.5) * topW * 0.4;
        const ant = new THREE.CylinderGeometry(0.05, 0.09, 2.6, 6);
        ant.translate(ax, topY + 1.3, zz);
        darkGeos.push(ant);
        neonGeos.push(tint(new THREE.SphereGeometry(0.13, 6, 6).translate(ax, topY + 2.65, zz), 0xff3344));
      }
      if (Math.random() < 0.5) { // AC unit
        const ac = new THREE.BoxGeometry(1.4, 0.8, 1.1);
        ac.translate(x + (Math.random() - 0.5) * topW * 0.5, topY + 0.4, zz + (Math.random() - 0.5) * topD * 0.4);
        darkGeos.push(ac);
      }
      const neonC = NEON_COLORS[Math.floor(Math.random() * 4)];
      if (Math.random() < 0.5) { // neon cap
        neonGeos.push(tint(new THREE.BoxGeometry(W + 0.3, 0.22, D + 0.3).translate(x, H + 0.02, zz), neonC));
      }
      if (Math.random() < 0.35) { // synthwave edge outline
        const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D));
        eg.translate(x, H / 2, zz);
        lineGeos.push(tint(eg, neonC));
      }
      if (Math.random() < 0.25) { // billboard (individual plane, shared material)
        const bw = Math.min(D * 0.85, 5.5), bh = bw * 0.375;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh),
          SIGN_MATS[Math.floor(Math.random() * SIGN_MATS.length)]);
        sign.position.set(x - side * (W / 2 + 0.06), H * 0.72, zz);
        sign.rotation.y = -side * Math.PI / 2;
        chunk.add(sign);
      }
    }
  }
  // Street lamps
  for (let z = 0; z > -CHUNK_LEN; z -= 35) {
    for (const side of [-1, 1]) {
      const pole = new THREE.CylinderGeometry(0.08, 0.1, 6, 6);
      pole.translate(side * 8.2, 3, z);
      darkGeos.push(pole);
      neonGeos.push(tint(new THREE.BoxGeometry(0.5, 0.15, 1.4).translate(side * 8.2, 6, z - 0.5), 0xffe9b0));
    }
  }

  for (let v = 0; v < 5; v++)
    if (windowGeos[v].length) chunk.add(new THREE.Mesh(mergeGeometries(windowGeos[v]), FACADE_MATS[v]));
  if (darkGeos.length) chunk.add(new THREE.Mesh(mergeGeometries(darkGeos), DARK_MAT));
  if (neonGeos.length) chunk.add(new THREE.Mesh(mergeGeometries(neonGeos), NEON_MAT));
  if (lineGeos.length) chunk.add(new THREE.LineSegments(mergeGeometries(lineGeos), OUTLINE_MAT));
  return chunk;
}

const chunks = [buildSceneryChunk(), buildSceneryChunk()];
chunks[0].position.z = 0;
chunks[1].position.z = -CHUNK_LEN;
scene.add(chunks[0], chunks[1]);

/* ================= PLAYER ================= */
let playerColor = '#ff2d2d';
let player = null;
function spawnPlayer() {
  if (player) scene.remove(player);
  player = buildSupercar(new THREE.Color(playerColor).getHex());
  player.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  player.position.set(0, 0, 0);
  scene.add(player);
}

/* ================= TRAFFIC ================= */
const traffic = [];
function spawnTraffic(zMin, zMax) {
  // find a spot that doesn't overlap any existing car in the same lane
  let laneIdx = 0, z = 0, ok = false;
  for (let tries = 0; tries < 14 && !ok; tries++) {
    laneIdx = Math.floor(Math.random() * LANES.length);
    z = zMin + Math.random() * (zMax - zMin);
    ok = traffic.every((t) => Math.abs(t.position.x - LANES[laneIdx]) > 2.5 || Math.abs(t.position.z - z) > 18);
  }
  if (!ok) return false; // road too crowded there — skip this spawn
  const car = randomTrafficCar();
  // (no castShadow on traffic — only the player casts, halves the shadow pass)
  car.position.set(LANES[laneIdx], 0, z);
  // Each lane has a flow speed: rightmost slow → leftmost fast (keeps traffic spread out)
  car.userData.baseSpeed = 11 + laneIdx * 5 + Math.random() * 3;
  car.userData.speed = car.userData.baseSpeed;
  car.userData.passed = false;
  scene.add(car);
  traffic.push(car);
  return true;
}

/* ================= INPUT ================= */
const hand = new HandControl();
let controlMode = 'hand';
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; });
addEventListener('keyup', (e) => { keys[e.code] = false; });

// Touch steering (mobile): hold LEFT half = left, RIGHT half = right, BOTH = brake.
const touch = { steer: 0, brake: false };
{
  const gameCanvas = $('game');
  gameCanvas.style.touchAction = 'none'; // don't scroll the page while steering
  const readTouches = (e) => {
    let left = false, right = false;
    for (const t of e.touches) {
      if (t.clientX < innerWidth / 2) left = true; else right = true;
    }
    touch.brake = left && right;
    touch.steer = touch.brake ? 0 : left ? -1 : right ? 1 : 0;
  };
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    gameCanvas.addEventListener(ev, (e) => { readTouches(e); }, { passive: true });
  }
}

function getInput() {
  if (controlMode === 'hand' && hand.detected) {
    return { steer: hand.steering, brake: hand.brake };
  }
  let steer = 0;
  if (keys.ArrowLeft || keys.KeyA) steer -= 1;
  if (keys.ArrowRight || keys.KeyD) steer += 1;
  if (steer === 0) steer = touch.steer;                                  // mobile
  const brake = !!(keys.ArrowDown || keys.KeyS || keys.Space) || touch.brake;
  return { steer, brake };
}

/* ================= AUDIO ================= */
let actx = null, engineOsc = null, engineGain = null;
function initAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  engineOsc = actx.createOscillator();
  engineOsc.type = 'sawtooth';
  const filter = actx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 320;
  engineGain = actx.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(filter).connect(engineGain).connect(actx.destination);
  engineOsc.start();
}
function crashSound() {
  if (!actx) return;
  const len = actx.sampleRate * 0.5;
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = actx.createBufferSource();
  src.buffer = buf;
  const g = actx.createGain(); g.gain.value = 0.5;
  src.connect(g).connect(actx.destination);
  src.start();
}

/* ================= GAME STATE ================= */
const state = {
  phase: 'menu',           // menu | playing | over | versusEnd
  mode: 'solo',            // solo | versus
  countdown: 0,            // versus start countdown (s)
  speed: 0,                // m/s
  maxSpeed: 62,            // ~220 km/h at full ramp
  dist: 0,
  score: 0,
  combo: 0,
  comboTimer: 0,
  time: 0,
  shake: 0,
  best: +(localStorage.getItem('nitro_best') || 0),
};
bestEl.textContent = 'BEST ' + state.best;
const menuBestEl = $('menuBest');
menuBestEl.textContent = state.best.toLocaleString();

/* ================= MULTIPLAYER (P2P versus) ================= */
const cdEl = $('countdown'), vsHudEl = $('vsHud');
const net = new NetPeer();
const mp = {
  active: false,
  rivalColor: '#18c2ff',
  ghost: null,
  rival: { x: 0, dist: 0, score: 0, present: false },
  myDead: false, rivalDead: false, finished: false,
  graceTimer: 0, sendTimer: 0,
  wantRematch: false, rivalRematch: false,
};

net.onOpen = () => { net.send({ t: 'hello', color: playerColor }); };
net.onError = (msg) => {
  $('joinStatus').textContent = msg;
  $('hostStatus').textContent = msg;
};
net.onClose = () => {
  if (mp.active && !mp.finished) finishVersus('DISCONNECT');
};
net.onData = (m) => {
  if (!m || !m.t) return;
  if (m.t === 'hello') {
    mp.rivalColor = m.color || '#18c2ff';
    if (!mp.active) beginVersus();
  } else if (m.t === 'state') {
    mp.rival.x = m.x; mp.rival.dist = m.dist; mp.rival.score = m.score; mp.rival.present = true;
  } else if (m.t === 'dead') {
    mp.rivalDead = true; mp.rival.score = m.score; mp.rival.dist = m.dist;
    onRivalDead();
  } else if (m.t === 'rematch') {
    mp.rivalRematch = true;
    if (mp.wantRematch) beginVersus();
    else $('vsResultSub').textContent = 'Rival wants a rematch — press REMATCH!';
  }
};

function buildGhost(color) {
  const g = buildSupercar(new THREE.Color(color).getHex());
  g.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.5;
      o.material.depthWrite = false;
      o.castShadow = false;
    }
  });
  scene.add(g);
  return g;
}
function ensureGhost() {
  if (mp.ghost) { scene.remove(mp.ghost); mp.ghost = null; }
  mp.ghost = buildGhost(mp.rivalColor);
  mp.ghost.visible = false;
}
function updateGhost() {
  if (!mp.ghost) return;
  mp.ghost.visible = mp.rival.present && !mp.rivalDead;
  mp.ghost.position.x = mp.rival.x;
  const gz = -(mp.rival.dist - state.dist);          // rival ahead → negative z (in front)
  mp.ghost.position.z = Math.max(-55, Math.min(11, gz));
}
function updateVsHud() {
  $('vsMe').textContent = Math.floor(state.score).toLocaleString();
  $('vsRival').textContent = Math.floor(mp.rival.score).toLocaleString();
  const gap = Math.round(state.dist - mp.rival.dist);
  $('vsGap').textContent = gap >= 0 ? '+' + gap + 'm' : gap + 'm';
}

function beginVersus() {
  if (mp.active) return;
  mp.active = true;
  mp.finished = false; mp.myDead = false; mp.rivalDead = false;
  mp.wantRematch = false; mp.rivalRematch = false;
  mp.graceTimer = 0; mp.sendTimer = 0;
  mp.rival = { x: 0, dist: 0, score: 0, present: false };
  ensureGhost();
  $('online').classList.add('hidden');
  $('versusResult').classList.add('hidden');
  menuEl.classList.add('hidden');
  startGame('versus');
}

// Local player crashed in a versus round.
function crash() {
  if (state.mode === 'versus') onLocalCrash();
  else gameOver();
}
function onLocalCrash() {
  if (mp.myDead) return;
  mp.myDead = true;
  state.phase = 'over';
  state.shake = 1.2;
  crashSound();
  if (engineGain) engineGain.gain.setTargetAtTime(0, actx.currentTime, 0.1);
  net.send({ t: 'dead', score: Math.floor(state.score), dist: Math.round(state.dist) });
  if (mp.rivalDead) resolveVersus();
  else mp.graceTimer = 0.7;            // wait for a near-simultaneous rival crash
}
function onRivalDead() {
  if (mp.finished) return;
  if (!mp.myDead) finishVersus('WIN');  // rival crashed first, I'm still alive
  else resolveVersus();                 // both down → higher score wins
}
function resolveVersus() {
  const me = Math.floor(state.score), rival = Math.floor(mp.rival.score);
  finishVersus(me > rival ? 'WIN' : me < rival ? 'LOSE' : 'TIE');
}
function finishVersus(result) {
  if (mp.finished) return;
  mp.finished = true;
  mp.active = false;
  state.phase = 'versusEnd';
  const s = Math.floor(state.score);
  if (s > state.best) {
    state.best = s;
    localStorage.setItem('nitro_best', s);
    bestEl.textContent = 'BEST ' + s;
    menuBestEl.textContent = s.toLocaleString();
  }
  const title = $('vsResultTitle');
  const map = {
    WIN: ['YOU WIN! 🏆', '#2dff6e'], LOSE: ['YOU LOSE', '#ff2d2d'],
    TIE: ['TIE!', '#ffd10a'], DISCONNECT: ['RIVAL LEFT', '#ffd10a'],
  };
  title.textContent = map[result][0];
  title.style.color = map[result][1];
  $('vsResultScore').textContent = s.toLocaleString();
  $('vsResultSub').textContent = 'You ' + Math.round(state.dist) + 'm · Rival ' + Math.round(mp.rival.dist) + 'm';
  setTimeout(() => {
    hudEl.classList.add('hidden');
    wheelBox.classList.add('hidden');
    vsHudEl.classList.add('hidden');
    $('versusResult').classList.remove('hidden');
  }, 900);
}
function cleanupVersus() {
  net.close();
  mp.active = false; mp.finished = false;
  if (mp.ghost) { scene.remove(mp.ghost); mp.ghost = null; }
  vsHudEl.classList.add('hidden');
  cdEl.classList.add('hidden');
}

function startGame(mode = 'solo') {
  for (const t of traffic) scene.remove(t);
  traffic.length = 0;
  spawnPlayer();
  for (let n = 0, guard = 0; n < 10 && guard < 60; guard++) { if (spawnTraffic(-260, -40)) n++; }
  Object.assign(state, {
    phase: 'playing', mode, speed: 16, dist: 0, score: 0,
    combo: 0, comboTimer: 0, time: 0, shake: 0,
    countdown: mode === 'versus' ? 3.9 : 0,
  });
  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  $('versusResult').classList.add('hidden');
  hudEl.classList.remove('hidden');
  wheelBox.classList.remove('hidden');
  vsHudEl.classList.toggle('hidden', mode !== 'versus');
  if (controlMode === 'hand') camBox.classList.remove('hidden');
  initAudio();
  if (actx.state === 'suspended') actx.resume();
}

function gameOver() {
  state.phase = 'over';
  state.shake = 1.2;
  crashSound();
  if (engineGain) engineGain.gain.setTargetAtTime(0, actx.currentTime, 0.1);
  const s = Math.floor(state.score);
  $('finalScore').textContent = s.toLocaleString();
  const isBest = s > state.best;
  if (isBest) {
    state.best = s;
    localStorage.setItem('nitro_best', s);
    bestEl.textContent = 'BEST ' + s;
    menuBestEl.textContent = s.toLocaleString();
  }
  $('newBest').classList.toggle('hidden', !isBest);
  setTimeout(() => {
    overEl.classList.remove('hidden');
    hudEl.classList.add('hidden');
    wheelBox.classList.add('hidden');
  }, 900);
}

/* ================= MENU WIRING ================= */
document.querySelectorAll('#carPick .pick').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#carPick .pick').forEach((b) => b.classList.remove('sel'));
    btn.classList.add('sel');
    playerColor = btn.dataset.color;
    spawnPlayer();
  });
});
$('modeHand').addEventListener('click', () => setMode('hand'));
$('modeKeys').addEventListener('click', () => setMode('keys'));
function setMode(m) {
  controlMode = m;
  $('modeHand').classList.toggle('sel', m === 'hand');
  $('modeKeys').classList.toggle('sel', m === 'keys');
  $('controlHint').innerHTML = m === 'hand'
    ? 'Hold your hand up like a steering wheel — tilt it to steer.<br/>✊ Close your fist to BRAKE. 🖐 Open hand = full speed.'
    : '⬅ ➡ or A / D to steer. ⬇ / S / SPACE to brake.<br/>📱 Mobile: touch LEFT / RIGHT side of the screen — both = brake.';
}

// Phones/tablets default to touch controls (hand tracking is heavy on mobile)
if (matchMedia('(pointer: coarse)').matches) setMode('keys');

let camReady = false;
$('playBtn').addEventListener('click', async () => {
  if (controlMode === 'hand' && !camReady) {
    $('camMsg').textContent = 'Starting camera… show your hand ✋';
    try {
      await hand.init($('video'), $('camCanvas'), $('handStatus'));
      camReady = true;
      $('camMsg').textContent = '';
    } catch (err) {
      $('camMsg').textContent = 'Camera unavailable — switching to keyboard mode.';
      setMode('keys');
      return;
    }
  }
  startGame();
});
$('retryBtn').addEventListener('click', () => startGame('solo'));
$('menuBtn').addEventListener('click', () => {
  overEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
  state.phase = 'menu';
  player.position.set(0, 0, 0);
  player.rotation.set(0, 0, 0);
});

/* ---------- Online lobby wiring ---------- */
$('onlineBtn').addEventListener('click', () => {
  menuEl.classList.add('hidden');
  $('online').classList.remove('hidden');
  $('roomCodeBox').classList.add('hidden');
  $('joinStatus').textContent = '';
  $('hostStatus').textContent = 'Waiting for player 2…';
  $('codeInput').value = '';
  setTimeout(() => $('codeInput').focus(), 50);
});
$('onlineBackBtn').addEventListener('click', () => {
  cleanupVersus();
  $('online').classList.add('hidden');
  menuEl.classList.remove('hidden');
});
$('createRoomBtn').addEventListener('click', () => {
  net.close();
  const code = makeRoomCode();
  $('roomCodeBox').classList.remove('hidden');
  $('roomCode').textContent = '…';
  $('hostStatus').textContent = 'Setting up room…';
  net.host(code, (c) => {
    $('roomCode').textContent = c;
    $('hostStatus').textContent = 'Waiting for player 2…';
  });
});
$('joinRoomBtn').addEventListener('click', () => {
  const code = ($('codeInput').value || '').toUpperCase().trim();
  if (code.length !== 4) { $('joinStatus').textContent = 'Enter the 4-character code.'; return; }
  $('joinStatus').textContent = 'Connecting…';
  net.close();
  net.join(code);
});
$('codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
// Enter inside the code field = JOIN (and don't let the key reach the game controls)
$('codeInput').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); $('joinRoomBtn').click(); }
});
$('vsRematchBtn').addEventListener('click', () => {
  if (!net.conn || !net.conn.open) {  // rival gone → back to menu
    cleanupVersus();
    $('versusResult').classList.add('hidden');
    menuEl.classList.remove('hidden');
    state.phase = 'menu';
    return;
  }
  mp.wantRematch = true;
  net.send({ t: 'rematch' });
  $('vsResultSub').textContent = 'Waiting for rival to accept…';
  if (mp.rivalRematch) beginVersus();
});
$('vsMenuBtn').addEventListener('click', () => {
  cleanupVersus();
  $('versusResult').classList.add('hidden');
  menuEl.classList.remove('hidden');
  state.phase = 'menu';
  player.position.set(0, 0, 0);
  player.rotation.set(0, 0, 0);
});

spawnPlayer();
if (TEST_MODE) window.__nitro = { state, traffic, getPlayer: () => player, renderer, mp, net };

/* ================= MAIN LOOP ================= */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = performance.now() / 1000;

  // Police beacons flash everywhere
  for (const c of traffic) {
    if (c.userData.beacons) {
      const on = Math.sin(t * 12) > 0;
      c.userData.beacons[0].material.emissiveIntensity = on ? 3.2 : 0.15;
      c.userData.beacons[1].material.emissiveIntensity = on ? 0.15 : 3.2;
    }
  }

  // Versus: resolve a loss only after a short grace (covers near-simultaneous crashes)
  if (mp.active && mp.graceTimer > 0) {
    mp.graceTimer -= dt;
    if (mp.graceTimer <= 0) { if (mp.rivalDead) resolveVersus(); else finishVersus('LOSE'); }
  }

  if (state.phase === 'playing') {
   // Versus start countdown freezes the sim so both cars launch together
   if (state.mode === 'versus' && state.countdown > 0) {
    state.countdown -= dt;
    cdEl.classList.remove('hidden');
    cdEl.textContent = state.countdown > 0.9 ? String(Math.ceil(state.countdown - 0.9)) : 'GO!';
   } else {
    if (state.mode === 'versus') cdEl.classList.add('hidden');
    state.time += dt;
    const input = getInput();

    // Speed: ramps up over time, brake slows hard
    const targetSpeed = Math.min(state.maxSpeed, 16 + state.time * 1.1);
    if (input.brake) {
      state.speed = Math.max(9, state.speed - 30 * dt);
    } else {
      state.speed += (targetSpeed - state.speed) * 0.5 * dt + 4 * dt;
      state.speed = Math.min(state.speed, targetSpeed);
    }

    // Steering — stronger at speed, clamped to the road
    player.position.x += input.steer * (8 + state.speed * 0.22) * dt;
    player.position.x = Math.max(-EDGE, Math.min(EDGE, player.position.x));
    player.rotation.z = -input.steer * 0.12;
    player.rotation.y = -input.steer * 0.22;

    // Wheel spin (rotate the whole wheel group so alloy spokes spin too)
    if (player.userData.wheels) {
      for (const w of player.userData.wheels) w.rotation.x -= state.speed * dt * 2.5;
    }

    // Wheel HUD
    wheelSvg.style.transform = `rotate(${input.steer * 90}deg)`;

    // Distance & score
    state.dist += state.speed * dt;
    state.score += state.speed * dt * (1 + state.combo * 0.25);

    // Move world past the player: 2 merged stripe meshes + 2 scenery chunks
    const rel = state.speed * dt;
    stripeGroup.position.z = (stripeGroup.position.z + rel) % 9; // periodic pattern
    for (const ch of chunks) {
      ch.position.z += rel;
      if (ch.position.z - CHUNK_LEN > 35) ch.position.z -= CHUNK_LEN * 2; // leapfrog ahead
    }

    // Traffic AI: follow the car ahead in the lane, then speed back up to the
    // lane's flow speed once the road clears (no permanent slowdowns → no far-away
    // car packs leaving the road near the player empty).
    for (const a of traffic) {
      let leadSpeed = Infinity, minGap = Infinity;
      for (const b of traffic) {
        if (a === b) continue;
        if (Math.abs(a.position.x - b.position.x) > 2.5) continue; // not the same lane
        const gap = a.position.z - b.position.z; // > 0 → a is behind b
        if (gap > 0 && gap < minGap) { minGap = gap; leadSpeed = b.userData.speed; }
      }
      if (minGap < 16) {
        a.userData.speed = Math.min(a.userData.speed, leadSpeed); // match the leader
      } else if (a.userData.speed < a.userData.baseSpeed) {
        a.userData.speed = Math.min(a.userData.baseSpeed, a.userData.speed + 3 * dt); // recover
      }
    }

    // Traffic
    for (let i = traffic.length - 1; i >= 0; i--) {
      const c = traffic[i];
      c.position.z += (state.speed - c.userData.speed) * dt;
      if (c.userData.wheels) {
        for (const w of c.userData.wheels) w.rotation.x -= c.userData.speed * dt * 2.5;
      }
      // Near miss: passed us close without touching
      if (!c.userData.passed && c.position.z > player.position.z + 2) {
        c.userData.passed = true;
        if (Math.abs(c.position.x - player.position.x) < 2.6) {
          state.combo++;
          state.comboTimer = 2.2;
          state.score += 120 * state.combo;
          comboEl.textContent = `NEAR MISS ×${state.combo}  +${120 * state.combo}`;
          comboEl.classList.add('show');
        }
      }
      // Recycle behind us
      if (c.position.z > 25) {
        scene.remove(c);
        traffic.splice(i, 1);
        spawnTraffic(-300, -160);
      }
    }
    // More traffic as difficulty grows
    const wanted = Math.min(16, 10 + Math.floor(state.time / 18));
    for (let guard = 0; traffic.length < wanted && guard < 20; guard++) spawnTraffic(-300, -100);

    // Combo timeout
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) { state.combo = 0; comboEl.classList.remove('show'); }
    }

    // Collision — cheap AABBs from known footprints (no scene-graph traversal)
    const ps = player.userData.size;
    const phw = ps.w * 0.41, phl = ps.l * 0.41; // forgiving hitbox (~18% shrunk)
    for (const c of traffic) {
      const dz = Math.abs(c.position.z - player.position.z);
      if (dz > 8) continue;
      const cs = c.userData.size;
      if (Math.abs(c.position.x - player.position.x) < phw + cs.w * 0.425 && dz < phl + cs.l * 0.425) {
        crash(); break;
      }
    }

    // Engine sound follows speed
    if (engineOsc) {
      engineOsc.frequency.setTargetAtTime(40 + state.speed * 2.6, actx.currentTime, 0.05);
      engineGain.gain.setTargetAtTime(0.06, actx.currentTime, 0.1);
    }

    // HUD
    scoreEl.textContent = Math.floor(state.score).toLocaleString();
    speedEl.textContent = Math.round(state.speed * 3.6);

    // Versus per-frame networking + rival ghost
    if (state.mode === 'versus') {
      mp.sendTimer -= dt;
      if (mp.sendTimer <= 0) {
        mp.sendTimer = 0.05; // ~20 Hz
        net.send({ t: 'state', x: +player.position.x.toFixed(2), dist: Math.round(state.dist), score: Math.floor(state.score) });
      }
      updateGhost();
      updateVsHud();
    }
   } // end countdown gate
  }

  // Camera: showcase orbit in the menu, chase cam in game
  if (player) {
    if (state.phase === 'menu') {
      // slow orbit around the car so color picks are visible (car framed right of the card)
      const a = t * 0.35;
      camera.position.set(Math.sin(a) * 7, 2.6, Math.cos(a) * 7);
      camera.lookAt(-2.4, 0.7, 0);
    } else {
      const cx = player.position.x * 0.55;
      camera.position.x += (cx - camera.position.x) * 0.12;
      camera.position.y = 4.6;
      camera.position.z = 9.5;
      if (state.shake > 0) {
        state.shake -= dt;
        camera.position.x += (Math.random() - 0.5) * state.shake * 2;
        camera.position.y += (Math.random() - 0.5) * state.shake * 2;
      }
      camera.lookAt(player.position.x * 0.7, 1.2, -12);
    }
  }

  renderer.render(scene, camera);
}
animate();
