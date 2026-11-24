// Neon Bay HUD: health bar, money, wanted stars, speed, mission panel,
// damage vignette, crosshair and the live minimap.
import { CITY } from './city.js';

export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.hpFill = $('hp-fill');
    this.hpText = $('hp-text');
    this.moneyEl = $('money');
    this.starsEl = $('stars');
    this.speedEl = $('speed');
    this.speedLabel = $('speed-label');
    this.missionTitle = $('mission-title');
    this.objectiveEl = $('objective');
    this.timerEl = $('timer');
    this.msgEl = $('msg');
    this.vignette = $('vignette');
    this.crosshair = $('crosshair');
    this.minimap = $('minimap');
    this.mm = this.minimap ? this.minimap.getContext('2d') : null;
    this.msgTimer = 0;
    this.flash = 0;
  }

  showMessage(text, dur = 3) {
    if (!this.msgEl) return;
    this.msgEl.textContent = text;
    this.msgEl.style.opacity = '1';
    this.msgTimer = dur;
  }

  flashDamage() {
    this.flash = 1;
  }

  update(dt, G) {
    const p = G.player;
    // health bar + colour (green -> amber -> red)
    const hpPct = Math.max(0, Math.min(100, p.hp));
    if (this.hpFill) {
      this.hpFill.style.width = hpPct + '%';
      this.hpFill.style.background = hpPct > 55 ? '#37d67a' : hpPct > 25 ? '#ffb020' : '#ff3b30';
    }
    if (this.hpText) this.hpText.textContent = Math.ceil(hpPct) + ' HP';
    if (this.moneyEl) this.moneyEl.textContent = '$' + Math.floor(p.money).toLocaleString('en-US');
    if (this.starsEl) {
      this.starsEl.textContent = '★'.repeat(p.wanted) + '☆'.repeat(5 - p.wanted);
      this.starsEl.style.color = p.wanted > 0 ? '#ffcf00' : '#666';
    }
    // speed readout
    if (this.speedEl) {
      if (p.onFoot) {
        this.speedEl.textContent = p.speed > 0.5 ? Math.round(p.speed * 3.6) : '0';
      } else {
        this.speedEl.textContent = Math.round(Math.abs(p.speed) * 3.6);
      }
    }
    if (this.speedLabel) this.speedLabel.textContent = p.onFoot ? 'ON FOOT' : 'KM/H';
    // mission panel
    const m = G.missions.current;
    if (this.missionTitle) this.missionTitle.textContent = m ? m.title : 'NEON BAY';
    if (this.objectiveEl) {
      this.objectiveEl.textContent = m
        ? m.objective
        : 'Free roam — steal a car, cause trouble, or start mission 1';
    }
    if (this.timerEl) {
      if (m && m.timer > 0) {
        this.timerEl.textContent = '⏱ ' + Math.max(0, Math.ceil(G.missions.timeLeft)) + 's';
        this.timerEl.style.color = G.missions.timeLeft < 15 ? '#ff5040' : '#ffe600';
      } else {
        this.timerEl.textContent = '';
      }
    }
    // crosshair only while on foot (shooting mode)
    if (this.crosshair) this.crosshair.style.display = p.onFoot ? 'block' : 'none';
    // message fade
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0 && this.msgEl) this.msgEl.style.opacity = '0';
    }
    // damage vignette fade
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.8);
    if (this.vignette) this.vignette.style.opacity = String(this.flash * 0.85);
    this.drawMinimap(G);
  }

  // 180x180 live map: roads, sea, mission marker, traffic, police, player.
  drawMinimap(G) {
    if (!this.mm) return;
    const ctx = this.mm;
    const S = 180;
    const scale = S / (CITY.boundX * 2 + 20);
    const toMap = (x, z) => [(x + CITY.boundX + 10) * scale, (z + CITY.boundZ + 10) * scale];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10, 16, 22, 0.85)';
    ctx.fillRect(0, 0, S, S);
    // sea along the south edge
    const [, seaY] = toMap(0, CITY.waterZ - 4);
    ctx.fillStyle = '#1e6f9e';
    ctx.fillRect(0, seaY, S, S - seaY);
    // roads
    ctx.strokeStyle = '#5a6470';
    ctx.lineWidth = 2;
    for (const r of CITY.roads) {
      const [x1, y1] = toMap(r, -CITY.boundZ - 10);
      const [x2, y2] = toMap(r, CITY.boundZ + 10);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const [hx1, hy1] = toMap(-CITY.boundX - 10, r);
      const [hx2, hy2] = toMap(CITY.boundX + 10, r);
      ctx.beginPath();
      ctx.moveTo(hx1, hy1);
      ctx.lineTo(hx2, hy2);
      ctx.stroke();
    }
    // mission marker (pulsing yellow)
    const m = G.missions.current;
    if (m) {
      const mp = G.missions.markerPos();
      const [mx, my] = toMap(mp.x, mp.z);
      const pulse = 4 + Math.sin(performance.now() * 0.006) * 1.6;
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // traffic dots (yellow)
    ctx.fillStyle = '#ffd23e';
    for (const car of G.traffic.cars) {
      const [cx, cy] = toMap(car.pos.x, car.pos.z);
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    // police dots (red)
    ctx.fillStyle = '#ff3b30';
    for (const car of G.police.cars) {
      const [cx, cy] = toMap(car.pos.x, car.pos.z);
      ctx.beginPath();
      ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // player arrow (white, rotated to heading)
    const p = G.player;
    const [px, py] = toMap(p.pos.x, p.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - p.heading); // map y grows with +z, so heading flips
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.4, 5);
    ctx.lineTo(-4.4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
