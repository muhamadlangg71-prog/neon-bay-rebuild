// Neon Bay — player.js
// The player on foot and behind the wheel: movement, camera, entering and
// stealing cars, driving with arcade handling, collisions.
import * as THREE from 'three';
import { CITY, resolveBuildingCollision } from './city.js';
import { Car } from './vehicles.js';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 30);
    this.heading = 0; // facing direction on foot
    this.speed = 0;
    this.onFoot = true;
    this.car = null; // Car instance when driving
    this.hp = 100;
    this.money = 0;
    this.wanted = 0;
    this.camYaw = 0;
    this.camPitch = 0.42;
    this.camDist = 9;
    this.vy = 0;
    this.grounded = true;
    this.lastCrimeT = -999;
    this.mesh = this.buildFigure();
    scene.add(this.mesh);
  }
  buildFigure() {
    const g = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({ color: 0xff2d78, roughness: 0.7 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x1c2433, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 4, 10), jacket);
    body.position.y = 1.15;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), skin);
    head.position.y = 2.0;
    g.add(head);
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 1 })
    );
    hair.position.y = 2.06;
    g.add(hair);
    for (const sx of [-0.26, 0.26]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.75, 8), pants);
      leg.position.set(sx, 0.38, 0);
      g.add(leg);
    }
    // Simple gun in the right hand, visible when aiming.
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.14, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 })
    );
    gun.position.set(0.42, 1.25, 0.3);
    gun.name = 'gun';
    g.add(gun);
    return g;
  }
  // Move on foot. input: {f,b,l,r,run,jump}. Returns nothing.
  updateOnFoot(dt, input, buildings) {
    const run = input.run ? 7.5 : 4.2;
    let mx = 0;
    let mz = 0;
    if (input.f) mz += 1;
    if (input.b) mz -= 1;
    if (input.l) mx -= 1;
    if (input.r) mx += 1;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      // Camera-relative: forward is where the camera looks (camYaw).
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      const wx = mx * cos - mz * sin;
      const wz = mx * sin + mz * cos;
      this.pos.x += wx * run * dt;
      this.pos.z += wz * run * dt;
      this.heading = Math.atan2(wx, wz);
      this.speed = run;
    } else {
      this.speed = 0;
    }
    // Jump.
    if (input.jump && this.grounded) {
      this.vy = 6.5;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= 18 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }
    const fixed = resolveBuildingCollision(buildings, this.pos.x, this.pos.z, 0.6);
    this.pos.x = THREE.MathUtils.clamp(fixed.x, -CITY.boundX, CITY.boundX);
    this.pos.z = THREE.MathUtils.clamp(fixed.z, -CITY.boundZ, CITY.boundZ);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Walk bob.
    const bob = len > 0 ? Math.sin(performance.now() * 0.02) * 0.05 : 0;
    this.mesh.position.y = this.pos.y + Math.abs(bob);
  }
  // Drive the current car. input: {f,b,l,r}. Returns {crashed:boolean}.
  updateDriving(dt, input, buildings, cars) {
    const car = this.car;
    if (!car) return { crashed: false };
    const accel = input.f ? 14 : input.b ? -18 : 0;
    // Arcade integration: accelerate, brake, and roll to a stop.
    car.speed += accel * dt;
    car.speed -= Math.sign(car.speed) * 3.2 * dt * (input.f || input.b ? 0.25 : 1);
    if (Math.abs(car.speed) < 0.15 && !input.f && !input.b) car.speed = 0;
    car.speed = THREE.MathUtils.clamp(car.speed, -10, car.maxSpeed);
    const steer = (input.l ? 1 : 0) - (input.r ? 1 : 0);
    const steerAmount = steer * 1.9 * dt * THREE.MathUtils.clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed >= 0 ? 1 : -1);
    car.heading += steerAmount;
    const prev = car.pos.clone();
    car.pos.addScaledVector(car.forward(), car.speed * dt);
    const fixed = resolveBuildingCollision(buildings, car.pos.x, car.pos.z, 2.3);
    let crashed = false;
    if (fixed.x !== car.pos.x || fixed.z !== car.pos.z) {
      crashed = Math.abs(car.speed) > 6;
      car.pos.x = fixed.x;
      car.pos.z = fixed.z;
      car.speed *= 0.35;
    }
    car.pos.x = THREE.MathUtils.clamp(car.pos.x, -CITY.boundX, CITY.boundX);
    car.pos.z = THREE.MathUtils.clamp(car.pos.z, -CITY.boundZ, CITY.boundZ);
    // Car-car bumps: push apart, lose speed.
    for (const other of cars) {
      if (other === car) continue;
      const dx = car.pos.x - other.pos.x;
      const dz = car.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.6 && d > 0.001) {
        const push = (4.6 - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        car.pos.x += nx * push;
        car.pos.z += nz * push;
        other.pos.x -= nx * push;
        other.pos.z -= nz * push;
        if (Math.abs(car.speed) > 8) {
          crashed = true;
          car.speed *= 0.5;
          other.speed = Math.max(0, other.speed - 3);
        }
        other.sync();
      }
    }
    if (prev.distanceToSquared(car.pos) < 0.000001 && Math.abs(car.speed) > 0.5) {
      // Stuck against a wall: kill speed.
      car.speed *= 0.9;
    }
    car.sync();
    this.pos.copy(car.pos);
    this.heading = car.heading;
    this.speed = car.speed;
    return { crashed };
  }
  enterCar(car) {
    this.car = car;
    this.onFoot = false;
    this.mesh.visible = false;
    this.pos.copy(car.pos);
    this.heading = car.heading;
  }
  exitCar() {
    if (!this.car) return;
    const side = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    this.pos.copy(this.car.pos).addScaledVector(side, 3);
    this.pos.y = 0;
    this.car = null;
    this.onFoot = true;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
  }
  // Third-person camera. Returns nothing; moves the given camera.
  updateCamera(camera, dt, input) {
    if (input.lookDX || input.lookDY) {
      this.camYaw -= (input.lookDX || 0) * 0.0032;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + (input.lookDY || 0) * 0.0028, 0.08, 1.1);
      input.lookDX = 0;
      input.lookDY = 0;
    }
    const target = this.onFoot ? this.pos.clone().add(new THREE.Vector3(0, 1.7, 0)) : this.pos.clone().add(new THREE.Vector3(0, 2.0, 0));
    const dist = this.onFoot ? 8 : 11;
    const yaw = this.onFoot ? this.camYaw : this.heading + Math.PI;
    const cx = target.x + Math.sin(yaw) * Math.cos(this.camPitch) * dist;
    const cz = target.z + Math.cos(yaw) * Math.cos(this.camPitch) * dist;
    const cy = target.y + Math.sin(this.camPitch) * dist + (this.onFoot ? 0.6 : 1.2);
    const desired = new THREE.Vector3(cx, Math.max(cy, 1.2), cz);
    camera.position.lerp(desired, 1 - Math.pow(0.0001, dt));
    camera.lookAt(target);
  }
  reset(x, z) {
    this.pos.set(x, 0, z);
    this.heading = 0;
    this.hp = 100;
    this.wanted = 0;
    this.speed = 0;
    this.onFoot = true;
    this.car = null;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.camYaw = 0;
  }
}
