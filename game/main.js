// Neon Bay — main game: renderer, state, input, pedestrians, particles,
// shooting, wanted system, save/load, menus and the game loop.
import * as THREE from 'three';
import { CITY, buildCity, resolveBuildingCollision, insideBuilding } from './city.js';
import { Car, Traffic, Police } from './vehicles.js';
import { Player } from './player.js';
import { MissionManager } from './missions.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';

const SAVE_KEY = 'neon-bay-save-v1';
const $ = (id) => document.getElementById(id);

// ---------- renderer / scene -----------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a1e3a);
scene.fog = new THREE.Fog(0x2a1e3a, 90, 320);
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(60, 60, 120);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x3a2a1a, 1.0));
const sun = new THREE.DirectionalLight(0xffe0b3, 1.6);
sun.position.set(80, 120, 40);
scene.add(sun);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- world + systems -------------------------------------------------
const { buildings } = buildCity(scene);
const traffic = new Traffic(scene, buildings);
const police = new Police(scene);
const player = new Player(scene);
const missions = new MissionManager(scene);
const hud = new HUD();
const audio = new AudioSys();

const G = {
  state: 'menu', // 'menu' | 'playing' | 'paused' | 'over'
  player,
  traffic,
  police,
  missions,
  hud,
  audio,
  buildings,
  time: 0,
  peds: [],
  copPeds: [],
  freeCars: [], // cars the player got out of (parked, stealable again)
  shake: 0,
  lastCrimeT: -999,
  policeSpawnT: 0,
  policeDespawnT: 0,
  copSpawnT: 0,
  shootCd: 0,
  autosaveT: 0,
  lastCrashT: -9,
  muted: false,
};
window.__NB = G;

// ---------- particles --------------------------------------------------------
const P_MAX = 300;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(P_MAX * 3);
const pCol = new Float32Array(P_MAX * 3);
for (let i = 0; i < P_MAX; i++) pPos[i * 3 + 1] = -999;
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const points = new THREE.Points(
  pGeo,
  new THREE.PointsMaterial({ size: 0.4, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })
);
points.frustumCulled = false;
scene.add(points);
const pVel = new Float32Array(P_MAX * 3);
const pLife = new Float32Array(P_MAX);
let pCursor = 0;

function spawnBurst(pos, color, n) {
  const c = new THREE.Color(color);
  for (let k = 0; k < n; k++) {
    const i = pCursor;
    pCursor = (pCursor + 1) % P_MAX;
    pPos[i * 3] = pos.x;
    pPos[i * 3 + 1] = pos.y + 0.5;
    pPos[i * 3 + 2] = pos.z;
    pVel[i * 3] = (Math.random() - 0.5) * 7;
    pVel[i * 3 + 1] = Math.random() * 6 + 1;
    pVel[i * 3 + 2] = (Math.random() - 0.5) * 7;
    pCol[i * 3] = c.r;
    pCol[i * 3 + 1] = c.g;
    pCol[i * 3 + 2] = c.b;
    pLife[i] = 0.7 + Math.random() * 0.5;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}

function updateParticles(dt) {
  for (let i = 0; i < P_MAX; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    if (pLife[i] <= 0) {
      pPos[i * 3 + 1] = -999;
      continue;
    }
    pVel[i * 3 + 1] -= 12 * dt;
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pPos[i * 3 + 1] < 0.05) {
      pPos[i * 3 + 1] = 0.05;
      pVel[i * 3 + 1] *= -0.3;
    }
  }
  pGeo.attributes.position.needsUpdate = true;
}

// ---------- pedestrians ------------------------------------------------------
function makePedMesh(shirt, isCop) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.34, 0.7, 4, 8),
    new THREE.MeshLambertMaterial({ color: shirt })
  );
  body.position.y = 0.95;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: isCop ? 0x1a2a55 : 0xc98d64 })
  );
  head.position.y = 1.7;
  g.add(head);
  if (isCop) {
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 0.12, 10),
      new THREE.MeshLambertMaterial({ color: 0x0e1a3a })
    );
    hat.position.y = 1.9;
    g.add(hat);
  }
  scene.add(g);
  return g;
}

const SHIRTS = [0xd23b3b, 0x3b7dd2, 0x37b24d, 0xe8c832, 0x9b59d0, 0xdddddd, 0xe86a1e];

function spawnCivilian() {
  const road = CITY.roads[Math.floor(Math.random() * CITY.roads.length)];
  const horizontal = Math.random() < 0.5;
  const side = Math.random() < 0.5 ? -1 : 1;
  const along = (Math.random() * 2 - 1) * (CITY.boundX - 20);
  let x;
  let z;
  if (horizontal) {
    x = along;
    z = road + side * 8.5;
  } else {
    x = road + side * 8.5;
    z = along;
  }
  if (insideBuilding(buildings, x, z, 1)) {
    if (horizontal) x += 14;
    else z += 14;
  }
  const mesh = makePedMesh(SHIRTS[Math.floor(Math.random() * SHIRTS.length)], false);
  const ped = {
    mesh,
    pos: new THREE.Vector3(x, 0, z),
    heading: 0,
    speed: 1.2 + Math.random() * 1.0,
    axis: horizontal ? 'x' : 'z',
    dir: Math.random() < 0.5 ? 1 : -1,
    alive: true,
    isCop: false,
  };
  mesh.position.copy(ped.pos);
  mesh.traverse((o) => {
    o.userData.hitRef = { kind: 'ped', ped };
  });
  G.peds.push(ped);
  return ped;
}

function spawnCopPed() {
  const angle = Math.random() * Math.PI * 2;
  const d = 15 + Math.random() * 10;
  const x = THREE.MathUtils.clamp(player.pos.x + Math.cos(angle) * d, -CITY.boundX, CITY.boundX);
  const z = THREE.MathUtils.clamp(player.pos.z + Math.sin(angle) * d, -CITY.boundZ, CITY.boundZ);
  const mesh = makePedMesh(0x1a2a55, true);
  const ped = {
    mesh,
    pos: new THREE.Vector3(x, 0, z),
    heading: 0,
    speed: 5.2,
    axis: 'x',
    dir: 1,
    alive: true,
    isCop: true,
  };
  mesh.position.copy(ped.pos);
  mesh.traverse((o) => {
    o.userData.hitRef = { kind: 'ped', ped };
  });
  G.copPeds.push(ped);
}

for (let i = 0; i < 14; i++) spawnCivilian();

function updatePeds(dt) {
  for (const ped of G.peds) {
    if (!ped.alive) continue;
    const step = ped.speed * dt * ped.dir;
    if (ped.axis === 'x') ped.pos.x += step;
    else ped.pos.z += step;
    const lim = ped.axis === 'x' ? CITY.boundX - 8 : CITY.boundZ - 8;
    const along = ped.axis === 'x' ? ped.pos.x : ped.pos.z;
    if (along > lim || along < -lim) ped.dir *= -1;
    const fixed = resolveBuildingCollision(buildings, ped.pos.x, ped.pos.z, 0.6);
    if (fixed.hit) {
      ped.pos.x = fixed.x;
      ped.pos.z = fixed.z;
      ped.dir *= -1;
    }
    ped.heading = ped.axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : ped.dir > 0 ? 0 : Math.PI;
    ped.mesh.position.copy(ped.pos);
    ped.mesh.rotation.y = ped.heading;
  }
  for (const ped of G.copPeds) {
    if (!ped.alive) continue;
    const dx = player.pos.x - ped.pos.x;
    const dz = player.pos.z - ped.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) {
      ped.pos.x += (dx / d) * ped.speed * dt;
      ped.pos.z += (dz / d) * ped.speed * dt;
    }
    ped.heading = Math.atan2(dx, dz);
    ped.mesh.rotation.y = ped.heading;
    const fixed = resolveBuildingCollision(buildings, ped.pos.x, ped.pos.z, 0.6);
    ped.pos.x = fixed.x;
    ped.pos.z = fixed.z;
    ped.mesh.position.copy(ped.pos);
    if (d < 2.2 && player.onFoot) damagePlayer(10 * dt);
  }
}

// ---------- wanted / health ---------------------------------------------------
function addWanted(n) {
  player.wanted = Math.min(5, player.wanted + n);
  G.lastCrimeT = G.time;
}

let lastThudT = -9;
function damagePlayer(amount) {
  if (G.state !== 'playing' || player.hp <= 0) return;
  player.hp -= amount;
  hud.flashDamage();
  G.shake = Math.max(G.shake, 0.45);
  if (G.time - lastThudT > 0.4) {
    lastThudT = G.time;
    audio.thud();
  }
  if (player.hp <= 0) {
    player.hp = 0;
    gameOver(player.wanted >= 3 ? 'BUSTED' : 'WASTED');
  }
}

function gameOver(title) {
  G.state = 'over';
  $('over-title').textContent = title;
  $('over-sub').textContent =
    title === 'BUSTED'
      ? 'The Bay Police got you. The Bay keeps what it takes.'
      : 'You did not make it out of Neon Bay.';
  showOverlay('over');
  audio.setSiren(false);
  if (document.pointerLockElement) document.exitPointerLock();
  saveGame();
}

// ---------- cars: kill / damage ------------------------------------------------
function killPed(ped, byGun) {
  if (!ped.alive) return;
  ped.alive = false;
  ped.mesh.visible = false;
  spawnBurst(ped.pos, 0xcc2222, 18);
  addWanted(ped.isCop ? 1 : 2);
  hud.showMessage(ped.isCop ? 'You took down a cop! +1 ★' : 'Pedestrian down! +2 ★★', 2.5);
}

function damageCar(car, point) {
  car.hp -= 34;
  spawnBurst(point || car.pos, 0xffcc33, 10);
  if (car.hp <= 0) explodeCar(car);
  else if (car.hp < 40) car.smoking = true;
}

function explodeCar(car) {
  spawnBurst(car.pos, 0xff7711, 60);
  spawnBurst(car.pos, 0x777777, 25);
  audio.crash();
  G.shake = 0.8;
  addWanted(1);
  hud.showMessage('Car destroyed! +1 ★', 2.5);
  let i = traffic.cars.indexOf(car);
  if (i >= 0) {
    traffic.cars.splice(i, 1);
    scene.remove(car.mesh);
    return;
  }
  i = police.cars.indexOf(car);
  if (i >= 0) {
    police.cars.splice(i, 1);
    scene.remove(car.mesh);
    return;
  }
  i = G.freeCars.indexOf(car);
  if (i >= 0) {
    G.freeCars.splice(i, 1);
    scene.remove(car.mesh);
    return;
  }
  scene.remove(car.mesh);
}

// ---------- shooting ------------------------------------------------------------
const raycaster = new THREE.Raycaster();
raycaster.far = 150;
const tracerGeo = new THREE.BufferGeometry();
tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const tracer = new THREE.Line(
  tracerGeo,
  new THREE.LineBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0 })
);
scene.add(tracer);
let tracerT = 0;
const muzzle = new THREE.PointLight(0xffe6a0, 0, 18);
scene.add(muzzle);

function shoot() {
  if (G.state !== 'playing' || !player.onFoot || G.shootCd > 0) return;
  G.shootCd = 0.28;
  audio.ensure();
  audio.shot();
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const targets = [];
  for (const ped of G.peds) if (ped.alive) targets.push(ped.mesh);
  for (const ped of G.copPeds) if (ped.alive) targets.push(ped.mesh);
  for (const car of traffic.cars) targets.push(car.mesh);
  for (const car of police.cars) targets.push(car.mesh);
  for (const car of G.freeCars) targets.push(car.mesh);
  const hits = raycaster.intersectObjects(targets, true);
  const from = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let to = from.clone().add(dir.multiplyScalar(60));
  if (hits.length > 0) {
    const h = hits[0];
    to = h.point.clone();
    const ref =
      h.object.userData.hitRef ||
      (h.object.userData.carGroup && h.object.userData.carGroup.userData.hitRef);
    if (ref) {
      if (ref.kind === 'ped') killPed(ref.ped, true);
      else if (ref.kind === 'car') damageCar(ref.car, h.point);
    }
  }
  const tp = tracerGeo.attributes.position.array;
  tp[0] = from.x;
  tp[1] = from.y;
  tp[2] = from.z;
  tp[3] = to.x;
  tp[4] = to.y;
  tp[5] = to.z;
  tracerGeo.attributes.position.needsUpdate = true;
  tracer.material.opacity = 1;
  tracerT = 0.09;
  muzzle.position.copy(from);
  muzzle.intensity = 6;
}

// ---------- entering / stealing cars ---------------------------------------------
function nearestCar(maxD) {
  let best = null;
  let bd = maxD;
  for (const car of [...traffic.cars, ...police.cars, ...G.freeCars]) {
    const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
    if (d < bd) {
      bd = d;
      best = car;
    }
  }
  return best;
}

function tryEnterExit() {
  if (player.onFoot) {
    const car = nearestCar(5);
    if (!car) {
      hud.showMessage('No car nearby — walk up to one and press E', 2);
      return;
    }
    // take the car out of its fleet without removing its mesh from the scene
    let i = traffic.cars.indexOf(car);
    if (i >= 0) {
      traffic.cars.splice(i, 1);
      addWanted(1);
      hud.showMessage('You stole the car! +1 ★', 2.5);
    } else {
      i = police.cars.indexOf(car);
      if (i >= 0) {
        police.cars.splice(i, 1);
        addWanted(2);
        hud.showMessage('You stole a police cruiser! +2 ★★', 2.5);
      } else {
        i = G.freeCars.indexOf(car);
        if (i >= 0) G.freeCars.splice(i, 1);
      }
    }
    player.enterCar(car);
    audio.ensure();
    audio.blip(520, 0.12, 'square', 0.15);
  } else {
    const car = player.car;
    player.exitCar();
    G.freeCars.push(car);
  }
}

// ---------- missions ---------------------------------------------------------------
function spawnTarget() {
  const car = new Car(0xe8c832); // gold sedan
  const angle = Math.random() * Math.PI * 2;
  car.pos.set(
    THREE.MathUtils.clamp(player.pos.x + Math.cos(angle) * 30, -CITY.boundX, CITY.boundX),
    0,
    THREE.MathUtils.clamp(player.pos.z + Math.sin(angle) * 30, -CITY.boundZ, CITY.boundZ)
  );
  car.heading = Math.random() * Math.PI * 2;
  car.speed = 9;
  car.maxSpeed = 13;
  car.axis = 'x';
  car.dir = 1;
  car.turnCd = 0;
  car.mesh.userData.hitRef = { kind: 'car', car };
  scene.add(car.mesh);
  traffic.cars.push(car);
  return car;
}

// ---------- save / load ---------------------------------------------------------------
function saveGame() {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        money: player.money,
        missionIdx: missions.index,
        hp: player.hp,
        wanted: player.wanted,
        x: player.pos.x,
        z: player.pos.z,
        heading: player.heading,
        onFoot: player.onFoot,
      })
    );
  } catch (e) {}
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// ---------- menus -----------------------------------------------------------------------
function showOverlay(which) {
  $('menu').classList.toggle('hidden', which !== 'menu');
  $('pause').classList.toggle('hidden', which !== 'pause');
  $('over').classList.toggle('hidden', which !== 'over');
}

function refreshContinue() {
  $('btn-continue').disabled = !loadSave();
}

function startGame(fresh) {
  audio.ensure();
  if (fresh) {
    player.reset(0, 26);
    player.money = 0;
    player.wanted = 0;
    missions.setMission(0);
    hud.showMessage('Mission 1: Hot Wheels — steal a car!', 4);
  } else {
    const s = loadSave();
    if (s) {
      player.reset(s.x, s.z);
      player.money = s.money || 0;
      player.hp = s.hp != null ? s.hp : 100;
      player.wanted = s.wanted || 0;
      player.heading = s.heading || 0;
      if (s.missionIdx >= 0) missions.setMission(s.missionIdx);
      else missions.setMission(-1);
      hud.showMessage('Welcome back to Neon Bay', 3);
    } else {
      startGame(true);
      return;
    }
  }
  G.state = 'playing';
  showOverlay(null);
  if (document.pointerLockElement) document.exitPointerLock();
}

$('btn-new').addEventListener('click', () => startGame(true));
$('btn-continue').addEventListener('click', () => startGame(false));
$('btn-resume').addEventListener('click', () => {
  G.state = 'playing';
  showOverlay(null);
});
$('btn-quit').addEventListener('click', () => {
  saveGame();
  G.state = 'menu';
  showOverlay('menu');
  refreshContinue();
});
$('btn-restart').addEventListener('click', () => startGame(true));
$('btn-menu').addEventListener('click', () => {
  G.state = 'menu';
  showOverlay('menu');
  refreshContinue();
});
refreshContinue();

// ---------- input --------------------------------------------------------------------------
const keys = {};
const input = { f: false, b: false, l: false, r: false, run: false, jump: false, lookDX: 0, lookDY: 0 };

function syncInput() {
  input.f = !!(keys.KeyW || keys.ArrowUp);
  input.b = !!(keys.KeyS || keys.ArrowDown);
  input.l = !!(keys.KeyA || keys.ArrowLeft);
  input.r = !!(keys.KeyD || keys.ArrowRight);
  input.run = !!(keys.ShiftLeft || keys.ShiftRight);
  input.jump = !!keys.Space;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  syncInput();
  if (e.repeat) return;
  audio.ensure();
  if (e.code === 'KeyE' && G.state === 'playing') tryEnterExit();
  if (e.code === 'KeyM') {
    G.muted = !G.muted;
    audio.setMuted(G.muted);
    hud.showMessage(G.muted ? 'Muted' : 'Sound on', 1.5);
  }
  if (e.code === 'Escape') {
    if (G.state === 'playing') {
      G.state = 'paused';
      showOverlay('pause');
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (G.state === 'paused') {
      G.state = 'playing';
      showOverlay(null);
    }
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  syncInput();
});

let dragging = false;
renderer.domElement.addEventListener('mousedown', (e) => {
  if (G.state !== 'playing') return;
  audio.ensure();
  if (e.button === 0) {
    if (document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock();
    }
    dragging = true;
    shoot();
  }
});
window.addEventListener('mouseup', () => {
  dragging = false;
});
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    input.lookDX += e.movementX;
    input.lookDY += e.movementY;
  } else if (dragging && G.state === 'playing') {
    input.lookDX += e.movementX;
    input.lookDY += e.movementY;
  }
});

// ---------- screenshot modes (?shot=...) -----------------------------------------------------
function applyShotMode(shot) {
  if (shot === 'foot') {
    player.reset(0, 26);
    player.camYaw = Math.PI;
    missions.setMission(0);
  } else if (shot === 'drive' || shot === 'chase' || shot === 'mission') {
    const red = new Car(0xd23b3b);
    red.mesh.userData.hitRef = { kind: 'car', car: red };
    red.pos.set(0, 0, shot === 'mission' ? 100 : 60);
    red.heading = 0;
    red.speed = 14;
    scene.add(red.mesh);
    red.sync();
    player.reset(0, red.pos.z);
    player.enterCar(red);
    player.camYaw = Math.PI;
    if (shot === 'drive') {
      missions.setMission(0);
    } else if (shot === 'chase') {
      player.wanted = 3;
      G.lastCrimeT = G.time;
      police.spawnNear(0, 60, 3);
      missions.setMission(0);
    } else {
      missions.setMission(1);
      missions.timeLeft = 88;
    }
  }
  audio.ensure();
  G.state = 'playing';
  showOverlay(null);
}

// ---------- game loop -------------------------------------------------------------------------
const clock = new THREE.Clock();

function onRam(car) {
  if (G.time - (car.ramCd || 0) < 1.2) return;
  car.ramCd = G.time;
  if (player.onFoot) {
    damagePlayer(10);
  } else {
    damagePlayer(6);
    if (player.car) player.car.speed *= 0.5;
    audio.crash();
  }
  G.shake = Math.max(G.shake, 0.6);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (G.state === 'playing') {
    G.time += dt;
    G.shootCd = Math.max(0, G.shootCd - dt);

    // --- player ---------------------------------------------------------------
    if (player.onFoot) {
      player.updateOnFoot(dt, input, buildings);
    } else {
      const res = player.updateDriving(dt, input, buildings, [
        ...traffic.cars,
        ...police.cars,
        ...G.freeCars,
      ]);
      if (res.crashed && G.time - G.lastCrashT > 1) {
        G.lastCrashT = G.time;
        audio.crash();
        G.shake = Math.max(G.shake, 0.5);
        damagePlayer(4);
        spawnBurst(player.pos, 0xffaa00, 12);
      }
    }

    // --- traffic + police -------------------------------------------------------
    for (const car of police.cars) {
      if (!car.mesh.userData.hitRef) car.mesh.userData.hitRef = { kind: 'car', car };
    }
    traffic.update(dt, buildings);

    const targetPolice = player.wanted > 0 ? Math.min(player.wanted + 1, 6) : 0;
    if (player.wanted > 0) {
      G.policeSpawnT -= dt;
      if (police.cars.length < targetPolice && G.policeSpawnT <= 0) {
        police.spawnNear(player.pos.x, player.pos.z, 1);
        G.policeSpawnT = 4;
      }
    } else if (police.cars.length > 0) {
      G.policeDespawnT -= dt;
      if (G.policeDespawnT <= 0) {
        police.remove(police.cars[police.cars.length - 1]);
        G.policeDespawnT = 1.5;
      }
    }
    police.update(dt, player.pos, player.car, onRam);

    // --- wanted decay: 20 s clean + no police within 50 -> one star drops -----
    if (player.wanted > 0 && G.time - G.lastCrimeT > 20) {
      let near = false;
      for (const c of police.cars) {
        if (Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z) < 50) {
          near = true;
          break;
        }
      }
      if (!near) {
        player.wanted = Math.max(0, player.wanted - 1);
        G.lastCrimeT = G.time;
      }
    }

    // --- pedestrians --------------------------------------------------------------
    updatePeds(dt);
    // cop peds spawn while the heat is on, vanish when it cools off
    if (player.wanted >= 2) {
      G.copSpawnT -= dt;
      const aliveCops = G.copPeds.filter((p) => p.alive).length;
      if (aliveCops < Math.min(player.wanted, 4) && G.copSpawnT <= 0) {
        spawnCopPed();
        G.copSpawnT = 3;
      }
    } else {
      for (const ped of G.copPeds) {
        if (ped.alive) {
          ped.alive = false;
          ped.mesh.visible = false;
        }
      }
    }
    // running peds over while driving
    if (!player.onFoot && player.car && Math.abs(player.car.speed) > 5) {
      for (const ped of [...G.peds, ...G.copPeds]) {
        if (!ped.alive) continue;
        const d = Math.hypot(ped.pos.x - player.pos.x, ped.pos.z - player.pos.z);
        if (d < 2.6) {
          killPed(ped, false);
          audio.thud();
        }
      }
    }

    // --- missions -----------------------------------------------------------------
    const mResult = missions.update(dt, { player, spawnTarget });
    if (mResult === 'complete') {
      const payout = missions.complete();
      player.money += payout;
      audio.jingle();
      hud.showMessage(`Mission complete! +$${payout}`, 4);
      spawnBurst(player.pos, 0xffe600, 40);
      saveGame();
      if (!missions.current) {
        hud.showMessage('All missions complete! Neon Bay is yours — free roam.', 5);
      }
    } else if (mResult === 'failed') {
      audio.thud();
      hud.showMessage('Mission failed — try again', 3.5);
      missions.fail();
    }

    // --- particles, smoke, audio ----------------------------------------------------
    updateParticles(dt);
    for (const car of [...traffic.cars, ...police.cars, ...G.freeCars]) {
      if (car.smoking && Math.random() < dt * 8) {
        spawnBurst(new THREE.Vector3(car.pos.x, car.pos.y + 1.2, car.pos.z), 0x888888, 1);
      }
    }
    audio.setEngine(Math.min(1, Math.abs(player.speed || 0) / 26), !player.onFoot);
    audio.setSiren(player.wanted > 0 && police.cars.length > 0);

    // --- autosave ----------------------------------------------------------------------
    G.autosaveT += dt;
    if (G.autosaveT > 15) {
      G.autosaveT = 0;
      saveGame();
    }

    // --- camera + shake ------------------------------------------------------------------
    player.updateCamera(camera, dt, input);
    if (G.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * G.shake;
      camera.position.y += (Math.random() - 0.5) * G.shake;
      G.shake = Math.max(0, G.shake - dt * 1.4);
    }

    hud.update(dt, G);
  }

  // tracer + muzzle fade (runs in every state so shots finish cleanly)
  if (tracerT > 0) {
    tracerT -= dt;
    if (tracerT <= 0) tracer.material.opacity = 0;
  }
  if (muzzle.intensity > 0) muzzle.intensity = Math.max(0, muzzle.intensity - dt * 40);

  renderer.render(scene, camera);
}

// ---------- boot ----------------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) applyShotMode(shot);
animate();
