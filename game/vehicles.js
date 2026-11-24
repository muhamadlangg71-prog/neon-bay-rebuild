// Neon Bay — vehicles.js
// Car meshes, NPC traffic that follows the road grid, and police pursuit.
import * as THREE from 'three';
import { CITY } from './city.js';

const CAR_COLORS = [0xc0392b, 0x2980b9, 0xf1c40f, 0x7f8c8d, 0x27ae60, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x2c3e50, 0x16a085];

export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: isPolice ? 0x111318 : color,
    roughness: 0.35,
    metalness: 0.55,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.55, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.2, metalness: 0.7 })
  );
  cabin.position.set(0, 1.1, -0.25);
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 });
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
  }
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff2b0, emissiveIntensity: 2 });
  for (const wx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    hl.position.set(wx, 0.62, 2.22);
    g.add(hl);
    const tl = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.18, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2222, emissiveIntensity: 1.5 })
    );
    tl.position.set(wx, 0.62, -2.22);
    g.add(tl);
  }
  let barRed = null;
  let barBlue = null;
  if (isPolice) {
    // White doors + black hood read as a patrol car.
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(2.14, 0.4, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.4 })
    );
    door.position.set(0, 0.6, 0.1);
    g.add(door);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.5, -0.25);
    g.add(bar);
    barRed = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.2, 0.52),
      new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff0000, emissiveIntensity: 3 })
    );
    barRed.position.set(-0.38, 1.52, -0.25);
    g.add(barRed);
    barBlue = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.2, 0.52),
      new THREE.MeshStandardMaterial({ color: 0x000022, emissive: 0x2244ff, emissiveIntensity: 3 })
    );
    barBlue.position.set(0.38, 1.52, -0.25);
    g.add(barBlue);
  }
  g.userData.barRed = barRed;
  g.userData.barBlue = barBlue;
  return g;
}

// A car in the world: position, heading (radians, 0 = +z/south... forward = -z of mesh),
// speed and its mesh. Forward vector is (sin h, 0, cos h) with mesh rotated so its nose
// points along +heading: mesh faces -z at rotation 0, so rotation.y = heading + PI.
export class Car {
  constructor(mesh, x, z, heading) {
    this.mesh = mesh;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.maxSpeed = 26;
    this.hp = 100;
    this.smoking = false;
    this.sync();
  }
  forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }
  sync() {
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading + Math.PI;
  }
}

// NPC traffic: cars cruise the road grid, turn at intersections, brake for cars ahead.
export class Traffic {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.cars = [];
    for (let i = 0; i < 12; i++) this.spawnCar(true);
  }
  randomRoadPoint() {
    const axisX = this.rng() < 0.5;
    const road = CITY.roads[Math.floor(this.rng() * CITY.roads.length)];
    const along = -180 + this.rng() * 360;
    const dir = this.rng() < 0.5 ? 1 : -1;
    if (axisX) {
      // Driving along x on road z = road; right-hand lane offset.
      return { x: along, z: road + (dir > 0 ? 3 : -3), heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
    }
    return { x: road + (dir > 0 ? -3 : 3), z: along, heading: dir > 0 ? 0 : Math.PI };
  }
  spawnCar(anywhere) {
    const p = this.randomRoadPoint();
    const color = CAR_COLORS[Math.floor(this.rng() * CAR_COLORS.length)];
    const mesh = makeCarMesh(color, false);
    this.scene.add(mesh);
    const car = new Car(mesh, p.x, p.z, p.heading);
    car.speed = 7 + this.rng() * 5;
    car.cruise = car.speed;
    this.cars.push(car);
    return car;
  }
  // Nearest road line to a coordinate.
  nearestRoad(v) {
    let best = CITY.roads[0];
    for (const r of CITY.roads) if (Math.abs(v - r) < Math.abs(v - best)) best = r;
    return best;
  }
  update(dt, obstacles) {
    for (const car of this.cars) {
      const fwd = car.forward();
      // Car ahead? brake.
      let target = car.cruise;
      for (const o of obstacles) {
        if (o === car) continue;
        const dx = o.pos.x - car.pos.x;
        const dz = o.pos.z - car.pos.z;
        const ahead = dx * fwd.x + dz * fwd.z;
        const side = Math.abs(dx * fwd.z - dz * fwd.x);
        if (ahead > 0 && ahead < 9 && side < 2.6) {
          target = Math.min(target, Math.max(0, o.speed - 1));
        }
      }
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      car.pos.addScaledVector(fwd, car.speed * dt);
      // Intersection: chance to turn.
      const nx = this.nearestRoad(car.pos.x);
      const nz = this.nearestRoad(car.pos.z);
      if (Math.abs(car.pos.x - nx) < 3.5 && Math.abs(car.pos.z - nz) < 3.5 && this.rng() < dt * 0.5) {
        const r = this.rng();
        const h = car.heading;
        if (r < 0.25) {
          // Turn left.
          car.heading = h - Math.PI / 2;
        } else if (r < 0.5) {
          // Turn right.
          car.heading = h + Math.PI / 2;
        }
        // Snap onto the lane of the new road.
        const nh = ((car.heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const isX = Math.abs(Math.sin(nh)) > 0.7; // moving along x
        if (isX) {
          const dir = Math.sin(nh) > 0 ? 1 : -1;
          car.pos.z = nz + (dir > 0 ? 3 : -3);
        } else {
          const dir = Math.cos(nh) > 0 ? 1 : -1;
          car.pos.x = nx + (dir > 0 ? -3 : 3);
        }
        car.heading = Math.round(car.heading / (Math.PI / 2)) * (Math.PI / 2);
      }
      // Wrap around the city edge.
      if (car.pos.x > 195) car.pos.x = -195;
      if (car.pos.x < -195) car.pos.x = 195;
      if (car.pos.z > 192) car.pos.z = -192;
      if (car.pos.z < -192) car.pos.z = 192;
      car.sync();
    }
  }
  remove(car) {
    this.scene.remove(car.mesh);
    this.cars = this.cars.filter((c) => c !== car);
  }
}

// Police pursuit: cars chase the player, flashing light bars.
export class Police {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.cars = [];
    this.flashT = 0;
  }
  spawnNear(x, z, count) {
    for (let i = 0; i < count; i++) {
      const ang = this.rng() * Math.PI * 2;
      const d = 60 + this.rng() * 25;
      const px = THREE.MathUtils.clamp(x + Math.cos(ang) * d, -185, 185);
      const pz = THREE.MathUtils.clamp(z + Math.sin(ang) * d, -185, 185);
      const mesh = makeCarMesh(0x111318, true);
      this.scene.add(mesh);
      const car = new Car(mesh, px, pz, Math.atan2(x - px, z - pz));
      car.speed = 14;
      car.maxSpeed = 21;
      car.hp = 60;
      this.cars.push(car);
    }
  }
  update(dt, playerPos, playerCar, onRam) {
    this.flashT += dt;
    const phase = Math.floor(this.flashT * 6) % 2 === 0;
    for (const car of this.cars) {
      // Steer toward the player.
      const want = Math.atan2(playerPos.x - car.pos.x, playerPos.z - car.pos.z);
      let diff = want - car.heading;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      car.heading += THREE.MathUtils.clamp(diff, -1.9 * dt, 1.9 * dt);
      const dist = car.pos.distanceTo(playerPos);
      car.speed = THREE.MathUtils.clamp(car.speed + (dist > 12 ? 6 * dt : -8 * dt), 6, car.maxSpeed);
      car.pos.addScaledVector(car.forward(), car.speed * dt);
      // Ram the player's car.
      if (playerCar && dist < 4.2) {
        onRam(car, dist);
      }
      car.sync();
      // Flash the light bar.
      const { barRed, barBlue } = car.mesh.userData;
      if (barRed && barBlue) {
        barRed.material.emissiveIntensity = phase ? 4 : 0.2;
        barBlue.material.emissiveIntensity = phase ? 0.2 : 4;
      }
    }
  }
  remove(car) {
    this.scene.remove(car.mesh);
    this.cars = this.cars.filter((c) => c !== car);
  }
  clear() {
    for (const c of [...this.cars]) this.remove(c);
  }
}
