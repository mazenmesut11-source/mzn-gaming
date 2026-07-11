// Car factory — every car is built from an extruded side-silhouette + wheels + light details.
import * as THREE from 'three';

const TIRE_MAT = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.9 });
const RIM_MAT  = new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.25, metalness: 0.9 });
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0x0d1622, roughness: 0.08, metalness: 0.6 });
const HEADLIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6cc, emissiveIntensity: 2.2 });
const TAILLIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff1111, emissiveIntensity: 2.2 });

function paint(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.65 });
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
function silhouette(points, width, material) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
  geo.translate(0, 0, -width / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.y = -Math.PI / 2; // silhouette x-axis becomes -Z (car faces -Z)
  return mesh;
}

function wheel(radius, fat) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, fat, 20), TIRE_MAT);
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, fat + 0.02, 12), RIM_MAT);
  rim.rotation.z = Math.PI / 2;
  g.add(tire, rim);
  return g;
}

function addWheels(car, { radius = 0.36, fat = 0.28, halfW, frontZ, rearZ }) {
  const spots = [[-halfW, frontZ], [halfW, frontZ], [-halfW, rearZ], [halfW, rearZ]];
  car.userData.wheels = [];
  for (const [x, z] of spots) {
    const w = wheel(radius, fat);
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
  // Low wedge body with sweeping cabin
  car.add(silhouette([
    [-2.25, 0.25], [-2.3, 0.62], [-1.9, 0.72], [-1.15, 1.02], [-0.1, 1.06],
    [0.85, 0.72], [2.05, 0.52], [2.3, 0.34], [2.28, 0.22], [-2.25, 0.22]
  ], 2.0, mat));
  cabinGlass(car, { w: 1.7, h: 0.34, len: 1.5, y: 0.88, z: 0.1 });
  // Rear spoiler
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.07, 0.45), mat);
  wing.position.set(0, 1.02, 2.05);
  const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.1), mat);
  post1.position.set(-0.7, 0.84, 2.05);
  const post2 = post1.clone(); post2.position.x = 0.7;
  car.add(wing, post1, post2);
  addWheels(car, { radius: 0.38, fat: 0.34, halfW: 0.92, frontZ: -1.55, rearZ: 1.5 });
  addLights(car, { frontZ: -2.32, rearZ: 2.32, y: 0.55, spread: 0.62, w: 0.44, h: 0.1 });
  // Full-width LED tail strip (key-art style)
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.06), TAILLIGHT_MAT);
  strip.position.set(0, 0.8, 2.33);
  car.add(strip);
  // Neon underglow (player flair) — soft radial texture so it fades out, no hard square edge
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
