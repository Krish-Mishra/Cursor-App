(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");

  const LANES = [-1, 0, 1];
  const LANE_GAP = 1.7;
  const PLAYER_Z = 5.5;
  const SPAWN_Z = 78;
  const GRAVITY = 42;
  const JUMP_V = 14.5;
  const BEST_KEY = "cube-runner-best";

  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = String(Math.floor(best));

  const state = {
    running: false,
    dead: false,
    t: 0,
    score: 0,
    speed: 20,
    lane: 0,
    laneX: 0,
    y: 0,
    vy: 0,
    obstacles: [],
    spawnIn: 0.7,
    shake: 0,
    last: 0,
  };

  const held = new Set();
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function laneWorldX(lane) {
    return lane * LANE_GAP;
  }

  function project(x, y, z) {
    const t = Math.max(0, Math.min(1, (z - 2.2) / (SPAWN_Z - 2.2)));
    const depth = t * t * (3 - 2 * t);
    const groundY = height * (0.84 - depth * 0.5);
    const px = (1 - depth) * Math.min(width, height) * 0.092 + depth * 11;
    return {
      x: width / 2 + x * px,
      y: groundY - y * px,
      scale: px / 70,
    };
  }

  function showMenu(title, subtitle) {
    overlay.innerHTML = `
      <h1>${title}</h1>
      <p>${subtitle}</p>
      <ul>
        <li><kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd> change lanes</li>
        <li><kbd>Space</kbd> / <kbd>↑</kbd> jump · tap the screen to jump</li>
        <li>Swipe left or right to switch lanes</li>
      </ul>
      <button id="startBtn" type="button">${state.dead ? "Run again" : "Start run"}</button>
    `;
    overlay.classList.add("visible");
    bindStart(document.getElementById("startBtn"));
  }

  function bindStart(btn) {
    if (!btn) return;
    const start = (e) => {
      e.preventDefault();
      e.stopPropagation();
      reset();
    };
    btn.addEventListener("click", start);
    btn.addEventListener("pointerdown", start);
  }

  function reset() {
    state.running = true;
    state.dead = false;
    state.t = 0;
    state.score = 0;
    state.speed = 20;
    state.lane = 0;
    state.laneX = 0;
    state.y = 0;
    state.vy = 0;
    state.obstacles = [];
    state.spawnIn = 0.85;
    state.shake = 0;
    state.last = performance.now();
    overlay.classList.remove("visible");
    scoreEl.textContent = "0";
  }

  function spawnRow() {
    const roll = Math.random();
    const occupied = new Set();
    if (roll < 0.5) {
      occupied.add(LANES[(Math.random() * 3) | 0]);
    } else if (roll < 0.88) {
      const skip = LANES[(Math.random() * 3) | 0];
      LANES.forEach((lane) => {
        if (lane !== skip) occupied.add(lane);
      });
    } else {
      occupied.add(LANES[(Math.random() * 3) | 0]);
    }

    occupied.forEach((lane) => {
      const tall = Math.random() < 0.38;
      state.obstacles.push({
        lane,
        z: SPAWN_Z,
        h: tall ? 1.85 : 0.85,
        w: 1.2,
        d: 1.15,
        kind: tall ? "wall" : "block",
      });
    });
  }

  function moveLane(dir) {
    if (!state.running) return;
    state.lane = Math.max(-1, Math.min(1, state.lane + dir));
  }

  function jump() {
    if (!state.running || state.y > 0.12) return;
    state.vy = JUMP_V;
  }

  function die() {
    state.running = false;
    state.dead = true;
    state.shake = 16;
    if (state.score > best) {
      best = Math.floor(state.score);
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = String(best);
    }
    showMenu("WIPED OUT", `Score ${Math.floor(state.score)} · Best ${Math.floor(best)}`);
  }

  function update(dt) {
    if (!state.running) {
      state.shake *= Math.max(0, 1 - dt * 6);
      return;
    }

    state.t += dt;
    state.speed = 20 + Math.min(30, state.t * 0.9);
    state.score += dt * state.speed * 0.4;
    scoreEl.textContent = String(Math.floor(state.score));

    const targetX = laneWorldX(state.lane);
    state.laneX += (targetX - state.laneX) * Math.min(1, dt * 16);

    state.vy -= GRAVITY * dt;
    state.y += state.vy * dt;
    if (state.y < 0) {
      state.y = 0;
      state.vy = 0;
    }

    state.spawnIn -= dt;
    if (state.spawnIn <= 0) {
      spawnRow();
      state.spawnIn = Math.max(0.5, 1.2 - state.t * 0.018);
    }

    for (const ob of state.obstacles) ob.z -= state.speed * dt;
    state.obstacles = state.obstacles.filter((ob) => ob.z > -1.4);

    for (const ob of state.obstacles) {
      const sameLane = Math.abs(state.laneX - laneWorldX(ob.lane)) < 0.78;
      const near = ob.z < PLAYER_Z + 0.55 && ob.z + ob.d > PLAYER_Z - 0.35;
      const needsJump = ob.kind === "block";
      const cleared = needsJump ? state.y > ob.h * 0.7 : false;
      if (sameLane && near && !cleared) {
        die();
        break;
      }
    }
  }

  function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#081226");
    sky.addColorStop(0.42, "#102445");
    sky.addColorStop(1, "#071018");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width / 2, height * 0.3, 20, width / 2, height * 0.3, width * 0.55);
    glow.addColorStop(0, "rgba(80, 210, 255, 0.16)");
    glow.addColorStop(1, "rgba(80, 210, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  function drawTrack() {
    const farL = project(-3.15, 0, SPAWN_Z);
    const farR = project(3.15, 0, SPAWN_Z);
    const nearL = project(-3.15, 0, 2.4);
    const nearR = project(3.15, 0, 2.4);

    ctx.beginPath();
    ctx.moveTo(farL.x, farL.y);
    ctx.lineTo(farR.x, farR.y);
    ctx.lineTo(nearR.x, nearR.y);
    ctx.lineTo(nearL.x, nearL.y);
    ctx.closePath();
    const road = ctx.createLinearGradient(0, farL.y, 0, nearL.y);
    road.addColorStop(0, "#162544");
    road.addColorStop(1, "#2a436e");
    ctx.fillStyle = road;
    ctx.fill();

    LANES.forEach((lane) => {
      const a = project(laneWorldX(lane) - 0.78, 0, SPAWN_Z);
      const b = project(laneWorldX(lane) + 0.78, 0, SPAWN_Z);
      const c = project(laneWorldX(lane) + 0.78, 0, 2.4);
      const d = project(laneWorldX(lane) - 0.78, 0, 2.4);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fillStyle = lane === 0 ? "rgba(92, 225, 255, 0.08)" : "rgba(255,255,255,0.03)";
      ctx.fill();
    });

    ctx.lineWidth = 2;
    for (let z = 3; z < SPAWN_Z; z += 5.5) {
      const left = project(-3.15, 0, z);
      const right = project(3.15, 0, z);
      ctx.strokeStyle = `rgba(120, 210, 255, ${Math.max(0.06, 0.32 - z / 180)})`;
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    }
  }

  function fillFace(pts, color) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function towardHorizon(pt, amount) {
    return {
      x: pt.x + (width / 2 - pt.x) * amount,
      y: pt.y + (height * 0.34 - pt.y) * amount,
    };
  }

  function drawBox(x, y, z, w, h, d, palette) {
    const p = (ox, oy, oz) => project(x + ox, y + oy, z + oz);
    const squeeze = Math.min(0.28, 1.35 / Math.max(z, 2.5));
    const nbl = p(-w / 2, 0, 0);
    const nbr = p(w / 2, 0, 0);
    const ntr = p(w / 2, h, 0);
    const ntl = p(-w / 2, h, 0);
    const fbl = towardHorizon(p(-w / 2, 0, d), squeeze);
    const fbr = towardHorizon(p(w / 2, 0, d), squeeze);
    const ftr = towardHorizon(p(w / 2, h, d), squeeze);
    const ftl = towardHorizon(p(-w / 2, h, d), squeeze);

    fillFace([fbl, fbr, ftr, ftl], palette.far);
    if (x >= 0) fillFace([nbl, fbl, ftl, ntl], palette.side);
    else fillFace([nbr, fbr, ftr, ntr], palette.side);
    fillFace([ntl, ntr, ftr, ftl], palette.top);
    fillFace([nbl, nbr, ntr, ntl], palette.front);

    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = Math.max(1, 1.6 * nbl.scale);
    ctx.beginPath();
    ctx.moveTo(ntl.x, ntl.y);
    ctx.lineTo(ntr.x, ntr.y);
    ctx.lineTo(nbr.x, nbr.y);
    ctx.lineTo(nbl.x, nbl.y);
    ctx.closePath();
    ctx.stroke();
  }

  function drawWorld() {
    const shakeX = (Math.random() - 0.5) * state.shake;
    const shakeY = (Math.random() - 0.5) * state.shake;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawSky();
    drawTrack();

    const drawables = state.obstacles
      .map((ob) => ({ type: "ob", z: ob.z, ob }))
      .concat([{ type: "player", z: PLAYER_Z }]);
    drawables.sort((a, b) => b.z - a.z);

    for (const item of drawables) {
      if (item.type === "player") {
        const shadow = project(state.laneX, 0, PLAYER_Z);
        ctx.fillStyle = "rgba(0,0,0,0.32)";
        ctx.beginPath();
        ctx.ellipse(shadow.x, shadow.y + 4, 22 * Math.max(0.4, shadow.scale * 3.2), 8 * Math.max(0.3, shadow.scale * 2.2), 0, 0, Math.PI * 2);
        ctx.fill();
        drawBox(state.laneX, state.y, PLAYER_Z, 1.15, 1.15, 1.15, {
          front: "#5ce1ff",
          side: "#2aa7c9",
          top: "#d7fbff",
          far: "#1e7c96",
          edge: "#f4ffff",
        });
      } else {
        const wall = item.ob.kind === "wall";
        drawBox(laneWorldX(item.ob.lane), 0, item.ob.z, item.ob.w, item.ob.h, item.ob.d, {
          front: wall ? "#ff6b8a" : "#ffb347",
          side: wall ? "#c44566" : "#d4892a",
          top: wall ? "#ffb0c0" : "#ffd08a",
          far: wall ? "#8a2944" : "#a86a1e",
          edge: "rgba(255,255,255,0.4)",
        });
      }
    }
    ctx.restore();
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - (state.last || now)) / 1000);
    state.last = now;
    update(dt);
    drawWorld();
    requestAnimationFrame(loop);
  }

  function onKey(e) {
    if (held.has(e.code)) return;
    held.add(e.code);
    if (e.code === "ArrowLeft" || e.code === "KeyA") moveLane(-1);
    if (e.code === "ArrowRight" || e.code === "KeyD") moveLane(1);
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      if (!state.running) reset();
      else jump();
    }
  }

  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", (e) => held.delete(e.code));

  let touchX = null;
  let touchY = null;
  canvas.addEventListener("pointerdown", (e) => {
    touchX = e.clientX;
    touchY = e.clientY;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    if (touchX == null) return;
    const dx = e.clientX - touchX;
    const dy = e.clientY - touchY;
    touchX = null;
    touchY = null;
    if (!state.running) {
      reset();
      return;
    }
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1);
    else jump();
  });

  bindStart(document.getElementById("startBtn"));
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(loop);
})();
