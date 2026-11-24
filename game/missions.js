// Neon Bay story missions: five jobs for Ray Delgado, the fixer who runs
// the docks. Each mission has a pulsing yellow beacon marking its target.
import * as THREE from 'three';

export const MISSIONS = [
  {
    id: 1,
    title: 'Hot Wheels',
    briefing: 'Ray needs wheels. Steal any car and bring it to the garage.',
    objective: 'Steal a car, then drive to the garage',
    marker: { x: 52, z: -52 },
    payout: 250,
    timer: 0,
  },
  {
    id: 2,
    title: 'Bay Runner',
    briefing: 'A package for the docks. Ninety seconds. Do not get cute.',
    objective: 'Deliver the package to the docks',
    marker: { x: 0, z: 168 },
    payout: 500,
    timer: 90,
  },
  {
    id: 3,
    title: 'Tail Job',
    briefing: 'Gold sedan, plate BAY-7. Stay on it. Do not spook it.',
    objective: 'Follow the gold car — stay within 15 m for 6 s',
    marker: { x: 0, z: 0 },
    payout: 600,
    timer: 0,
  },
  {
    id: 4,
    title: 'Heat Wave',
    briefing: 'The heat is on you. Cool off at the safehouse until it drops.',
    objective: 'Lose your wanted level at the safehouse',
    marker: { x: -104, z: 104 },
    payout: 500,
    timer: 0,
  },
  {
    id: 5,
    title: 'Neon Getaway',
    briefing: 'One last run. North gate. Do not stop for anything.',
    objective: 'Reach the north gate',
    marker: { x: 0, z: -182 },
    payout: 1000,
    timer: 0,
  },
];

export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.index = -1; // -1 = no mission active
    this.timeLeft = 0;
    this.tailTime = 0;
    this.targetCar = null;

    // beacon: tall translucent pillar + a pulsing ring on the ground
    this.beacon = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 34, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe600,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    pillar.position.y = 17;
    this.beacon.add(pillar);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.4, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffe600,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.08;
    this.beacon.add(this.ring);
    this.beacon.visible = false;
    scene.add(this.beacon);
  }

  get current() {
    return this.index >= 0 && this.index < MISSIONS.length ? MISSIONS[this.index] : null;
  }

  setMission(i) {
    this.index = i;
    this.tailTime = 0;
    const m = this.current;
    this.timeLeft = m && m.timer ? m.timer : 0;
    if (m) {
      this.beacon.visible = true;
      const mp = this.markerPos();
      this.beacon.position.set(mp.x, 0, mp.z);
    } else {
      this.beacon.visible = false;
    }
    return m;
  }

  // Where the beacon (and the minimap marker) points right now. For the tail
  // job it follows the gold target car.
  markerPos() {
    const m = this.current;
    if (!m) return { x: 0, z: 0 };
    if (m.id === 3 && this.targetCar) {
      return { x: this.targetCar.pos.x, z: this.targetCar.pos.z };
    }
    return { x: m.marker.x, z: m.marker.z };
  }

  // ctx: { player, spawnTarget } — spawnTarget creates the gold tail car.
  // Returns 'complete', 'failed' or null.
  update(dt, ctx) {
    const m = this.current;
    if (!m) return null;
    const p = ctx.player;
    const mp = this.markerPos();
    this.beacon.position.set(mp.x, 0, mp.z);
    const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.22;
    this.ring.scale.set(pulse, pulse, 1);

    if (m.timer > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) return 'failed';
    }

    const distToMarker = Math.hypot(p.pos.x - mp.x, p.pos.z - mp.z);

    if (m.id === 1) {
      // Hot Wheels: reach the garage while inside a stolen car
      if (!p.onFoot && distToMarker < 7) return 'complete';
    } else if (m.id === 2) {
      if (distToMarker < 7) return 'complete';
    } else if (m.id === 3) {
      if (!this.targetCar && ctx.spawnTarget) this.targetCar = ctx.spawnTarget();
      if (this.targetCar) {
        const d = Math.hypot(p.pos.x - this.targetCar.pos.x, p.pos.z - this.targetCar.pos.z);
        if (d < 15) {
          this.tailTime += dt;
          if (this.tailTime >= 6) return 'complete';
        } else {
          this.tailTime = Math.max(0, this.tailTime - dt * 0.5);
        }
      }
    } else if (m.id === 4) {
      // Heat Wave: inside the safehouse radius the wanted level cools fast
      if (distToMarker < 10 && p.wanted > 0) {
        p.wanted = Math.max(0, p.wanted - 0.5 * dt);
      }
      if (p.wanted <= 0) return 'complete';
    } else if (m.id === 5) {
      if (distToMarker < 9) return 'complete';
    }
    return null;
  }

  // Mission done: pay out and advance to the next one (or finish the story).
  complete() {
    const m = this.current;
    if (!m) return 0;
    const payout = m.payout;
    this.setMission(this.index + 1 >= MISSIONS.length ? -1 : this.index + 1);
    return payout;
  }

  // Mission failed: restart the same job.
  fail() {
    this.setMission(this.index);
  }
}
