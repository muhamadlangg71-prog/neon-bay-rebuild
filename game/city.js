// Neon Bay — city.js
// Procedural sun-soaked coastal city: road grid, buildings with lit windows,
// streetlights, palms, beach and bay. All geometry is generated here.
import * as THREE from 'three';

// Seeded RNG so the city is identical on every load.
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
  pitch: 52, // road centre to road centre
  roadW: 12,
  block: 40,
  roads: [-156, -104, -52, 0, 52, 104, 156],
  boundX: 190,
  boundZ: 185,
  waterZ: 196,
};

const PALETTE = [0x6b7fa3, 0x8a6b9e, 0x5e8a7a, 0xa3705e, 0x7a6a8f, 0x4f6b8a, 0x9e8a5e, 0x5e7a8a];

function makeWindowTexture(rng, base) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Facade shading.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // Windows: some lit warm, some dark.
  for (let y = 10; y < 246; y += 18) {
    for (let x = 10; x < 118; x += 18) {
      const lit = rng() < 0.45;
      g.fillStyle = lit ? '#ffd27a' : '#1c2433';
      g.fillRect(x, y, 11, 13);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene) {
  const rng = mulberry32(1337);
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);
  const buildings = []; // AABBs {minX,maxX,minZ,maxZ}

  // Ground: big concrete slab.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshStandardMaterial({ color: 0x33363f, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 10);
  group.add(ground);

  // Roads: dark strips along every grid line.
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x1e2027, roughness: 1 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0x8a8f9a, roughness: 1 });
  for (const c of CITY.roads) {
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(392, CITY.roadW), roadMat);
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0.02, c);
    group.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadW, 392), roadMat);
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(c, 0.02, 0);
    group.add(rz);
    // Centre lines.
    const lx = new THREE.Mesh(new THREE.BoxGeometry(392, 0.05, 0.35), lineMat);
    lx.position.set(0, 0.04, c);
    group.add(lx);
    const lz = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 392), lineMat);
    lz.position.set(c, 0.04, 0);
    group.add(lz);
  }

  // Beach + bay to the south.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 26),
    new THREE.MeshStandardMaterial({ color: 0xc2a878, roughness: 1 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, 192);
  group.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 150),
    new THREE.MeshStandardMaterial({ color: 0x0e5a7a, roughness: 0.35, metalness: 0.1 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.02, 280);
  group.add(water);

  // Buildings: 1–3 per block, window textures shared across 3 variants.
  const texes = [
    makeWindowTexture(mulberry32(11), '#5a6a85'),
    makeWindowTexture(mulberry32(22), '#6a5a7a'),
    makeWindowTexture(mulberry32(33), '#4a6a62'),
  ];
  const mats = texes.map(
    (t) =>
      new THREE.MeshStandardMaterial({
        map: t,
        emissiveMap: t,
        emissive: 0xffca7a,
        emissiveIntensity: 0.55,
        roughness: 0.9,
      })
  );
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  for (let bi = 0; bi < 6; bi++) {
    for (let bj = 0; bj < 6; bj++) {
      const cx = -130 + bi * CITY.pitch;
      const cz = -130 + bj * CITY.pitch;
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const w = 12 + rng() * 14;
        const d = 12 + rng() * 14;
        const h = 9 + rng() * rng() * 38;
        const ox = (rng() - 0.5) * (CITY.block - w - 4);
        const oz = (rng() - 0.5) * (CITY.block - d - 4);
        const x = cx + ox;
        const z = cz + oz;
        const m = new THREE.Mesh(boxGeo, mats[Math.floor(rng() * mats.length)]);
        m.scale.set(w, h, d);
        m.position.set(x, 0, z);
        group.add(m);
        buildings.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        // Rooftop neon strip on tall towers.
        if (h > 30) {
          const strip = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4),
            new THREE.MeshStandardMaterial({
              color: 0x111111,
              emissive: [0x00e5ff, 0xff2d78, 0xffe600][Math.floor(rng() * 3)],
              emissiveIntensity: 2.2,
            })
          );
          strip.position.set(x, h + 0.2, z);
          group.add(strip);
        }
      }
    }
  }

  // Streetlights at intersections.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.8 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd9a0, emissiveIntensity: 2.5 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const headGeo = new THREE.BoxGeometry(1.4, 0.25, 0.5);
  for (const cx of CITY.roads) {
    for (const cz of CITY.roads) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(cx + 7, 3.5, cz + 7);
      group.add(pole);
      const head = new THREE.Mesh(headGeo, lampMat);
      head.position.set(cx + 7, 7, cz + 7);
      group.add(head);
    }
  }

  // Palms along sidewalks.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 4.5, 6);
  const leafGeo = new THREE.ConeGeometry(2.2, 3.2, 7);
  for (let i = 0; i < 46; i++) {
    const road = CITY.roads[Math.floor(rng() * CITY.roads.length)];
    const along = -180 + rng() * 360;
    const side = rng() < 0.5 ? -1 : 1;
    const x = rng() < 0.5 ? road + side * 8.5 : along;
    const z = rng() < 0.5 ? along : road + side * 8.5;
    if (Math.abs(x) > 185 || Math.abs(z) > 185 || z > 180) continue;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 2.25, z);
    group.add(trunk);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(x, 5.6, z);
    group.add(leaf);
  }

  // A few parked props: crates near the docks.
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1 });
  for (let i = 0; i < 10; i++) {
    const crate = new THREE.Mesh(boxGeo, crateMat);
    crate.scale.set(1.6, 1.6, 1.6);
    crate.position.set(-40 + rng() * 80, 0, 168 + rng() * 10);
    crate.rotation.y = rng() * Math.PI;
    group.add(crate);
  }

  return { group, buildings };
}

// Point-in-building test (for collisions and spawning).
export function insideBuilding(buildings, x, z, pad) {
  for (const b of buildings) {
    if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return b;
  }
  return null;
}

// Push a circle (x,z,r) out of buildings; returns corrected {x,z}.
export function resolveBuildingCollision(buildings, x, z, r) {
  for (const b of buildings) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = x - b.minX;
        const pr = b.maxX - x;
        const pt = z - b.minZ;
        const pb = b.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.minX - r;
        else if (m === pr) x = b.maxX + r;
        else if (m === pt) z = b.minZ - r;
        else z = b.maxZ + r;
      }
    }
  }
  return { x, z };
}
