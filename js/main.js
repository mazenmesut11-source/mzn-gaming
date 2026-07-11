import * as THREE from 'three';
import { buildSupercar, randomTrafficCar } from './cars.js';
import { HandControl } from './hand.js';

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
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const DUSK = 0x1c1233; // deep synthwave purple night
scene.background = new THREE.Color(DUSK);
scene.fog = new THREE.Fog(DUSK, 70, 260);

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

// Lane dashes (recycled)
const dashes = [];
{
  const dashGeo = new THREE.PlaneGeometry(0.22, 3);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xcfcfd8 });
  for (const x of [-3.5, 0, 3.5]) {
    for (let z = 10; z > -400; z -= 9) {
      const d = new THREE.Mesh(dashGeo, dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.01, z);
      scene.add(d);
      dashes.push(d);
    }
  }
}
// Edge lines + glowing yellow road studs (like the key art)
for (const x of [-ROAD_W / 2 + 0.3, ROAD_W / 2 - 0.3]) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 600),
    new THREE.MeshBasicMaterial({ color: 0xffd10a, transparent: true, opacity: 0.55 }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(x, 0.01, -200);
  scene.add(line);
}
{
  const studGeo = new THREE.SphereGeometry(0.16, 8, 8);
  const studMat = new THREE.MeshBasicMaterial({ color: 0xffe04a });
  for (const x of [-ROAD_W / 2 - 0.6, ROAD_W / 2 + 0.6]) {
    for (let z = 10; z > -400; z -= 9) {
      const s = new THREE.Mesh(studGeo, studMat);
      s.position.set(x, 0.12, z);
      scene.add(s);
      dashes.push(s); // scrolls & wraps with the lane dashes
    }
  }
}

// Guardrails + streetlights + neon buildings (recycled scenery)
const scenery = [];
function makeBuilding() {
  const h = 6 + Math.random() * 26;
  const g = new THREE.Group();
  const tone = [0x14101f, 0x1a1428, 0x100c1a][Math.floor(Math.random() * 3)];
  const geo = new THREE.BoxGeometry(6 + Math.random() * 6, h, 8);
  const b = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: tone, roughness: 0.85 }));
  b.position.y = h / 2;
  g.add(b);
  // Neon outline on every edge of the tower (synthwave key-art look)
  const neonC = [0xff2d6e, 0x18e2ff, 0xb02dff, 0x18c2ff][Math.floor(Math.random() * 4)];
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: neonC, transparent: true, opacity: 0.9 })
  );
  outline.position.y = h / 2;
  g.add(outline);
  // Bright neon cap
  const neon = new THREE.Mesh(new THREE.BoxGeometry(geo.parameters.width + 0.3, 0.25, 8.3),
    new THREE.MeshBasicMaterial({ color: neonC }));
  neon.position.y = h;
  g.add(neon);
  // A few lit windows
  const win = new THREE.Mesh(
    new THREE.PlaneGeometry(geo.parameters.width * 0.7, h * 0.55),
    new THREE.MeshBasicMaterial({ color: 0x2a2244, transparent: true, opacity: 0.9 })
  );
  win.position.set(0, h * 0.45, 4.05);
  g.add(win);
  return g;
}
function makeLamp() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6),
    new THREE.MeshStandardMaterial({ color: 0x44444e }));
  pole.position.y = 3;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 1.4),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
  head.position.set(0, 6, -0.5);
  g.add(pole, head);
  return g;
}
for (let z = 20; z > -420; z -= 22) {
  for (const side of [-1, 1]) {
    if (Math.random() < 0.85) {
      const b = makeBuilding();
      b.position.set(side * (18 + Math.random() * 20), 0, z + Math.random() * 8);
      scene.add(b); scenery.push(b);
    }
  }
}
for (let z = 0; z > -420; z -= 35) {
  for (const side of [-1, 1]) {
    const l = makeLamp();
    l.position.set(side * 8.2, 0, z);
    l.scale.x = side;
    scene.add(l); scenery.push(l);
  }
}

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
  car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
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

function getInput() {
  if (controlMode === 'hand' && hand.detected) {
    return { steer: hand.steering, brake: hand.brake };
  }
  let steer = 0;
  if (keys.ArrowLeft || keys.KeyA) steer -= 1;
  if (keys.ArrowRight || keys.KeyD) steer += 1;
  const brake = !!(keys.ArrowDown || keys.KeyS || keys.Space);
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
  phase: 'menu',           // menu | playing | over
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

function startGame() {
  for (const t of traffic) scene.remove(t);
  traffic.length = 0;
  spawnPlayer();
  for (let n = 0, guard = 0; n < 10 && guard < 60; guard++) { if (spawnTraffic(-260, -40)) n++; }
  Object.assign(state, { phase: 'playing', speed: 16, dist: 0, score: 0, combo: 0, comboTimer: 0, time: 0, shake: 0 });
  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  wheelBox.classList.remove('hidden');
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
    : '⬅ ➡ or A / D to steer.<br/>⬇ / S / SPACE to brake.';
}

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
$('retryBtn').addEventListener('click', startGame);
$('menuBtn').addEventListener('click', () => {
  overEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
  state.phase = 'menu';
  player.position.set(0, 0, 0);
  player.rotation.set(0, 0, 0);
});

spawnPlayer();
if (TEST_MODE) window.__nitro = { state, traffic, getPlayer: () => player };

/* ================= MAIN LOOP ================= */
const clock = new THREE.Clock();
const playerBox = new THREE.Box3(), otherBox = new THREE.Box3();
const tmpSize = new THREE.Vector3();

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

  if (state.phase === 'playing') {
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

    // Wheel spin
    if (player.userData.wheels) {
      for (const w of player.userData.wheels) w.children[0].rotation.x -= state.speed * dt * 2.5;
    }

    // Wheel HUD
    wheelSvg.style.transform = `rotate(${input.steer * 90}deg)`;

    // Distance & score
    state.dist += state.speed * dt;
    state.score += state.speed * dt * (1 + state.combo * 0.25);

    // Move world past the player
    const rel = state.speed * dt;
    for (const d of dashes) {
      d.position.z += rel;
      if (d.position.z > 15) d.position.z -= 410;
    }
    for (const s of scenery) {
      s.position.z += rel;
      if (s.position.z > 30) s.position.z -= 450;
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
        for (const w of c.userData.wheels) w.children[0].rotation.x -= c.userData.speed * dt * 2.5;
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

    // Collision
    playerBox.setFromObject(player);
    playerBox.getSize(tmpSize);
    playerBox.expandByVector(tmpSize.multiplyScalar(-0.18)); // forgiving hitbox
    for (const c of traffic) {
      if (Math.abs(c.position.z - player.position.z) > 8) continue;
      otherBox.setFromObject(c);
      otherBox.getSize(tmpSize);
      otherBox.expandByVector(tmpSize.multiplyScalar(-0.15));
      if (playerBox.intersectsBox(otherBox)) { gameOver(); break; }
    }

    // Engine sound follows speed
    if (engineOsc) {
      engineOsc.frequency.setTargetAtTime(40 + state.speed * 2.6, actx.currentTime, 0.05);
      engineGain.gain.setTargetAtTime(0.06, actx.currentTime, 0.1);
    }

    // HUD
    scoreEl.textContent = Math.floor(state.score).toLocaleString();
    speedEl.textContent = Math.round(state.speed * 3.6);
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
