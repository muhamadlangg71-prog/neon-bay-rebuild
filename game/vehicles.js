// Neon Bay vehicles: car meshes, the player's drivable car, ambient traffic
// AI and the Bay Police pursuit AI. All cars are built from boxes and
// cylinders — no external models.
import * as THREE from 'three';
import { CITY, insideBuilding } from './city.js';

const CAR_COLORS = [0xd23b3b, 0x3b7dd2, 0xe8c832, 0x37b24d, 0xe86a1e, 0x9b59d0, 0xdddddd, 0x222831];

// Build a low-poly car. The front of the car faces -Z so that a mesh with
// rotation.y = heading + PI travels along (sin h, 0, cos h).
export function makeCarMesh(color, isPolice = false) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14181f });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc4dd });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.58, 2.1), glass);
  cabin.position.set(0, 1.12, 0.25);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0c0e11 });
  for (const [wx, wz] of [[-0.95, -1.45], [0.95, -1.45], [-0.95, 1.45], [0.95, 1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
  }

  // headlights (front = -Z) glow yellow, taillights glow red
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const hx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    h.position.set(hx, 0.6, -2.22);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    t.position.set(hx, 0.6, 2.22);
    group.add(t);
  }

  let barRed = null;
  let barBlue = null;
  if (isPolice) {
    // white doors on a black-and-white cruiser
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    for (const dx of [-1.01, 1.01]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 1.7), doorMat);
      door.position.set(dx, 0.62, 0.1);
      group.add(door);
    }
    barRed = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2020 })
    );
    barRed.position.set(-0.45, 1.55, 0.25);
    group.add(barRed);
    barBlue = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2040ff })
    );
    barBlue.position.set(0.45, 1.55, 0.25);
    group.add(barBlue);
  }

  group.userData.barRed = barRed;
  group.userData.barBlue = barBlue;
  group.traverse((o) => {
    o.userData.carGroup = group;
  });
  return group;
}

export class Car {
  constructor(color, isPolice = false) {
    this.mesh = makeCarMesh(color, isPolice);
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;
    this.speed = 0;
    this.maxSpeed = 26;
    this.hp = 100;
    this.smoking = false;
    this.isPolice = isPolice;
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading + Math.PI;
  }
}

// Pick a random road line and a random point along it.
function randomRoadPoint(rng) {
  const road = CITY.roads[Math.floor(rng() * CITY.roads.length)];
  const along = (rng() * 2 - 1) * (CITY.boundX - 15);
  return { road, along };
}

// Ambient traffic: 12 cars cruising the grid, turning at intersections and
// braking for the car ahead. They stay on the roads, right-hand lane.
export class Traffic {
  constructor(scene, buildings) {
    this.scene = scene;
    this.buildings = buildings;
    this.cars = [];
    const rng = Math.random;
    for (let i = 0; i < 12; i++) {
      const car = new Car(CAR_COLORS[i % CAR_COLORS.length]);
      const horizontal = rng() < 0.5;
      const dir = rng() < 0.5 ? 1 : -1;
      const { road, along } = randomRoadPoint(rng);
      // right-hand lane: offset +3 on the right side of the direction of travel
      const lane = horizontal ? (dir > 0 ? 3 : -3) : (dir > 0 ? -3 : 3);
      if (horizontal) {
        car.pos.set(along, 0, road + lane);
        car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.pos.set(road + lane, 0, along);
        car.heading = dir > 0 ? 0 : Math.PI;
      }
      car.speed = 7 + rng() * 5;
      car.maxSpeed = 10 + rng() * 4;
      car.turnCd = 0;
      car.axis = horizontal ? 'x' : 'z';
      car.dir = dir;
      scene.add(car.mesh);
      car.sync();
      this.cars.push(car);
    }
  }

  // Nearest road centreline to a value, and the distance to it.
  nearestRoad(v) {
    let best = CITY.roads[0];
    let bd = Math.abs(v - best);
    for (const r of CITY.roads) {
      const d = Math.abs(v - r);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return { road: best, dist: bd };
  }

  update(dt, obstacles) {
    for (const car of this.cars) {
      car.turnCd -= dt;
      // --- braking: slow down for a car ahead in the same lane -------------
      let want = car.maxSpeed;
      const fwd = car.forward();
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.pos.x - car.pos.x;
        const dz = other.pos.z - car.pos.z;
        const ahead = dx * fwd.x + dz * fwd.z;
        const side = Math.abs(dx * fwd.z - dz * fwd.x);
        if (ahead > 0 && ahead < 9 && side < 2.6) {
          want = Math.min(want, Math.max(0, other.speed - 1));
        }
      }
      car.speed += (want - car.speed) * Math.min(1, dt * 1.6);

      // --- move -------------------------------------------------------------
      car.pos.x += fwd.x * car.speed * dt;
      car.pos.z += fwd.z * car.speed * dt;

      // --- turn at intersections --------------------------------------------
      const cross = car.axis === 'x' ? this.nearestRoad(car.pos.z) : this.nearestRoad(car.pos.x);
      const alongVal = car.axis === 'x' ? car.pos.x : car.pos.z;
      const nearCross = this.nearestRoad(alongVal);
      if (cross.dist < 1.2 && nearCross.dist < 2.2 && car.turnCd <= 0) {
        const roll = Math.random();
        car.turnCd = 2.5;
        const turnLeft = roll < 0.2;
        const turnRight = roll >= 0.2 && roll < 0.4;
        if (turnLeft || turnRight) {
          const oldAxis = car.axis;
          const oldDir = car.dir;
          const newAxis = oldAxis === 'x' ? 'z' : 'x';
          // turning left from heading h means heading - PI/2 (driver's left)
          let newHeading;
          if (oldAxis === 'x') {
            // east (+x): left = north (-z) heading PI; right = south (+z) heading 0
            // west (-x): left = south (+z) heading 0; right = north (-z) heading PI
            newHeading = turnLeft ? (oldDir > 0 ? Math.PI : 0) : (oldDir > 0 ? 0 : Math.PI);
          } else {
            // north (-z, heading PI): left = west heading -PI/2; right = east heading PI/2
            // south (+z, heading 0): left = east heading PI/2; right = west heading -PI/2
            newHeading = turnLeft
              ? (oldDir > 0 ? Math.PI / 2 : -Math.PI / 2)
              : (oldDir > 0 ? -Math.PI / 2 : Math.PI / 2);
          }
          const newDir = Math.abs(Math.sin(newHeading)) > 0.5 ? Math.sign(Math.sin(newHeading)) : Math.sign(Math.cos(newHeading));
          const lane = newAxis === 'x' ? (newDir > 0 ? 3 : -3) : (newDir > 0 ? -3 : 3);
          if (newAxis === 'x') {
            car.pos.z = nearCross.road + lane;
            car.pos.x = cross.road;
          } else {
            car.pos.x = nearCross.road + lane;
            car.pos.z = cross.road;
          }
          car.axis = newAxis;
          car.dir = newDir;
          car.heading = newHeading;
        }
      }

      // --- wrap around the city edge -----------------------------------------
      if (car.pos.x > CITY.boundX) car.pos.x = -CITY.boundX;
      if (car.pos.x < -CITY.boundX) car.pos.x = CITY.boundX;
      if (car.pos.z > CITY.boundZ) car.pos.z = -CITY.boundZ;
      if (car.pos.z < -CITY.boundZ) car.pos.z = CITY.boundZ;

      // safety: never end up inside a building (roads are clear, but be safe)
      if (obstacles && insideBuilding(obstacles, car.pos.x, car.pos.z, 0.5)) {
        car.heading += Math.PI;
        car.dir = -car.dir;
      }
      car.sync();
    }
  }

  remove(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.mesh);
  }
}

// Bay Police: cruisers that spawn near the player and ram them. Their light
// bars flash red/blue in turns.
export class Police {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    this.flashT = 0;
  }

  spawnNear(x, z, count) {
    for (let i = 0; i < count; i++) {
      const car = new Car(0x14181f, true);
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 25;
      car.pos.set(
        THREE.MathUtils.clamp(x + Math.cos(angle) * dist, -CITY.boundX, CITY.boundX),
        0,
        THREE.MathUtils.clamp(z + Math.sin(angle) * dist, -CITY.boundZ, CITY.boundZ)
      );
      car.heading = Math.atan2(x - car.pos.x, z - car.pos.z);
      car.speed = 12;
      car.maxSpeed = 30;
      this.scene.add(car.mesh);
      car.sync();
      this.cars.push(car);
    }
  }

  update(dt, playerPos, playerCar, onRam) {
    this.flashT += dt;
    const flashOn = Math.floor(this.flashT * 4) % 2 === 0;
    for (const car of this.cars) {
      const dx = playerPos.x - car.pos.x;
      const dz = playerPos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      // steer toward the player, limited turn rate
      let dh = targetHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += THREE.MathUtils.clamp(dh, -2.2 * dt, 2.2 * dt);
      // fast when far, gentle when close so the ram lands
      const want = dist > 30 ? 30 : dist > 12 ? 20 : 11;
      car.speed += (want - car.speed) * Math.min(1, dt * 1.2);
      const fwd = car.forward();
      car.pos.x += fwd.x * car.speed * dt;
      car.pos.z += fwd.z * car.speed * dt;
      car.pos.x = THREE.MathUtils.clamp(car.pos.x, -CITY.boundX, CITY.boundX);
      car.pos.z = THREE.MathUtils.clamp(car.pos.z, -CITY.boundZ, CITY.boundZ);
      car.sync();
      // alternate the light bar
      if (car.mesh.userData.barRed && car.mesh.userData.barBlue) {
        car.mesh.userData.barRed.material.color.setHex(flashOn ? 0xff2020 : 0x550000);
        car.mesh.userData.barBlue.material.color.setHex(flashOn ? 0x101050 : 0x2040ff);
      }
      if (dist < 4.2 && onRam) onRam(car);
    }
  }

  remove(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.mesh);
  }

  clear() {
    for (const car of this.cars) this.scene.remove(car.mesh);
    this.cars.length = 0;
  }
}
