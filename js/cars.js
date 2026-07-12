// Car factory — every car is built from an extruded side-silhouette + wheels + light details.
import * as THREE from 'three';

const TIRE_MAT = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.9 });
const RIM_MAT  = new THREE.MeshStandardMaterial({ color: 0xe2e4ea, roughness: 0.18, metalness: 1.0, envMapIntensity: 1.6 });
const GLASS_MAT = new THREE.MeshPhysicalMaterial({ color: 0x0a121e, roughness: 0.05, metalness: 0.3, envMapIntensity: 2.0, clearcoat: 1.0, clearcoatRoughness: 0.05 });
const HEADLIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6cc, emissiveIntensity: 2.2 });
const TAILLIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff1111, emissiveIntensity: 2.2 });
const CARBON_MAT = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.5, metalness: 0.45 });
const CHROME_MAT = new THREE.MeshStandardMaterial({ color: 0xcfd2da, roughness: 0.12, metalness: 1.0, envMapIntensity: 1.8 });
const GRILLE_MAT = new THREE.MeshStandardMaterial({ color: 0x090a0d, roughness: 0.7, metalness: 0.3 });

// Quick box helper: box(w,h,d, material, x,y,z, [rx,ry,rz]?)
function box(w, h, d, mat, x = 0, y = 0, z = 0, rot = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  return m;
}

function paint(color) {
  // Glossy automotive paint: metallic base + clear-coat lacquer that reflects the
  // scene env map — this is what makes the cars read as premium, not flat/plastic.
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.26, metalness: 0.7,
    clearcoat: 1.0, clearcoatRoughness: 0.12,
    envMapIntensity: 1.35,
  });
}

// Shared soft radial-gradient texture (white center → transparent edge)
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

// Extrude a side-view silhouette (points in x=length-axis, y=height) into a body of given width.
// Front of the car is at negative Z after rotation.
// Every corner is rounded with a quadratic curve through edge midpoints, so bodies
// read as curved sheet metal instead of faceted wedges.
function silhouette(points, width, material) {
  const n = points.length;
  const pt = (i) => points[(i + n) % n];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const shape = new THREE.Shape();
  const start = mid(pt(n - 1), pt(0));
  shape.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pt(i), pt(i + 1));
    shape.quadraticCurveTo(pt(i)[0], pt(i)[1], m[0], m[1]);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 4, curveSegments: 16 });
  geo.translate(0, 0, -width / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.y = -Math.PI / 2; // silhouette x-axis becomes -Z (car faces -Z)
  return mesh;
}

function wheel(radius, fat, sport = false) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, fat, sport ? 28 : 20), TIRE_MAT);
  tire.rotation.z = Math.PI / 2;
  g.add(tire);
  const rimR = radius * (sport ? 0.66 : 0.55);
  if (sport) {
    // Brushed brake disc + 5-spoke alloy + chrome hub (whole group spins in-game)
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, fat * 0.35, 24),
      new THREE.MeshStandardMaterial({ color: 0x2a2b31, roughness: 0.35, metalness: 0.85 }));
    disc.rotation.z = Math.PI / 2;
    g.add(disc);
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(fat + 0.05, rimR * 1.85, 0.05), RIM_MAT);
      s.rotation.x = (i / 5) * Math.PI * 2;
      g.add(s);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.34, rimR * 0.34, fat + 0.06, 14), CHROME_MAT);
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
  } else {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, fat + 0.02, 12), RIM_MAT);
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
  }
  return g;
}

function addWheels(car, { radius = 0.36, fat = 0.28, halfW, frontZ, rearZ, sport = false }) {
  const spots = [[-halfW, frontZ], [halfW, frontZ], [-halfW, rearZ], [halfW, rearZ]];
  car.userData.wheels = [];
  for (const [x, z] of spots) {
    const w = wheel(radius, fat, sport);
    w.position.set(x, radius, z);
    car.add(w);
    car.userData.wheels.push(w);
  }
}

function lightBar(w, h, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), mat);
}

// Front lights at z=frontZ, tail lights at z=rearZ, at height y.
function addLights(car, { frontZ, rearZ, y, spread, w = 0.34, h = 0.14 }) {
  for (const s of [-1, 1]) {
    const hl = lightBar(w, h, HEADLIGHT_MAT);
    hl.position.set(s * spread, y, frontZ);
    const tl = lightBar(w, h, TAILLIGHT_MAT);
    tl.position.set(s * spread, y + 0.05, rearZ);
    car.add(hl, tl);
  }
}

function cabinGlass(car, { w, h, len, y, z, rake = 0 }) {
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), GLASS_MAT);
  glass.position.set(0, y, z);
  glass.rotation.x = rake;
  car.add(glass);
}

/* ============ DESIGNS ============ */
// Every silhouette: x from -rear to +front (front is +x here, becomes -Z), y = height.

export function buildSupercar(color) {
  const car = new THREE.Group();
  const mat = paint(color);
  const HW = 0.98; // body half-width at the sides

  // --- Main body: low aggressive wedge ---
  car.add(silhouette([
    [-2.30, 0.22], [-2.34, 0.50], [-1.95, 0.66], [-1.15, 0.98], [-0.10, 1.04],
    [0.90, 0.74], [2.05, 0.56], [2.32, 0.40], [2.30, 0.22]
  ], 1.95, mat));

  // --- Cabin: glass greenhouse + body roof + raked A-pillars ---
  cabinGlass(car, { w: 1.55, h: 0.36, len: 1.4, y: 0.90, z: 0.05 });
  car.add(box(1.2, 0.09, 0.9, mat, 0, 1.09, 0.15));                       // roof panel
  for (const s of [-1, 1]) car.add(box(0.07, 0.42, 0.07, mat, s * 0.66, 0.92, -0.55, [-0.5, 0, 0])); // A-pillars

  // --- SIDES: widebody fender flares over each wheel ---
  for (const zc of [-1.5, 1.5]) {
    const len = zc < 0 ? 1.15 : 1.2;
    for (const s of [-1, 1]) car.add(box(0.34, 0.62, len, mat, s * (HW + 0.02), 0.5, zc));
  }
  // Rocker side skirts
  for (const s of [-1, 1]) car.add(box(0.14, 0.16, 2.5, CARBON_MAT, s * (HW + 0.05), 0.30, 0));
  // Side air-intake scoop (behind the door) + body-colour lip above it
  for (const s of [-1, 1]) {
    car.add(box(0.16, 0.30, 0.55, GRILLE_MAT, s * (HW + 0.06), 0.62, 0.55));
    car.add(box(0.20, 0.06, 0.62, mat, s * (HW + 0.05), 0.80, 0.55));
  }
  // Side mirrors (stalk + housing)
  for (const s of [-1, 1]) {
    car.add(box(0.16, 0.02, 0.02, CARBON_MAT, s * (HW + 0.08), 0.96, -0.5));
    car.add(box(0.07, 0.12, 0.20, mat, s * (HW + 0.18), 0.98, -0.52));
  }

  // --- FRONT: splitter, canards, grille, lower intakes, slim LED headlights, hood vents ---
  car.add(box(2.0, 0.07, 0.45, CARBON_MAT, 0, 0.17, -2.12));              // splitter lip
  for (const s of [-1, 1]) car.add(box(0.34, 0.04, 0.22, CARBON_MAT, s * 0.86, 0.30, -2.18, [0, 0, s * 0.15])); // canards
  car.add(box(1.05, 0.20, 0.12, GRILLE_MAT, 0, 0.40, -2.31));            // centre grille
  for (const s of [-1, 1]) car.add(box(0.46, 0.20, 0.12, GRILLE_MAT, s * 0.72, 0.33, -2.29)); // lower intakes
  for (const s of [-1, 1]) {
    car.add(box(0.52, 0.09, 0.14, HEADLIGHT_MAT, s * 0.74, 0.62, -2.27, [0, 0, s * 0.12])); // swept headlight
    car.add(box(0.50, 0.03, 0.06, HEADLIGHT_MAT, s * 0.74, 0.52, -2.31));                    // DRL accent
  }
  for (const s of [-1, 1]) car.add(box(0.20, 0.03, 0.5, GRILLE_MAT, s * 0.30, 0.99, -1.25)); // hood vents

  // --- REAR: spoiler w/ endplates, diffuser fins, slim tail LEDs ---
  car.add(box(2.05, 0.07, 0.42, mat, 0, 1.05, 2.02));                    // wing
  for (const s of [-1, 1]) car.add(box(0.05, 0.34, 0.5, mat, s * 0.99, 0.88, 2.02));  // endplates
  for (const s of [-1, 1]) car.add(box(0.08, 0.30, 0.10, CARBON_MAT, s * 0.6, 0.86, 2.05)); // posts
  car.add(box(1.7, 0.22, 0.28, GRILLE_MAT, 0, 0.26, 2.26));             // diffuser
  for (const x of [-0.5, -0.17, 0.17, 0.5]) car.add(box(0.05, 0.22, 0.30, CARBON_MAT, x, 0.26, 2.30)); // fins
  for (const s of [-1, 1]) car.add(box(0.5, 0.10, 0.10, TAILLIGHT_MAT, s * 0.62, 0.82, 2.33)); // tail lights
  car.add(box(1.7, 0.05, 0.06, TAILLIGHT_MAT, 0, 0.90, 2.34));          // full-width LED strip

  // --- Sport wheels ---
  addWheels(car, { radius: 0.40, fat: 0.34, halfW: 0.92, frontZ: -1.5, rearZ: 1.5, sport: true });

  // --- Neon underglow (player flair) — soft radial texture, no hard square edge ---
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 5.6),
    new THREE.MeshBasicMaterial({
      map: glowTexture(), color, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.03;
  car.add(glow);
  car.userData.size = { w: 2.0, l: 4.6 };
  return car;
}

export function buildSedan(color) {
  const car = new THREE.Group();
  car.add(silhouette([
    [-2.2, 0.3], [-2.25, 0.85], [-1.5, 0.95], [-1.1, 1.42], [0.55, 1.42],
    [1.15, 0.95], [2.15, 0.85], [2.3, 0.55], [2.25, 0.28], [-2.2, 0.28]
  ], 1.85, paint(color)));
  cabinGlass(car, { w: 1.6, h: 0.42, len: 1.4, y: 1.12, z: 0.2 });
  addWheels(car, { radius: 0.36, fat: 0.26, halfW: 0.85, frontZ: -1.45, rearZ: 1.45 });
  addLights(car, { frontZ: -2.32, rearZ: 2.28, y: 0.72, spread: 0.58 });
  car.userData.size = { w: 1.85, l: 4.5 };
  return car;
}

export function buildMuscle(color) {
  const car = new THREE.Group();
  const mat = paint(color);
  car.add(silhouette([
    [-2.45, 0.3], [-2.5, 0.95], [-1.35, 1.0], [-0.75, 1.38], [0.65, 1.34],
    [1.2, 0.92], [2.4, 0.82], [2.45, 0.3], [-2.45, 0.28]
  ], 1.95, mat));
  cabinGlass(car, { w: 1.7, h: 0.4, len: 1.2, y: 1.08, z: 0.05 });
  // Racing stripes
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 4.6),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
  stripe.position.set(-0.3, 1.06, 0); car.add(stripe);
  const stripe2 = stripe.clone(); stripe2.position.x = 0.3; car.add(stripe2);
  // Hood scoop
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.8), mat);
  scoop.position.set(0, 1.02, -1.5); car.add(scoop);
  addWheels(car, { radius: 0.4, fat: 0.32, halfW: 0.9, frontZ: -1.6, rearZ: 1.6 });
  addLights(car, { frontZ: -2.52, rearZ: 2.48, y: 0.72, spread: 0.6 });
  car.userData.size = { w: 1.95, l: 5.0 };
  return car;
}

export function buildSUV(color) {
  const car = new THREE.Group();
  car.add(silhouette([
    [-2.3, 0.45], [-2.35, 1.1], [-1.9, 1.2], [-1.6, 1.85], [1.5, 1.85],
    [1.9, 1.15], [2.35, 1.05], [2.4, 0.45], [-2.3, 0.42]
  ], 2.05, paint(color)));
  cabinGlass(car, { w: 1.85, h: 0.55, len: 2.6, y: 1.5, z: 0 });
  // Roof rails
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.6), RIM_MAT);
  rail.position.set(-0.7, 1.95, 0); car.add(rail);
  const rail2 = rail.clone(); rail2.position.x = 0.7; car.add(rail2);
  addWheels(car, { radius: 0.45, fat: 0.32, halfW: 0.95, frontZ: -1.5, rearZ: 1.5 });
  addLights(car, { frontZ: -2.42, rearZ: 2.42, y: 0.95, spread: 0.65 });
  car.userData.size = { w: 2.05, l: 4.7 };
  return car;
}

export function buildTaxi() {
  const car = buildSedan(0xffc90a);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2aa, emissiveIntensity: 0.9 }));
  sign.position.set(0, 1.6, 0.1);
  car.add(sign);
  return car;
}

export function buildPolice() {
  const car = buildSedan(0xf2f2f7);
  // Black doors band
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.35, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.4 }));
  band.position.set(0, 0.62, 0.15);
  car.add(band);
  // Light bar — red + blue, flashed by the game loop via userData.beacons
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 2.5 }));
  red.position.set(-0.3, 1.58, 0.1);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 2.5 }));
  blue.position.set(0.3, 1.58, 0.1);
  car.add(red, blue);
  car.userData.beacons = [red, blue];
  return car;
}

export function buildTruck(color) {
  const car = new THREE.Group();
  const mat = paint(color);
  // Cab
  car.add(silhouette([
    [1.0, 0.5], [1.0, 2.3], [2.2, 2.3], [2.55, 1.4], [2.6, 0.5], [1.0, 0.48]
  ], 2.15, mat));
  // Cargo box
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.15, 2.2, 4.2),
    new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.6, metalness: 0.2 }));
  box.position.set(0, 1.55, 1.3);
  car.add(box);
  cabinGlass(car, { w: 1.95, h: 0.6, len: 0.15, y: 1.85, z: -2.15 });
  addWheels(car, { radius: 0.48, fat: 0.36, halfW: 0.98, frontZ: -1.9, rearZ: 2.4 });
  addLights(car, { frontZ: -2.62, rearZ: 3.42, y: 0.8, spread: 0.7 });
  car.userData.size = { w: 2.15, l: 6.2 };
  return car;
}

const TRAFFIC_COLORS = [0xc0c5cc, 0x2a3d66, 0x8c1f1f, 0x2e5e3a, 0x555a63, 0xe8e4da, 0x734b8c];

export function randomTrafficCar() {
  const r = Math.random();
  const c = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
  if (r < 0.28) return buildSedan(c);
  if (r < 0.48) return buildSUV(c);
  if (r < 0.63) return buildMuscle(c);
  if (r < 0.76) return buildTaxi();
  if (r < 0.88) return buildPolice();
  return buildTruck(c);
}
