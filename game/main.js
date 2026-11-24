// Neon Bay — main.js
// Bootstrap, game loop, input, shooting, wanted level, pedestrians, particles,
// save/load, menus, and screenshot hooks (?shot=foot|drive|chase|mission).
import * as THREE from 'three';
import { buildCity, CITY, resolveBuildingCollision } from './city.js';
import { makeCarMesh, Traffic, Police, Car } from './vehicles.js';
import { Player } from './player.js';
import { MissionManager } from './missions.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // foot | drive | chase | mission
const SAVE_KEY = 'neon-bay-save-v1';

// ---------------------------------------------------------------- setup
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a1e3a);
scene.fog = new THREE.Fog(0x2a1e3a, 130, 430);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 900);
camera.position.set(0, 12, 48);

const hemi = new THREE.HemisphereLight(0xffd9a0, 0x2a2f3a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb36b, 1.8);
sun.position.set(140, 190, 80);
scene.add(sun);

// ---------------------------------------------------------------- world
const { buildings } = buildCity(scene);
const rng = (() => {
  let s = 987654321;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

const traffic = new Traffic(scene, rng);
const police = new Police(scene, rng);
const player = new Player(scene);
const missions = new MissionManager(scene);
const hud = new HUD();
const audio = new AudioSys();

const G = {
  state: 'menu', // menu | playing | paused | over
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
  saveT: 0,
  policeSpawnT: 0,
  ramCooldown: 0,
  crashT: 0,
  shakeT: 0,
  shakeMag: 0,
  shotCooldown: 0,
};
window.__NB = G;

// ---------------------------------------------------------------- pedestrians
const PED_COLORS = [0xe74c3c, 0x3498db, 0xf39c12, 0x1abc9c, 0x9b59b6, 0xecf0f1, 0xfd79a8, 0x00cec9];
function makePedMesh(color, isCop) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: isCop ? 0x1a2a4a : color, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.62, 4, 8), bodyMat);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 })
  );
  head.position.y = 1.85;
  g.add(head);
  if (isCop) {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10),
      new THREE.MeshStandardMaterial({ color: 0x0a1428, roughness: 0.6 })
    );
    cap.position.y = 2.05;
    g.add(cap);
  }
  return g;
}
function spawnPed(isCop, near) {
  const mesh = makePedMesh(isCop ? 0 : PED_COLORS[Math.floor(rng() * PED_COLORS.length)], isCop);
  scene.add(mesh);
  let x;
  let z;
  if (near) {
    const a = rng() * Math.PI * 2;
    x = THREE.MathUtils.clamp(player.pos.x + Math.cos(a) * 30, -185, 185);
    z = THREE.MathUtils.clamp(player.pos.z + Math.sin(a) * 30, -185, 185);
  } else {
    const road = CITY.roads[Math.floor(rng() * CITY.roads.length)];
    const along = -180 + rng() * 360;
    if (rng() < 0.5) {
      x = along;
      z = road + (rng() < 0.5 ? 8.5 : -8.5);
    } else {
      x = road + (rng() < 0.5 ? 8.5 : -8.5);
      z = along;
    }
  }
  const ped = {
    mesh,
    pos: new THREE.Vector3(x, 0, z),
    heading: rng() * Math.PI * 2,
    speed: isCop ? 5.6 : 1.4 + rng() * 1.2,
    isCop,
    hp: 100,
    dead: false,
    deadT: 0,
    axis: rng() < 0.5 ? 'x' : 'z',
    road: CITY.roads[Math.floor(rng() * CITY.roads.length)],
    dir: rng() < 0.5 ? 1 : -1,
  };
  mesh.position.copy(ped.pos);
  (isCop ? G.copPeds : G.peds).push(ped);
  return ped;
}
for (let i = 0; i < 14; i++) spawnPed(false, false);

function updatePeds(dt) {
  for (const list of [G.peds, G.copPeds]) {
    for (const ped of list) {
      if (ped.dead) {
        ped.deadT += dt;
        ped.mesh.rotation.x = Math.min(ped.mesh.rotation.x + dt * 3, Math.PI / 2);
        if (ped.deadT > 2.5) {
          scene.remove(ped.mesh);
          list.splice(list.indexOf(ped), 1);
        }
        continue;
      }
      if (ped.isCop && player.wanted >= 2) {
        // Chase the player on foot.
        const want = Math.atan2(player.pos.x - ped.pos.x, player.pos.z - ped.pos.z);
        ped.heading = want;
        ped.pos.addScaledVector(new THREE.Vector3(Math.sin(want), 0, Math.cos(want)), ped.speed * dt);
        const d = ped.pos.distanceTo(player.pos);
        if (d < 2.0 && player.onFoot) {
          damagePlayer(10 * dt, 'cop');
        }
      } else if (!ped.isCop) {
        // Stroll the sidewalk; turn around at the city edge.
        if (ped.axis === 'x') {
          ped.pos.x += ped.dir * ped.speed * dt;
          ped.heading = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          if (ped.pos.x > 188 || ped.pos.x < -188) ped.dir *= -1;
        } else {
          ped.pos.z += ped.dir * ped.speed * dt;
          ped.heading = ped.dir > 0 ? 0 : Math.PI;
          if (ped.pos.z > 188 || ped.pos.z < -188) ped.dir *= -1;
        }
      } else {
        // Cop with no heat: stand at the corner.
        ped.pos.y = 0;
      }
      const fixed = resolveBuildingCollision(buildings, ped.pos.x, ped.pos.z, 0.5);
      ped.pos.x = fixed.x;
      ped.pos.z = fixed.z;
      ped.mesh.position.copy(ped.pos);
      ped.mesh.rotation.y = ped.heading;
    }
  }
  // Player car hitting pedestrians.
  if (!player.onFoot && Math.abs(player.speed) > 5) {
    for (const ped of [...G.peds, ...G.copPeds]) {
      if (ped.dead) continue;
      if (ped.pos.distanceTo(player.pos) < 2.6) {
        killPed(ped);
        addWanted(ped.isCop ? 1 : 2);
        audio.thud();
      }
    }
  }
}
function killPed(ped) {
  ped.dead = true;
  ped.deadT = 0;
  spawnBurst(ped.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xdd2222, 14);
}

// ---------------------------------------------------------------- particles
const P_MAX = 300;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(P_MAX * 3);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: 0xffaa33, size: 0.5, transparent: true, opacity: 0.95 });
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);
const parts = [];
function spawnBurst(pos, color, n) {
  for (let i = 0; i < n; i++) {
    if (parts.length >= P_MAX) parts.shift();
    parts.push({
      pos: pos.clone(),
      vel: new THREE.Vector3((rng() - 0.5) * 8, rng() * 6, (rng() - 0.5) * 8),
      life: 0.7 + rng() * 0.5,
    });
  }
  pMat.color.setHex(color);
}
function updateParticles(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) {
      parts.splice(i, 1);
      continue;
    }
    p.vel.y -= 12 * dt;
    p.pos.addScaledVector(p.vel, dt);
  }
  for (let i = 0; i < P_MAX; i++) {
    const p = parts[i];
    if (p) {
      pPos[i * 3] = p.pos.x;
      pPos[i * 3 + 1] = p.pos.y;
      pPos[i * 3 + 2] = p.pos.z;
    } else {
      pPos[i * 3 + 1] = -100;
    }
  }
  pGeo.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------- shooting
const raycaster = new THREE.Raycaster();
const tracerGeo = new THREE.BufferGeometry();
tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0 });
const tracer = new THREE.Line(tracerGeo, tracerMat);
tracer.frustumCulled = false;
scene.add(tracer);
const muzzle = new THREE.PointLight(0xffe6a0, 0, 18);
scene.add(muzzle);
let tracerT = 0;

function shoot() {
  if (G.shotCooldown > 0 || !player.onFoot) return;
  G.shotCooldown = 0.28;
  audio.shot();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = 70;
  const targets = [];
  for (const ped of [...G.peds, ...G.copPeds]) if (!ped.dead) targets.push(ped.mesh);
  for (const c of [...traffic.cars, ...police.cars]) targets.push(c.mesh);
  const hits = raycaster.intersectObjects(targets, true);
  let end;
  if (hits.length > 0) {
    const hit = hits[0];
    end = hit.point.clone();
    // Find what was hit.
    let obj = hit.object;
    while (obj && !obj.userData.hitRef) obj = obj.parent;
    const ref = obj ? obj.userData.hitRef : null;
    if (ref) {
      if (ref.kind === 'ped') {
        killPed(ref.ped);
        addWanted(ref.ped.isCop ? 1 : 2);
      } else if (ref.kind === 'car') {
        damageCar(ref.car, 34);
      }
    }
    spawnBurst(end, 0xffcc44, 8);
  } else {
    end = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 60);
  }
  // Tracer from the gun to the hit point.
  const start = camera.position.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 1.2);
  start.y -= 0.25;
  const arr = tracerGeo.attributes.position.array;
  arr[0] = start.x;
  arr[1] = start.y;
  arr[2] = start.z;
  arr[3] = end.x;
  arr[4] = end.y;
  arr[5] = end.z;
  tracerGeo.attributes.position.needsUpdate = true;
  tracerMat.opacity = 0.95;
  tracerT = 0.09;
  muzzle.position.copy(start);
  muzzle.intensity = 6;
}
// Tag meshes with hit refs (done lazily each shot setup).
function tagHitRefs() {
  for (const ped of [...G.peds, ...G.copPeds]) ped.mesh.userData.hitRef = { kind: 'ped', ped };
  for (const c of [...traffic.cars, ...police.cars]) c.mesh.userData.hitRef = { kind: 'car', car: c };
}
function damageCar(car, dmg) {
  car.hp -= dmg;
  if (car.hp <= 0) {
    spawnBurst(car.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff7722, 26);
    audio.crash();
    if (police.cars.includes(car)) {
      police.remove(car);
      addWanted(1);
    } else if (traffic.cars.includes(car)) {
      traffic.remove(car);
      addWanted(1);
      traffic.spawnCar(true);
    }
  } else if (car.hp < 40 && !car.smoking) {
    car.smoking = true;
    spawnBurst(car.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0x888888, 10);
  }
}

// ---------------------------------------------------------------- wanted & damage
function addWanted(n) {
  if (player.wanted >= 5) return;
  player.wanted = Math.min(5, player.wanted + n);
  G.lastCrimeT = G.time;
  hud.showMessage(`Wanted level ${player.wanted} — the cops are coming`, 2.5);
}
function damagePlayer(amount, cause) {
  if (G.state !== 'playing' || player.hp <= 0) return;
  player.hp -= amount;
  hud.flashDamage();
  G.shakeT = 0.25;
  G.shakeMag = 0.25;
  if (player.hp <= 0) {
    player.hp = 0;
    gameOver(player.wanted >= 3 ? 'BUSTED' : 'WASTED');
  }
}
function gameOver(title) {
  G.state = 'over';
  document.exitPointerLock?.();
  document.getElementById('over-title').textContent = title;
  document.getElementById('over-sub').textContent =
    title === 'BUSTED'
      ? 'The Neon Bay PD finally caught up with Rex.'
      : 'Rex went down in the streets of Neon Bay.';
  document.getElementById('over').style.display = 'flex';
  audio.setSiren(false);
  audio.setEngine(0, false);
}

// ---------------------------------------------------------------- save / load
function saveGame() {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        money: player.money,
        missionIdx: missions.idx,
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
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    player.money = s.money || 0;
    player.hp = s.hp ?? 100;
    player.wanted = s.wanted || 0;
    missions.setMission(Math.min(s.missionIdx || 0, 4));
    player.reset(s.x ?? 0, s.z ?? 30);
    player.heading = s.heading || 0;
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------- input
const keys = {};
const input = { f: false, b: false, l: false, r: false, run: false, jump: false, lookDX: 0, lookDY: 0 };
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE' && G.state === 'playing') toggleCar();
  if (e.code === 'Escape' && G.state === 'playing') pauseGame();
  if (e.code === 'KeyM') audio.muted = !audio.muted;
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
});
function readInput() {
  input.f = keys['KeyW'] || keys['ArrowUp'];
  input.b = keys['KeyS'] || keys['ArrowDown'];
  input.l = keys['KeyA'] || keys['ArrowLeft'];
  input.r = keys['KeyD'] || keys['ArrowRight'];
  input.run = keys['ShiftLeft'] || keys['ShiftRight'];
  input.jump = keys['Space'];
}
let dragging = false;
let lastX = 0;
let lastY = 0;
renderer.domElement.addEventListener('mousedown', (e) => {
  audio.ensure();
  if (G.state !== 'playing') return;
  if (e.button === 0) {
    if (player.onFoot) shoot();
    if (!SHOT) renderer.domElement.requestPointerLock?.();
  }
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
addEventListener('mouseup', () => (dragging = false));
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    input.lookDX += e.movementX;
    input.lookDY += e.movementY;
  } else if (dragging && G.state === 'playing') {
    input.lookDX += e.clientX - lastX;
    input.lookDY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function toggleCar() {
  if (player.onFoot) {
    // Find the nearest car.
    const all = [...traffic.cars, ...police.cars];
    let best = null;
    let bd = 5;
    for (const c of all) {
      const d = c.pos.distanceTo(player.pos);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best) {
      const isPoliceCar = police.cars.includes(best);
      const wasNpc = traffic.cars.includes(best);
      if (wasNpc) traffic.remove(best);
      if (isPoliceCar) police.remove(best);
      player.enterCar(best);
      addWanted(isPoliceCar ? 2 : 1);
      hud.showMessage(isPoliceCar ? 'You stole a cop car!' : 'Car stolen — nice wheels', 2);
      audio.chime();
    }
  } else {
    player.exitCar();
  }
}

// ---------------------------------------------------------------- menus
function show(id, on) {
  document.getElementById(id).style.display = on ? 'flex' : 'none';
}
function startGame(fresh) {
  audio.ensure();
  if (fresh || !loadGame()) {
    player.reset(0, 30);
    player.money = 0;
    missions.setMission(0);
  }
  show('menu', false);
  show('over', false);
  show('pause', false);
  G.state = 'playing';
  hud.showMessage('Welcome to Neon Bay. Follow the yellow marker.', 4);
}
function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  document.exitPointerLock?.();
  show('pause', true);
  audio.setSiren(false);
}
document.getElementById('btn-new').addEventListener('click', () => startGame(true));
document.getElementById('btn-continue').addEventListener('click', () => startGame(false));
document.getElementById('btn-resume').addEventListener('click', () => {
  show('pause', false);
  G.state = 'playing';
});
document.getElementById('btn-restart').addEventListener('click', () => {
  show('over', false);
  startGame(true);
});
document.getElementById('btn-menu').addEventListener('click', () => {
  show('over', false);
  show('menu', true);
  G.state = 'menu';
});
document.getElementById('btn-quit').addEventListener('click', () => {
  saveGame();
  show('pause', false);
  show('menu', true);
  G.state = 'menu';
});
// Continue button only when a save exists.
try {
  document.getElementById('btn-continue').style.display = localStorage.getItem(SAVE_KEY) ? 'inline-block' : 'none';
} catch (e) {}

// ---------------------------------------------------------------- missions: target car for the tail job
function spawnTargetCar() {
  const p = traffic.randomRoadPoint();
  const mesh = makeCarMesh(0xffd700, false);
  scene.add(mesh);
  const car = new Car(mesh, p.x, p.z, p.heading);
  car.speed = 13;
  car.cruise = 13;
  car.maxSpeed = 16;
  traffic.cars.push(car);
  car.mesh.userData.hitRef = { kind: 'car', car };
  return car;
}

// ---------------------------------------------------------------- screenshot scenarios
function setupShot() {
  if (!SHOT) return;
  startGame(true);
  if (SHOT === 'drive' || SHOT === 'chase' || SHOT === 'mission') {
    const mesh = makeCarMesh(0xc0392b, false);
    scene.add(mesh);
    const car = new Car(mesh, 0, 52, 0);
    car.speed = 12;
    car.mesh.userData.hitRef = { kind: 'car', car };
    player.enterCar(car);
  }
  if (SHOT === 'chase') {
    player.wanted = 3;
    G.lastCrimeT = G.time;
    police.spawnNear(player.pos.x, player.pos.z, 3);
  }
  if (SHOT === 'mission') {
    missions.setMission(1);
    missions.timeLeft = 88;
    player.pos.set(0, 0, 100);
    if (player.car) {
      player.car.pos.set(0, 0, 100);
      player.car.heading = Math.PI;
      player.car.sync();
    }
  }
  if (SHOT === 'foot') {
    player.reset(0, 20);
    player.camYaw = Math.PI;
  }
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.state === 'playing') {
    G.time += dt;
    readInput();
    G.shotCooldown = Math.max(0, G.shotCooldown - dt);
    G.ramCooldown = Math.max(0, G.ramCooldown - dt);
    G.crashT = Math.max(0, G.crashT - dt);
    // Player.
    if (player.onFoot) {
      player.updateOnFoot(dt, input, buildings);
    } else {
      const res = player.updateDriving(dt, input, buildings, [...traffic.cars, ...police.cars]);
      if (res.crashed && G.crashT <= 0) {
        G.crashT = 0.8;
        audio.crash();
        damagePlayer(4, 'crash');
        G.shakeT = 0.2;
        G.shakeMag = 0.3;
      }
    }
    // Traffic + police.
    const obstacles = [...traffic.cars, ...police.cars];
    if (player.car) obstacles.push(player.car);
    traffic.update(dt, obstacles);
    // Police management.
    const wantCount = player.wanted > 0 ? Math.min(player.wanted + 1, 6) : 0;
    G.policeSpawnT -= dt;
    if (police.cars.length < wantCount && G.policeSpawnT <= 0) {
      police.spawnNear(player.pos.x, player.pos.z, 1);
      G.policeSpawnT = 4;
    }
    if (player.wanted === 0) {
      for (const c of [...police.cars]) {
        if (c.pos.distanceTo(player.pos) > 120) police.remove(c);
      }
      for (const cp of [...G.copPeds]) {
        if (cp.pos.distanceTo(player.pos) > 100) {
          scene.remove(cp.mesh);
          G.copPeds.splice(G.copPeds.indexOf(cp), 1);
        }
      }
    } else if (G.copPeds.length < Math.min(player.wanted, 3) && player.wanted >= 2 && rng() < dt * 0.3) {
      spawnPed(true, true);
    }
    police.update(dt, player.pos, player.car, (car) => {
      if (G.ramCooldown <= 0) {
        G.ramCooldown = 1;
        damagePlayer(6, 'ram');
        audio.crash();
        if (player.car) player.car.speed *= 0.7;
      }
    });
    updatePeds(dt);
    // Wanted decay: 20s without crime and no cop nearby.
    if (player.wanted > 0 && G.time - G.lastCrimeT > 20) {
      let nearCop = false;
      for (const c of police.cars) if (c.pos.distanceTo(player.pos) < 50) nearCop = true;
      if (!nearCop) {
        player.wanted -= 1;
        G.lastCrimeT = G.time;
        if (player.wanted === 0) hud.showMessage('You lost them. Heat is off.', 3);
      }
    }
    // Missions.
    const mRes = missions.update(dt, {
      player,
      spawnTarget: spawnTargetCar,
    });
    if (mRes === 'complete') {
      const payout = missions.complete();
      player.money += payout;
      hud.showMessage(`Mission complete! +$${payout}`, 3.5);
      audio.jingle();
      saveGame();
    } else if (mRes === 'failed') {
      hud.showMessage('Mission failed — the clock ran out. Try again.', 3.5);
      missions.fail();
    }
    // Target car for the tail job keeps driving with traffic.
    if (missions.targetCar && !traffic.cars.includes(missions.targetCar)) {
      traffic.cars.push(missions.targetCar);
    }
    // Camera, audio, particles, tracer.
    player.updateCamera(camera, dt, input);
    if (G.shakeT > 0) {
      G.shakeT -= dt;
      camera.position.x += (rng() - 0.5) * G.shakeMag;
      camera.position.y += (rng() - 0.5) * G.shakeMag;
    }
    audio.setEngine(player.onFoot ? 0 : Math.abs(player.speed) / 26, !player.onFoot);
    audio.setSiren(player.wanted > 0 && police.cars.length > 0);
    if (tracerT > 0) {
      tracerT -= dt;
      tracerMat.opacity = Math.max(0, tracerT / 0.09) * 0.95;
      muzzle.intensity = Math.max(0, muzzle.intensity - dt * 60);
    }
    updateParticles(dt);
    hud.update(dt, G);
    // Autosave.
    G.saveT += dt;
    if (G.saveT > 15) {
      G.saveT = 0;
      saveGame();
    }
    tagHitRefs();
  }
  renderer.render(scene, camera);
}

setupShot();
if (!SHOT) {
  // Menu backdrop: slow orbit over the city.
  camera.position.set(60, 55, 120);
  camera.lookAt(0, 0, 0);
}
animate();
