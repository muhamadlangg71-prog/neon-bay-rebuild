// Neon Bay player: one character who walks the sidewalks and drives any car
// they can get into. Handles on-foot movement, driving physics, the chase
// camera and getting in and out of cars.
import * as THREE from 'three';
import { CITY, resolveBuildingCollision } from './city.js';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 26);
    this.heading = 0;
    this.speed = 0;
    this.onFoot = true;
    this.car = null;
    this.hp = 100;
    this.money = 0;
    this.wanted = 0;
    this.camYaw = Math.PI;
    this.camPitch = 0.42;
    this.vy = 0;
    this.grounded = true;

    // simple figure: capsule body, head, and a pistol in the right hand
    this.mesh = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0xffd23e });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2a3550 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.85, 4, 10), jacket);
    body.position.y = 1.05;
    this.mesh.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), skin);
    head.position.y = 1.95;
    this.mesh.add(head);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.35), pants);
    legs.position.y = 0.35;
    this.mesh.add(legs);
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.14, 0.55),
      new THREE.MeshLambertMaterial({ color: 0x181818 })
    );
    gun.position.set(0.48, 1.15, 0.3);
    this.mesh.add(gun);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  // Forward direction the camera faces (W walks this way).
  camForward() {
    return new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
  }

  camRight() {
    return new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
  }

  updateOnFoot(dt, input, buildings) {
    const fwd = this.camForward();
    const right = this.camRight();
    const move = new THREE.Vector3();
    if (input.f) move.add(fwd);
    if (input.b) move.sub(fwd);
    if (input.r) move.add(right);
    if (input.l) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize();
      const run = input.run ? 7.5 : 4.2;
      this.pos.x += move.x * run * dt;
      this.pos.z += move.z * run * dt;
      this.heading = Math.atan2(move.x, move.z);
      this.speed = run;
    } else {
      this.speed = 0;
    }

    // jump + gravity
    if (input.jump && this.grounded) {
      this.vy = 8.5;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }

    // building collision (radius 0.6) and city bounds
    const fixed = resolveBuildingCollision(buildings, this.pos.x, this.pos.z, 0.6);
    this.pos.x = fixed.x;
    this.pos.z = fixed.z;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -CITY.boundX, CITY.boundX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -CITY.boundZ, CITY.boundZ);

    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  // Returns { crashed: boolean } — crashed is true when the car hit a building
  // or another car hard enough to matter.
  updateDriving(dt, input, buildings, cars) {
    const car = this.car;
    let crashed = false;
    if (input.f) car.speed += 14 * dt;
    if (input.b) car.speed -= 18 * dt;
    // drag + rolling resistance
    car.speed -= car.speed * 0.55 * dt;
    car.speed = THREE.MathUtils.clamp(car.speed, -9, car.maxSpeed);

    // steering scales with speed so the car cannot spin on the spot
    const steerScale = THREE.MathUtils.clamp(car.speed / 8, -1, 1);
    if (input.l) car.heading += 1.9 * dt * steerScale;
    if (input.r) car.heading -= 1.9 * dt * steerScale;

    const fwd = car.forward();
    car.pos.x += fwd.x * car.speed * dt;
    car.pos.z += fwd.z * car.speed * dt;

    // building collision (radius 2.3): bounce off and lose speed
    const fixed = resolveBuildingCollision(buildings, car.pos.x, car.pos.z, 2.3);
    if (fixed.hit) {
      if (Math.abs(car.speed) > 6) crashed = true;
      car.speed *= -0.35;
      car.pos.x = fixed.x;
      car.pos.z = fixed.z;
    }
    car.pos.x = THREE.MathUtils.clamp(car.pos.x, -CITY.boundX, CITY.boundX);
    car.pos.z = THREE.MathUtils.clamp(car.pos.z, -CITY.boundZ, CITY.boundZ);

    // car-to-car bumps: push apart and bleed speed
    for (const other of cars) {
      if (other === car) continue;
      const dx = car.pos.x - other.pos.x;
      const dz = car.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.4 && d > 0.01) {
        const push = (4.4 - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        car.pos.x += nx * push;
        car.pos.z += nz * push;
        other.pos.x -= nx * push;
        other.pos.z -= nz * push;
        if (Math.abs(car.speed) > 9) crashed = true;
        other.speed *= 0.6;
        car.speed *= 0.7;
      }
    }

    this.pos.copy(car.pos);
    this.heading = car.heading;
    this.speed = car.speed;
    this.mesh.visible = false;
    car.sync();
    return { crashed };
  }

  enterCar(car) {
    this.car = car;
    this.onFoot = false;
    this.pos.copy(car.pos);
    this.heading = car.heading;
    this.mesh.visible = false;
  }

  exitCar() {
    if (!this.car) return;
    // step out on the car's left side (+3 units across)
    const side = new THREE.Vector3(Math.cos(this.car.heading), 0, -Math.sin(this.car.heading));
    this.pos.set(this.car.pos.x + side.x * 3, 0, this.car.pos.z + side.z * 3);
    this.car.speed = 0;
    this.car = null;
    this.onFoot = true;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
  }

  updateCamera(camera, dt, input) {
    if (this.onFoot) {
      // orbit camera: mouse drag / pointer lock feeds camYaw + camPitch
      if (input.lookDX) {
        this.camYaw -= input.lookDX * 0.0032;
        input.lookDX = 0;
      }
      if (input.lookDY) {
        this.camPitch = THREE.MathUtils.clamp(this.camPitch + input.lookDY * 0.0026, 0.08, 1.25);
        input.lookDY = 0;
      }
      const dist = 7.5;
      const cp = Math.cos(this.camPitch);
      camera.position.set(
        this.pos.x + Math.sin(this.camYaw) * cp * dist,
        this.pos.y + 1.6 + Math.sin(this.camPitch) * dist,
        this.pos.z + Math.cos(this.camYaw) * cp * dist
      );
      camera.lookAt(this.pos.x, this.pos.y + 1.6, this.pos.z);
    } else {
      // chase camera: settle behind the car
      const wantYaw = this.heading + Math.PI;
      let dy = wantYaw - this.camYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.camYaw += dy * Math.min(1, dt * 4.5);
      const dist = 11;
      const height = 4.6;
      camera.position.set(
        this.pos.x + Math.sin(this.camYaw) * dist,
        height,
        this.pos.z + Math.cos(this.camYaw) * dist
      );
      camera.lookAt(this.pos.x, 1.4, this.pos.z);
    }
  }

  reset(x, z) {
    this.pos.set(x, 0, z);
    this.heading = 0;
    this.speed = 0;
    this.hp = 100;
    this.vy = 0;
    this.grounded = true;
    if (this.car) {
      this.car = null;
      this.onFoot = true;
    }
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
  }
}
