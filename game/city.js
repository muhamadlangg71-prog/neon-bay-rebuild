// Neon Bay city: procedural grid town with a beach, towers, street lights,
// palms and a dock. Everything is seeded so the city is identical every run.
import * as THREE from 'three';

// Small deterministic PRNG (mulberry32) so the city never changes between runs.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CITY = {
  pitch: 52, // distance between neighbouring road centrelines
  roadW: 12, // road width
  block: 40, // block size between roads
  roads: [-156, -104, -52, 0, 52, 104, 156],
  boundX: 190, // drivable half-width
  boundZ: 185, // drivable half-depth (north edge)
  waterZ: 196, // sea starts here (south edge)
};

// Make a canvas texture that looks like a lit office facade. Three variants
// are generated; some windows glow warm yellow, the rest stay dark.
function makeFacadeTexture(rng, variant) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const base = ['#2b3242', '#33302e', '#26303a'][variant % 3];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 14;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng() < 0.42;
      const x = 6 + c * 20;
      const y = 8 + r * 17;
      if (lit) {
        ctx.fillStyle = rng() < 0.7 ? '#ffd76a' : '#9fd8ff';
      } else {
        ctx.fillStyle = '#10141c';
      }
      ctx.fillRect(x, y, 13, 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene) {
  const rng = mulberry32(1337);
  const group = new THREE.Group();
  const buildings = [];
  const B = CITY.boundX;

  // --- ground -----------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(B * 2 + 60, CITY.boundZ * 2 + 90),
    new THREE.MeshLambertMaterial({ color: 0x232a24 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 4);
  group.add(ground);

  // --- roads ------------------------------------------------------------------
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x1b1e24 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c95a });
  const roadLen = B * 2 + 40;
  for (const r of CITY.roads) {
    // east-west strip
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, CITY.roadW), roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.02, r);
    group.add(ew);
    const ewLine = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, 0.35), lineMat);
    ewLine.rotation.x = -Math.PI / 2;
    ewLine.position.set(0, 0.04, r);
    group.add(ewLine);
    // north-south strip
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadW, roadLen), roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(r, 0.02, 0);
    group.add(ns);
    const nsLine = new THREE.Mesh(new THREE.PlaneGeometry(0.35, roadLen), lineMat);
    nsLine.rotation.x = -Math.PI / 2;
    nsLine.position.set(r, 0.04, 0);
    group.add(nsLine);
  }

  // --- beach + sea (south edge) -----------------------------------------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(B * 2 + 60, 12),
    new THREE.MeshLambertMaterial({ color: 0xc9b078 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, CITY.waterZ - 2);
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(B * 2 + 60, 60),
    new THREE.MeshLambertMaterial({ color: 0x1e6f9e })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, CITY.waterZ + 28);
  group.add(sea);

  // --- buildings ---------------------------------------------------------------
  const facades = [0, 1, 2].map((v) => makeFacadeTexture(mulberry32(900 + v * 7), v));
  const neonColors = [0xff2fd6, 0x00e5ff, 0xffe600, 0x7cff00, 0xff6a00];
  const blockCenters = [-130, -78, -26, 26, 78, 130];
  for (const cx of blockCenters) {
    for (const cz of blockCenters) {
      const count = 1 + Math.floor(rng() * 3); // 1-3 towers per block
      for (let i = 0; i < count; i++) {
        const w = 12 + rng() * 12;
        const d = 12 + rng() * 12;
        const h = 9 + rng() * 38; // 9..47
        const ox = (rng() - 0.5) * (CITY.block - w - 4);
        const oz = (rng() - 0.5) * (CITY.block - d - 4);
        const x = cx + ox;
        const z = cz + oz;
        const tex = facades[Math.floor(rng() * facades.length)];
        const mat = new THREE.MeshLambertMaterial({
          map: tex,
          emissive: 0xffffff,
          emissiveMap: tex,
          emissiveIntensity: 0.55,
        });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(x, h / 2, z);
        group.add(tower);
        // neon strip on the roof of tall towers
        if (h > 30) {
          const strip = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.6, 0.7, d + 0.6),
            new THREE.MeshBasicMaterial({ color: neonColors[Math.floor(rng() * neonColors.length)] })
          );
          strip.position.set(x, h + 0.3, z);
          group.add(strip);
          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.9, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff3344 })
          );
          beacon.position.set(x, h + 1.4, z);
          group.add(beacon);
        }
        buildings.push({
          minX: x - w / 2,
          maxX: x + w / 2,
          minZ: z - d / 2,
          maxZ: z + d / 2,
        });
      }
    }
  }

  // --- street lights at every intersection ------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const rx of CITY.roads) {
    for (const rz of CITY.roads) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
      pole.position.set(rx + 6.5, 3.5, rz + 6.5);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), lampMat);
      head.position.set(rx + 6.5, 7.1, rz + 6.5);
      group.add(head);
    }
  }

  // --- palm trees along the sidewalks ------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e4f });
  for (let i = 0; i < 90; i++) {
    const road = CITY.roads[Math.floor(rng() * CITY.roads.length)];
    const along = (rng() * 2 - 1) * (B - 12);
    const side = rng() < 0.5 ? -1 : 1;
    const px = rng() < 0.5 ? road + side * 8.5 : along;
    const pz = rng() < 0.5 ? along : road + side * 8.5;
    if (insideBuilding(buildings, px, pz, 1)) continue;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5, 6), trunkMat);
    trunk.position.set(px, 2.5, pz);
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.6, 7), leafMat);
    crown.position.set(px, 6, pz);
    group.add(crown);
  }

  // --- crates on the dock (south, near the Bay Runner drop-off) ----------------
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6b3a });
  const crateSpots = [
    [-8, 172, 2.4], [8, 172, 2.4], [-8, 176, 2.0], [12, 176, 2.0], [0, 178, 2.6],
  ];
  for (const [cx, cz, s] of crateSpots) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    crate.position.set(cx, s / 2, cz);
    group.add(crate);
    buildings.push({ minX: cx - s / 2, maxX: cx + s / 2, minZ: cz - s / 2, maxZ: cz + s / 2 });
  }

  scene.add(group);
  return { group, buildings };
}

// True when (x,z) lies inside any building AABB expanded by pad.
export function insideBuilding(buildings, x, z, pad = 0) {
  for (const b of buildings) {
    if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
  }
  return false;
}

// Push a circle of radius r out of every building AABB it overlaps, including
// the case where the centre is inside the box (push out along the smallest
// penetration axis). Returns the corrected position and whether a hit happened.
export function resolveBuildingCollision(buildings, x, z, r) {
  let hit = false;
  for (const b of buildings) {
    const minX = b.minX - r;
    const maxX = b.maxX + r;
    const minZ = b.minZ - r;
    const maxZ = b.maxZ + r;
    if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) continue;
    hit = true;
    const dxl = x - minX;
    const dxr = maxX - x;
    const dzl = z - minZ;
    const dzr = maxZ - z;
    const m = Math.min(dxl, dxr, dzl, dzr);
    if (m === dxl) x = minX;
    else if (m === dxr) x = maxX;
    else if (m === dzl) z = minZ;
    else z = maxZ;
  }
  return { x, z, hit };
}
