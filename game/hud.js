// Neon Bay — hud.js
// DOM HUD (health, money, wanted stars, speed, objective, messages) and a
// 2D canvas minimap of the city grid.
import { CITY } from './city.js';

export class HUD {
  constructor() {
    this.el = {
      hpFill: document.getElementById('hp-fill'),
      hpText: document.getElementById('hp-text'),
      money: document.getElementById('money'),
      stars: document.getElementById('stars'),
      speed: document.getElementById('speed'),
      speedLabel: document.getElementById('speed-label'),
      missionTitle: document.getElementById('mission-title'),
      objective: document.getElementById('objective'),
      timer: document.getElementById('timer'),
      msg: document.getElementById('msg'),
      vignette: document.getElementById('vignette'),
      crosshair: document.getElementById('crosshair'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.msgTimer = 0;
  }
  showMessage(text, dur) {
    this.el.msg.textContent = text;
    this.el.msg.style.opacity = '1';
    this.msgTimer = dur || 3;
  }
  flashDamage() {
    this.el.vignette.style.opacity = '0.85';
    setTimeout(() => {
      this.el.vignette.style.opacity = '0';
    }, 160);
  }
  update(dt, G) {
    const p = G.player;
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.el.msg.style.opacity = '0';
    }
    this.el.hpFill.style.width = `${Math.max(0, p.hp)}%`;
    this.el.hpFill.style.background = p.hp > 50 ? '#37d67a' : p.hp > 25 ? '#ffb020' : '#ff3b30';
    this.el.hpText.textContent = `${Math.ceil(Math.max(0, p.hp))}`;
    this.el.money.textContent = `$${p.money.toLocaleString('en-US')}`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < p.wanted ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.color = p.wanted > 0 ? '#ffd60a' : '#8a8f9a';
    if (p.onFoot) {
      this.el.speed.textContent = '';
      this.el.speedLabel.textContent = 'ON FOOT';
      this.el.crosshair.style.display = 'block';
    } else {
      const kmh = Math.round(Math.abs(p.speed) * 4.2);
      this.el.speed.textContent = `${kmh}`;
      this.el.speedLabel.textContent = 'KM/H';
      this.el.crosshair.style.display = 'none';
    }
    const m = G.missions.current;
    if (m) {
      this.el.missionTitle.textContent = m.title;
      this.el.objective.textContent = m.objective;
      this.el.timer.textContent = m.timer && G.missions.timeLeft > 0 ? `${Math.ceil(G.missions.timeLeft)}s` : '';
    } else {
      this.el.missionTitle.textContent = 'NEON BAY — Free Roam';
      this.el.objective.textContent = 'Story complete. Explore the city, or start over from the menu.';
      this.el.timer.textContent = '';
    }
    this.drawMinimap(G);
  }
  drawMinimap(G) {
    const ctx = this.mapCtx;
    const S = 180;
    const world = 400; // -200..200
    const toMap = (x, z) => [((x + 200) / world) * S, ((z + 200) / world) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(16,18,26,0.85)';
    ctx.fillRect(0, 0, S, S);
    // Roads.
    ctx.strokeStyle = '#5a606e';
    ctx.lineWidth = 3;
    for (const r of CITY.roads) {
      const [x1, y1] = toMap(r, -196);
      const [x2, y2] = toMap(r, 196);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const [x3, y3] = toMap(-196, r);
      const [x4, y4] = toMap(196, r);
      ctx.beginPath();
      ctx.moveTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.stroke();
    }
    // Water.
    ctx.fillStyle = '#0e5a7a';
    const [, wy] = toMap(0, CITY.waterZ - 8);
    ctx.fillRect(0, wy, S, S - wy);
    // Mission marker (pulsing).
    const mp = G.missions.markerPos();
    if (mp) {
      const [mx, my] = toMap(mp.x, mp.z);
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Traffic dots.
    ctx.fillStyle = '#f1c40f';
    for (const c of G.traffic.cars) {
      const [x, y] = toMap(c.pos.x, c.pos.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Police dots.
    ctx.fillStyle = '#ff3b30';
    for (const c of G.police.cars) {
      const [x, y] = toMap(c.pos.x, c.pos.z);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const p = G.player;
    const [px, py] = toMap(p.pos.x, p.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(p.heading), Math.cos(p.heading)) + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}
