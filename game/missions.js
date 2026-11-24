// Neon Bay — missions.js
// Story: Rex, a getaway driver for Marla Vane's Bay crew. Five short missions
// with a beacon marker, a timer where it matters, and a cash payout.
import * as THREE from 'three';

export const MISSIONS = [
  {
    id: 'hot-wheels',
    title: '1 — Hot Wheels',
    briefing: 'Marla needs wheels. Steal any car, then bring it to the garage marker.',
    objective: 'Steal a car and reach the garage',
    marker: { x: 52, z: -52 },
    payout: 250,
  },
  {
    id: 'bay-runner',
    title: '2 — Bay Runner',
    briefing: 'Package in the trunk. Get it to the docks in 90 seconds — no cops, no excuses.',
    objective: 'Deliver the package to the docks (90s)',
    marker: { x: 0, z: 168 },
    payout: 500,
    timer: 90,
  },
  {
    id: 'tail-job',
    title: '3 — Tail Job',
    briefing: 'A rival courier is running the same streets. Stay on his tail for 6 seconds.',
    objective: 'Stay within 15m of the target car for 6s',
    marker: null,
    payout: 600,
    tailTime: 6,
  },
  {
    id: 'heat-wave',
    title: '4 — Heat Wave',
    briefing: 'The heat is on. Lose the cops — get your wanted level to zero at the safehouse.',
    objective: 'Lose the cops at the safehouse',
    marker: { x: -104, z: 104 },
    payout: 500,
  },
  {
    id: 'neon-getaway',
    title: '5 — Neon Getaway',
    briefing: 'One last run, north through the whole city, with every cop in Neon Bay behind you.',
    objective: 'Reach the north gate with the cops on you',
    marker: { x: 0, z: -182 },
    payout: 1000,
  },
];

export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.idx = 0;
    this.timeLeft = 0;
    this.tailT = 0;
    this.done = false;
    this.targetCar = null;
    // Beacon: tall translucent pillar + pulsing ground ring.
    this.beacon = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    );
    pillar.position.y = 30;
    this.beacon.add(pillar);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 4.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    ring.name = 'ring';
    this.beacon.add(ring);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.setMission(0);
  }
  get current() {
    return MISSIONS[this.idx];
  }
  setMission(i) {
    this.idx = i;
    this.timeLeft = this.current?.timer ?? 0;
    this.tailT = 0;
    this.done = this.idx >= MISSIONS.length;
    const m = this.current;
    if (!m) {
      this.beacon.visible = false;
      return;
    }
    if (m.marker) {
      this.beacon.position.set(m.marker.x, 0, m.marker.z);
      this.beacon.visible = true;
    } else {
      this.beacon.visible = false;
    }
  }
  markerPos() {
    const m = this.current;
    if (!m) return null;
    if (m.id === 'tail-job' && this.targetCar) return this.targetCar.pos;
    return m.marker ? new THREE.Vector3(m.marker.x, 0, m.marker.z) : null;
  }
  // Returns 'complete' | 'failed' | null. ctx: {player, onCrime, addWanted, spawnTarget, removeTarget}
  update(dt, ctx) {
    const m = this.current;
    if (!m || this.done) return null;
    const p = ctx.player;
    // Beacon pulse.
    const ring = this.beacon.getObjectByName('ring');
    if (ring) {
      const s = 1 + Math.sin(performance.now() * 0.004) * 0.15;
      ring.scale.set(s, s, 1);
    }
    if (m.timer) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) return 'failed';
    }
    const at = (x, z, r) => Math.hypot(p.pos.x - x, p.pos.z - z) < r;
    if (m.id === 'hot-wheels') {
      if (!p.onFoot && at(m.marker.x, m.marker.z, 7)) return 'complete';
    } else if (m.id === 'bay-runner') {
      if (at(m.marker.x, m.marker.z, 7)) return 'complete';
    } else if (m.id === 'tail-job') {
      if (!this.targetCar) {
        this.targetCar = ctx.spawnTarget();
        if (this.targetCar) this.beacon.visible = true;
      }
      if (this.targetCar) {
        this.beacon.position.copy(this.targetCar.pos);
        const d = p.pos.distanceTo(this.targetCar.pos);
        if (d < 15) {
          this.tailT += dt;
          if (this.tailT >= m.tailTime) return 'complete';
        } else {
          this.tailT = Math.max(0, this.tailT - dt * 0.5);
        }
      }
    } else if (m.id === 'heat-wave') {
      if (at(m.marker.x, m.marker.z, 9)) {
        // Safehouse scrubs heat fast.
        p.wanted = Math.max(0, p.wanted - dt * 0.5);
        if (p.wanted <= 0) return 'complete';
      }
    } else if (m.id === 'neon-getaway') {
      if (at(m.marker.x, m.marker.z, 8)) return 'complete';
    }
    return null;
  }
  complete() {
    const m = this.current;
    const payout = m ? m.payout : 0;
    if (this.targetCar) {
      this.targetCar = null;
    }
    this.setMission(this.idx + 1);
    return payout;
  }
  fail() {
    // Retry the same mission with a fresh timer.
    this.setMission(this.idx);
  }
}
