/* VIRAL LINK — Zombie Defense (no server, GitHub Pages ready)
   - Works even without assets/bg.mp4 and assets/intro.mp4 (optional)
   - Vertical-only (CSS blocks landscape)
   - No Service Worker (no cache hell)
*/
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);

  const ui = {
    cv: $("#cv"),
    bgVideo: $("#bgVideo"),
    intro: $("#intro"),
    menu: $("#menu"),
    how: $("#how"),
    perk: $("#perk"),
    leaders: $("#leaders"),
    over: $("#over"),
    fatal: $("#fatal"),
    fatalText: $("#fatalText"),
    btnReload: $("#btnReload"),

    introVideo: $("#introVideo"),
    btnStart: $("#btnStart"),
    btnSkip: $("#btnSkip"),

    btnSound: $("#btnSound"),
    btnGetId: $("#btnGetId"),
    btnPlay: $("#btnPlay"),
    btnHow: $("#btnHow"),
    btnHowBack: $("#btnHowBack"),
    btnLeaders: $("#btnLeaders"),
    btnLeadersClose: $("#btnLeadersClose"),
    tabLocal: $("#tabLocal"),
    tabChain: $("#tabChain"),
    listLocal: $("#listLocal"),
    listChain: $("#listChain"),
    btnCopyBoard: $("#btnCopyBoard"),
    btnReset: $("#btnReset"),

    btnBomb: $("#btnBomb"),
    btnFire: $("#btnFire"),
    btnDash: $("#btnDash"),

    bombCd: $("#bombCd"),
    dashCd: $("#dashCd"),

    myId: $("#myId"),
    myRank: $("#myRank"),
    best: $("#best"),
    chain: $("#chain"),

    hudMode: $("#hudMode"),
    hudHp: $("#hudHp"),
    hudWave: $("#hudWave"),
    hudScore: $("#hudScore"),
    hudRank: $("#hudRank"),

    overTitle: $("#overTitle"),
    overScore: $("#overScore"),
    overBest: $("#overBest"),
    overRank: $("#overRank"),
    overKills: $("#overKills"),
    btnShare: $("#btnShare"),
    btnCopyLink: $("#btnCopyLink"),
    btnAgain: $("#btnAgain"),
    btnMenu: $("#btnMenu"),

    perkList: $("#perkList"),
    toast: $("#toast"),
  };

  // ==== tiny helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };

  function show(el, on) { el.classList.toggle("show", !!on); }
  function setText(el, s) { if (el) el.textContent = s; }

  function toast(msg) {
    if (!ui.toast) return;
    ui.toast.textContent = msg;
    ui.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => ui.toast.classList.remove("show"), 1250);
  }

  function vibrate(p) { if (navigator.vibrate) navigator.vibrate(p); }

  // ==== error handling (so you never get "nothing works" without explanation)
  function fatal(msg) {
    console.error("FATAL:", msg);
    setText(ui.fatalText, String(msg || "Unknown error"));
    show(ui.fatal, true);
    show(ui.intro, false);
    show(ui.menu, false);
    show(ui.how, false);
    show(ui.perk, false);
    show(ui.leaders, false);
    show(ui.over, false);
    toast("ERROR");
  }

  window.addEventListener("error", (e) => fatal(e?.message || e));
  window.addEventListener("unhandledrejection", (e) => fatal(e?.reason || e));

  ui.btnReload?.addEventListener("click", () => location.reload());

  // ==== Audio (WebAudio)
  const LS_SOUND = "vl_sound_v2";
  let soundOn = (localStorage.getItem(LS_SOUND) ?? "1") === "1";
  let audioCtx = null;

  function ensureAudio() {
    if (!soundOn) return null;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function sfx(freq = 440, dur = 0.05, type = "sine", gain = 0.06) {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  function setSoundBtn() {
    if (!ui.btnSound) return;
    ui.btnSound.textContent = soundOn ? "SOUND: ON" : "SOUND: OFF";
  }

  // ==== ID + share leaderboards in URL
  const LS_ID = "vl_id_v2";
  const LS_BEST = "vl_best_v2";
  const LS_RUNS = "vl_runs_v2";

  function makeId() {
    const t = Date.now().toString(36).slice(-6);
    const r = Math.random().toString(36).slice(2, 6);
    return (t + r).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function parseUrl() {
    const u = new URL(location.href);
    const c = u.searchParams.get("c") || "";
    const p = u.searchParams.get("p") || "";
    const chain = c
      .split(".")
      .map((x) => x.replace(/[^A-Z0-9]/gi, "").toUpperCase())
      .filter(Boolean)
      .slice(0, 180);

    // p: ID~SCORE.ID~SCORE...
    const board = [];
    if (p) {
      p.split(".").slice(0, 40).forEach((tok) => {
        const [idRaw, scRaw] = tok.split("~");
        const id = (idRaw || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
        const sc = Number(scRaw || "0");
        if (id && Number.isFinite(sc) && sc >= 0) board.push({ id, score: Math.floor(sc) });
      });
    }
    return { chain, board };
  }

  function mergeBoard(a, b) {
    const m = new Map();
    [...a, ...b].forEach((e) => {
      const prev = m.get(e.id);
      if (!prev || e.score > prev.score) m.set(e.id, { id: e.id, score: e.score });
    });
    return [...m.values()];
  }

  // ==== ranks
  const RANKS = [
    { name: "Rookie", min: 0 },
    { name: "Runner", min: 900 },
    { name: "Slayer", min: 2000 },
    { name: "Warlord", min: 3600 },
    { name: "Doom", min: 5400 },
    { name: "Myth", min: 7800 },
  ];
  function rankFor(score) {
    let r = RANKS[0].name;
    for (const it of RANKS) if (score >= it.min) r = it.name;
    return r;
  }

  // ==== state
  const parsed = parseUrl();
  const state = {
    mode: "intro", // intro/menu/play/perk/over/how/leaders
    id: localStorage.getItem(LS_ID) || "",
    best: Number(localStorage.getItem(LS_BEST) || "0"),
    runs: [],
    chain: parsed.chain,
    chainBoard: parsed.board,

    // run
    wave: 1,
    hp: 3,
    score: 0,
    kills: 0,
    time: 0, // not used, wave-based game

    // upgrades
    dmg: 1,
    fireDelay: 0.13,
    move: 1.0,
    bombRadius: 160,
    pierce: 0,

    // cooldowns
    bombCd: 0,
    dashCd: 0,

    // input
    firing: false,
    pointer: false,
    tx: 0, ty: 0,

    // wave pacing
    needKills: 12,
    spawned: 0,
    nextPerkWave: 2,

    // shake
    shake: 0,
  };

  try {
    const arr = JSON.parse(localStorage.getItem(LS_RUNS) || "[]");
    state.runs = Array.isArray(arr) ? arr : [];
  } catch { state.runs = []; }

  // ==== optional assets (do not break if missing)
  function trySetVideo(videoEl, src) {
    if (!videoEl) return;
    const source = document.createElement("source");
    source.src = src;
    source.type = "video/mp4";
    videoEl.innerHTML = "";
    videoEl.appendChild(source);

    // if it fails, keep fallback gradient background
    videoEl.addEventListener("error", () => {});
  }

  trySetVideo(ui.bgVideo, "./assets/bg.mp4");
  trySetVideo(ui.introVideo, "./assets/intro.mp4");

  // ==== canvas
  const cv = ui.cv;
  if (!cv) return fatal("Canvas not found (#cv).");
  const ctx = cv.getContext("2d", { alpha: true });
  const G = { w: 0, h: 0, dpr: 1, last: performance.now() };

  function resize() {
    const r = cv.getBoundingClientRect();
    G.dpr = Math.min(2.25, window.devicePixelRatio || 1);
    cv.width = Math.floor(r.width * G.dpr);
    cv.height = Math.floor(r.height * G.dpr);
    G.w = cv.width;
    G.h = cv.height;
    player.x = G.w * 0.5;
    player.y = G.h * 0.72;
    state.tx = player.x;
    state.ty = player.y;
  }
  window.addEventListener("resize", resize);
  resize();

  // ==== entities
  const player = { x: G.w * 0.5, y: G.h * 0.72, r: 18, vx: 0, vy: 0, inv: 0 };
  const zombies = [];
  const bullets = [];
  const parts = [];

  function spawnZombie(type = "n") {
    const edge = Math.random() < 0.5 ? "top" : "side";
    let x, y;
    if (edge === "top") { x = rnd(60, G.w - 60); y = -80 * G.dpr; }
    else { x = Math.random() < 0.5 ? -80 * G.dpr : G.w + 80 * G.dpr; y = rnd(120, G.h * 0.72); }

    let hp = 1 + Math.floor((state.wave - 1) / 3);
    let sp = (80 + state.wave * 7) * G.dpr;
    let r = (16 + rnd(-2, 2)) * G.dpr;

    if (type === "r") { sp *= 1.45; hp = Math.max(1, hp - 1); r *= 0.92; }
    if (type === "t") { sp *= 0.72; hp += 2; r *= 1.25; }
    if (type === "b") { sp *= 0.62; hp += 10 + state.wave; r *= 1.7; }

    zombies.push({ x, y, r, hp, maxHp: hp, sp, type, wob: rnd(0, 6.28) });
  }

  function pickType() {
    if (state.wave % 5 === 0 && state.spawned === 0) return "b";
    const r = Math.random();
    if (state.wave >= 3 && r < 0.20) return "r";
    if (state.wave >= 4 && r < 0.34) return "t";
    return "n";
  }

  function burst(x, y, n, kind) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(160, 760) * G.dpr;
      parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        t: 0, life: rnd(0.18, 0.65),
        r: rnd(1.0, 3.0) * G.dpr,
        kind
      });
    }
  }

  function col(kind) {
    if (kind === "c") return ["rgba(86,214,255,0.95)", "rgba(86,214,255,0.22)"];
    if (kind === "p") return ["rgba(176,140,255,0.92)", "rgba(176,140,255,0.22)"];
    if (kind === "r") return ["rgba(255,59,110,0.92)", "rgba(255,59,110,0.22)"];
    return ["rgba(125,255,204,0.92)", "rgba(125,255,204,0.22)"];
  }

  // ==== UI sync
  function hearts(hp) {
    return "♥".repeat(Math.max(0, hp)) + "·".repeat(Math.max(0, 3 - hp));
  }

  function syncHud() {
    setText(ui.hudMode, state.mode.toUpperCase());
    setText(ui.hudHp, hearts(state.hp));
    setText(ui.hudWave, String(state.wave));
    setText(ui.hudScore, String(Math.floor(state.score)));
    setText(ui.hudRank, rankFor(state.best));
    setText(ui.bombCd, state.bombCd > 0 ? `${state.bombCd.toFixed(1)}s` : "READY");
    setText(ui.dashCd, state.dashCd > 0 ? `${state.dashCd.toFixed(1)}s` : "READY");
  }

  function syncMenu() {
    setText(ui.myId, state.id || "—");
    setText(ui.best, String(state.best));
    setText(ui.myRank, rankFor(state.best));
    const chainCount = state.id ? state.chain.length + 1 : state.chain.length;
    setText(ui.chain, String(chainCount || 0));
  }

  // ==== buttons / overlays
  function goIntro() {
    state.mode = "intro";
    show(ui.intro, true);
    show(ui.menu, false);
    show(ui.how, false);
    show(ui.perk, false);
    show(ui.leaders, false);
    show(ui.over, false);

    // videos: try play muted
    try { ui.bgVideo?.play().catch(() => {}); } catch {}
    try { if (ui.introVideo) { ui.introVideo.muted = true; ui.introVideo.play().catch(() => {}); } } catch {}
    syncHud();
  }

  function goMenu() {
    state.mode = "menu";
    show(ui.intro, false);
    show(ui.menu, true);
    show(ui.how, false);
    show(ui.perk, false);
    show(ui.leaders, false);
    show(ui.over, false);
    syncMenu();
    syncHud();
  }

  function goHow() {
    show(ui.how, true);
    state.mode = "how";
    syncHud();
  }

  function goLeaders() {
    renderBoards();
    show(ui.leaders, true);
    state.mode = "leaders";
    syncHud();
  }

  function goOver() {
    state.mode = "over";
    show(ui.over, true);
    show(ui.perk, false);
    show(ui.leaders, false);
    show(ui.how, false);
    show(ui.menu, false);
    syncHud();

    setText(ui.overScore, String(Math.floor(state.score)));
    setText(ui.overBest, String(state.best));
    setText(ui.overRank, rankFor(state.best));
    setText(ui.overKills, String(state.kills));
  }

  // ==== join / storage
  function join() {
    if (state.id) return;
    state.id = makeId();
    localStorage.setItem(LS_ID, state.id);
    toast(`ID: ${state.id}`);
    vibrate([10, 30, 10]);
    sfx(760, 0.04, "triangle", 0.06);
    syncMenu();
  }

  // ==== perks
  const PERKS = [
    { key: "firerate", title: "Rapid Fire", desc: "-15% fire delay", apply: () => state.fireDelay = Math.max(0.06, state.fireDelay * 0.85) },
    { key: "damage", title: "High Damage", desc: "+1 bullet damage", apply: () => state.dmg += 1 },
    { key: "pierce", title: "Pierce", desc: "+1 pierce (bullets go through)", apply: () => state.pierce += 1 },
    { key: "speed", title: "Move Boost", desc: "+12% move speed", apply: () => state.move = Math.min(1.55, state.move * 1.12) },
    { key: "radius", title: "Bigger Bomb", desc: "+22% bomb radius", apply: () => state.bombRadius = Math.min(320, state.bombRadius * 1.22) },
    { key: "serum", title: "Serum", desc: "+1 HP (max 3)", apply: () => state.hp = Math.min(3, state.hp + 1) },
  ];

  function openPerk() {
    state.mode = "perk";
    show(ui.perk, true);
    show(ui.menu, false);
    show(ui.how, false);
    show(ui.leaders, false);
    show(ui.over, false);

    const pool = [...PERKS].sort(() => Math.random() - 0.5).slice(0, 3);

    ui.perkList.innerHTML = pool.map(p => `
      <button class="perkBtn" data-perk="${p.key}" type="button">
        ${p.title}
        <span class="desc">${p.desc}</span>
      </button>
    `).join("");

    ui.perkList.querySelectorAll(".perkBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        ensureAudio();
        const key = btn.getAttribute("data-perk");
        const perk = pool.find(x => x.key === key);
        if (perk) perk.apply();
        show(ui.perk, false);
        state.mode = "play";
        state.nextPerkWave = state.wave + 2;
        toast("UPGRADED");
        sfx(880, 0.05, "triangle", 0.07);
        vibrate(8);
      });
    });

    syncHud();
  }

  // ==== leaderboards
  function renderBoards() {
    // local
    const local = [...state.runs].sort((a, b) => b.score - a.score).slice(0, 10);
    ui.listLocal.innerHTML = local.length ? local.map((r, i) => `
      <div class="item">
        <div>
          <div class="mono">#${i + 1} ${new Date(r.ts).toLocaleDateString()} ${new Date(r.ts).toLocaleTimeString().slice(0,5)}</div>
          <div class="k">WAVE ${r.wave} · KILLS ${r.kills}</div>
        </div>
        <div class="badge">${r.score}</div>
      </div>
    `).join("") : `<div class="item"><div>Сыграй пару раз — тут появится топ.</div><div class="badge">—</div></div>`;

    const chainMerged = mergeBoard(state.chainBoard, state.id ? [{ id: state.id, score: state.best }] : []);
    chainMerged.sort((a, b) => b.score - a.score);
    ui.listChain.innerHTML = chainMerged.length ? chainMerged.slice(0, 10).map((e, i) => `
      <div class="item">
        <div>
          <div class="mono">${e.id === state.id ? "YOU • " : ""}${e.id}</div>
          <div class="k">${rankFor(e.score)}</div>
        </div>
        <div class="badge">#${i + 1} · ${e.score}</div>
      </div>
    `).join("") : `<div class="item"><div>Пока пусто. Выиграй и шарь ссылку.</div><div class="badge">—</div></div>`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    vibrate(10);
    sfx(760, 0.04, "triangle", 0.06);
  }

  function buildShareLink() {
    const u = new URL(location.href);
    u.search = "";

    const chain = [...state.chain];
    if (state.id) chain.push(state.id);

    const merged = mergeBoard(state.chainBoard, state.id ? [{ id: state.id, score: state.best }] : []);
    merged.sort((x, y) => y.score - x.score);
    const top = merged.slice(0, 12);

    if (chain.length) u.searchParams.set("c", chain.join("."));
    if (top.length) u.searchParams.set("p", top.map((e) => `${e.id}~${e.score}`).join("."));
    u.searchParams.set("v", "2");

    return u.toString();
  }

  async function shareOrCopy(url) {
    const text = `☣ VIRAL LINK — побей мой рекорд: ${state.best}\n${url}`;
    try {
      if (navigator.share) await navigator.share({ title: "VIRAL LINK", text, url });
      else await copyText(url);
      toast("DONE");
    } catch {
      await copyText(url);
      toast("LINK COPIED");
    }
  }

  // ==== gameplay
  let fireT = 0;
  let spawnT = 0;

  function resetRun() {
    state.mode = "play";
    state.wave = 1;
    state.hp = 3;
    state.score = 0;
    state.kills = 0;

    state.dmg = 1;
    state.fireDelay = 0.13;
    state.move = 1.0;
    state.bombRadius = 160;
    state.pierce = 0;

    state.bombCd = 0;
    state.dashCd = 0;
    state.needKills = 12;
    state.spawned = 0;
    state.nextPerkWave = 2;

    state.shake = 0;

    zombies.length = 0;
    bullets.length = 0;
    parts.length = 0;

    player.x = G.w * 0.5;
    player.y = G.h * 0.72;
    player.vx = 0;
    player.vy = 0;
    player.inv = 0;

    state.tx = player.x;
    state.ty = player.y;

    fireT = 0;
    spawnT = 0;

    toast("GO!");
    sfx(540, 0.05, "sine", 0.05);
    vibrate(10);
  }

  function endRun() {
    const score = Math.floor(state.score);
    if (score > state.best) {
      state.best = score;
      localStorage.setItem(LS_BEST, String(state.best));
      toast("NEW BEST!");
      sfx(920, 0.08, "triangle", 0.08);
      vibrate([20, 25, 20]);
    }

    state.runs.push({ score, wave: state.wave, kills: state.kills, ts: Date.now() });
    state.runs = state.runs.slice(-80);
    localStorage.setItem(LS_RUNS, JSON.stringify(state.runs));

    if (state.id) state.chainBoard = mergeBoard(state.chainBoard, [{ id: state.id, score: state.best }]);

    goOver();
    syncMenu();
  }

  function nearestZombie() {
    let best = null;
    let bestD = Infinity;
    for (const z of zombies) {
      const d = dist2(player.x, player.y, z.x, z.y);
      if (d < bestD) { bestD = d; best = z; }
    }
    return best;
  }

  function fireBullet() {
    const z = nearestZombie();
    const tx = z ? z.x : player.x;
    const ty = z ? z.y : player.y - 200 * G.dpr;

    const dx = tx - player.x;
    const dy = ty - player.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len, uy = dy / len;

    const sp = 860 * G.dpr;
    bullets.push({
      x: player.x + ux * 20 * G.dpr,
      y: player.y + uy * 20 * G.dpr,
      vx: ux * sp,
      vy: uy * sp,
      r: 3.2 * G.dpr,
      dmg: state.dmg,
      pierce: state.pierce,
      t: 0, life: 0.95,
    });

    burst(player.x + ux * 22 * G.dpr, player.y + uy * 22 * G.dpr, 8, "c");
    sfx(560 + rnd(-40, 40), 0.02, "square", 0.03);
  }

  function bomb() {
    if (state.bombCd > 0) return;
    state.bombCd = 9.0;
    const R = state.bombRadius * G.dpr;
    let killed = 0;

    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i];
      if (dist2(player.x, player.y, z.x, z.y) <= R * R) {
        zombies.splice(i, 1);
        killed++;
        state.kills++;
        state.score += 140 + state.wave * 9;
        burst(z.x, z.y, 26, "g");
      }
    }

    state.shake = Math.min(1, state.shake + 0.55);
    burst(player.x, player.y, 70, "p");
    vibrate([20, 40, 20]);
    sfx(180, 0.08, "sawtooth", 0.06);
    toast(killed ? `BOMB: +${killed}` : "BOMB");
  }

  function dash() {
    if (state.dashCd > 0) return;
    state.dashCd = 6.2;

    const z = nearestZombie();
    let dx = z ? player.x - z.x : 0;
    let dy = z ? player.y - z.y : -1;
    const len = Math.max(1, Math.hypot(dx, dy));
    dx /= len; dy /= len;

    player.vx += dx * 28;
    player.vy += dy * 28;
    player.inv = Math.max(player.inv, 0.75);

    burst(player.x, player.y, 26, "c");
    vibrate(10);
    sfx(820, 0.03, "triangle", 0.05);
  }

  // ==== Drawing
  function drawVignette(t) {
    const gx = (Math.sin(t * 0.0012) * 0.5 + 0.5) * G.w;
    const gy = (Math.cos(t * 0.0011) * 0.5 + 0.5) * G.h;
    const gr = ctx.createRadialGradient(gx, gy, 10, gx, gy, Math.max(G.w, G.h));
    gr.addColorStop(0, "rgba(125,255,204,0.10)");
    gr.addColorStop(0.6, "rgba(0,0,0,0)");
    gr.addColorStop(1, "rgba(0,0,0,0.58)");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, G.w, G.h);
  }

  function drawPlayer(t) {
    const tt = t * 0.001;
    const pulse = 1 + Math.sin(tt * 8) * 0.08;
    const r = player.r * G.dpr * pulse;

    ctx.save();
    ctx.shadowBlur = 30 * G.dpr;
    ctx.shadowColor = player.inv > 0 ? "rgba(86,214,255,0.35)" : "rgba(125,255,204,0.30)";

    const g = ctx.createRadialGradient(player.x, player.y, 3, player.x, player.y, r * 2.3);
    g.addColorStop(0, player.inv > 0 ? "rgba(86,214,255,0.92)" : "rgba(125,255,204,0.95)");
    g.addColorStop(0.55, "rgba(26,242,166,0.50)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r * 1.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 12 * G.dpr;
    ctx.shadowColor = "rgba(255,255,255,0.12)";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(player.x, player.y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawZombies(t) {
    const tt = t * 0.001;
    for (const z of zombies) {
      const wob = Math.sin(tt * 6 + z.wob) * 0.12;

      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.rotate(wob);

      let glow = "rgba(255,59,110,0.24)";
      let fill = "rgba(255,59,110,0.86)";
      if (z.type === "r") { glow = "rgba(86,214,255,0.18)"; fill = "rgba(86,214,255,0.78)"; }
      if (z.type === "t") { glow = "rgba(176,140,255,0.20)"; fill = "rgba(176,140,255,0.78)"; }
      if (z.type === "b") { glow = "rgba(255,59,110,0.30)"; fill = "rgba(255,59,110,0.92)"; }

      ctx.shadowBlur = 24 * G.dpr;
      ctx.shadowColor = glow;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(0, 0, z.r * 1.05, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.arc(0, 0, z.r * 0.72, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(-z.r * 0.22, -z.r * 0.12, z.r * 0.10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( z.r * 0.22, -z.r * 0.12, z.r * 0.10, 0, Math.PI * 2); ctx.fill();

      // hp ring
      const hpRatio = clamp(z.hp / z.maxHp, 0, 1);
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = "rgba(255,255,255,0.20)";
      ctx.lineWidth = 2 * G.dpr;
      ctx.beginPath();
      ctx.arc(0, 0, z.r * 1.28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpRatio);
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawBullets() {
    for (const b of bullets) {
      ctx.save();
      ctx.shadowBlur = 16 * G.dpr;
      ctx.shadowColor = "rgba(86,214,255,0.22)";
      ctx.fillStyle = "rgba(86,214,255,0.95)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      const k = 1 - p.t / p.life;
      if (k <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.2 * dt;
      p.vy *= 1 - 2.2 * dt;

      const [f, glow] = col(p.kind);
      ctx.save();
      ctx.globalAlpha = k * 0.9;
      ctx.shadowBlur = 16 * G.dpr;
      ctx.shadowColor = glow;
      ctx.fillStyle = f;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.8 + k * 0.9), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ==== Main update
  function update(dt, t) {
    // Always try play bg video (muted)
    try { ui.bgVideo?.play().catch(() => {}); } catch {}

    ctx.save();

    // screen shake
    state.shake = Math.max(0, state.shake - dt * 3.2);
    if (state.shake > 0) ctx.translate(rnd(-1, 1) * state.shake * 10 * G.dpr, rnd(-1, 1) * state.shake * 10 * G.dpr);

    ctx.clearRect(0, 0, G.w, G.h);
    drawVignette(t);

    // ambient parts
    if (Math.random() < 0.10) parts.push({ x: rnd(0, G.w), y: rnd(0, G.h), vx: rnd(-30, 30)*G.dpr, vy: rnd(-30, 30)*G.dpr, t:0, life:rnd(0.2,0.5), r:rnd(0.8,1.8)*G.dpr, kind:"g" });

    if (state.mode === "play") {
      // cooldowns
      state.bombCd = Math.max(0, state.bombCd - dt);
      state.dashCd = Math.max(0, state.dashCd - dt);
      player.inv = Math.max(0, player.inv - dt);

      // movement follow finger
      if (state.pointer) {
        const fx = state.tx - player.x;
        const fy = state.ty - player.y;
        player.vx += fx * dt * 0.55 * state.move;
        player.vy += fy * dt * 0.55 * state.move;
      }
      player.vx *= (1 - dt * 2.6);
      player.vy *= (1 - dt * 2.6);
      player.x += player.vx * 60;
      player.y += player.vy * 60;

      const padX = 44 * G.dpr;
      const padYTop = 120 * G.dpr;
      const padYBot = 92 * G.dpr;
      player.x = clamp(player.x, padX, G.w - padX);
      player.y = clamp(player.y, padYTop, G.h - padYBot);

      // wave checks
      if (state.kills >= state.needKills) {
        state.wave += 1;
        state.needKills += 10 + state.wave * 2;
        state.spawned = 0;
        toast("WAVE " + state.wave);
        sfx(780, 0.05, "triangle", 0.06);
        if (state.wave === state.nextPerkWave) {
          openPerk();
          ctx.restore();
          syncHud();
          return;
        }
      }

      // spawn pacing
      spawnT += dt;
      const base = Math.max(0.14, 0.58 - state.wave * 0.045);
      while (spawnT >= base) {
        spawnT -= base;
        spawnZombie(pickType());
        state.spawned++;
        if (state.wave >= 7 && Math.random() < 0.25) { spawnZombie(pickType()); state.spawned++; }
      }

      // firing
      if (state.firing) {
        fireT += dt;
        while (fireT >= state.fireDelay) {
          fireT -= state.fireDelay;
          fireBullet();
        }
      } else {
        fireT = Math.min(fireT, state.fireDelay * 0.5);
      }

      // bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.t += dt;
        if (b.t >= b.life) { bullets.splice(i, 1); continue; }
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // collisions
        for (let j = zombies.length - 1; j >= 0; j--) {
          const z = zombies[j];
          const rr = z.r + b.r;
          if (dist2(b.x, b.y, z.x, z.y) <= rr * rr) {
            z.hp -= b.dmg;
            burst(b.x, b.y, 10, "c");

            if (b.pierce > 0) b.pierce -= 1;
            else { bullets.splice(i, 1); }

            if (z.hp <= 0) {
              zombies.splice(j, 1);
              state.kills++;
              const add = (z.type === "b" ? 520 : z.type === "t" ? 200 : z.type === "r" ? 150 : 130) + state.wave * 9;
              state.score += add;
              burst(z.x, z.y, z.type === "b" ? 70 : 28, z.type === "t" ? "p" : "g");
              state.shake = Math.min(1, state.shake + (z.type === "b" ? 0.30 : 0.12));
              sfx(660 + rnd(-50, 50), 0.03, "triangle", 0.05);
              vibrate(6);
            }
            break;
          }
        }
      }

      // zombies chase + hurt
      for (let i = zombies.length - 1; i >= 0; i--) {
        const z = zombies[i];
        const dx = player.x - z.x;
        const dy = player.y - z.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / len, uy = dy / len;
        const wob = Math.sin((t * 0.001) * 3 + z.wob) * 0.22;

        z.x += (ux + wob) * z.sp * dt;
        z.y += (uy - wob) * z.sp * dt;

        // hit player
        const rr = z.r + player.r * G.dpr;
        if (dist2(z.x, z.y, player.x, player.y) <= rr * rr) {
          if (player.inv <= 0) {
            state.hp -= 1;
            player.inv = 0.95;
            state.shake = Math.min(1, state.shake + 0.45);
            burst(player.x, player.y, 40, "r");
            vibrate([15, 40, 15]);
            sfx(140, 0.08, "sawtooth", 0.06);
            toast(state.hp > 0 ? "HIT!" : "DOWN!");
            if (state.hp <= 0) {
              endRun();
              ctx.restore();
              syncHud();
              return;
            }
          }
        }
      }

      // Draw entities
      drawZombies(t);
      drawBullets();
      drawPlayer(t);

    } else {
      // idle preview
      drawPlayer(t);
    }

    drawParts(dt);
    ctx.restore();
    syncHud();
  }

  // ==== Input
  function setTargetFromEvent(e) {
    const r = cv.getBoundingClientRect();
    state.tx = (e.clientX - r.left) * G.dpr;
    state.ty = (e.clientY - r.top) * G.dpr;
  }

  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    ensureAudio();
    state.pointer = true;
    setTargetFromEvent(e);
  });
  cv.addEventListener("pointermove", (e) => { if (state.pointer) setTargetFromEvent(e); });
  cv.addEventListener("pointerup", () => (state.pointer = false));
  cv.addEventListener("pointercancel", () => (state.pointer = false));

  // FIRE hold
  ui.btnFire?.addEventListener("pointerdown", () => { ensureAudio(); state.firing = true; });
  ui.btnFire?.addEventListener("pointerup", () => (state.firing = false));
  ui.btnFire?.addEventListener("pointercancel", () => (state.firing = false));
  ui.btnFire?.addEventListener("pointerleave", () => (state.firing = false));

  // abilities
  ui.btnBomb?.addEventListener("click", () => { ensureAudio(); if (state.mode === "play") bomb(); });
  ui.btnDash?.addEventListener("click", () => { ensureAudio(); if (state.mode === "play") dash(); });

  // ==== Menu buttons
  ui.btnSound?.addEventListener("click", () => {
    soundOn = !soundOn;
    localStorage.setItem(LS_SOUND, soundOn ? "1" : "0");
    setSoundBtn();
    toast(soundOn ? "SOUND ON" : "SOUND OFF");
    sfx(740, 0.03, "triangle", 0.05);
  });

  ui.btnGetId?.addEventListener("click", () => join());

  ui.btnPlay?.addEventListener("click", () => {
    ensureAudio();
    join();
    show(ui.menu, false);
    show(ui.how, false);
    show(ui.leaders, false);
    show(ui.over, false);
    show(ui.perk, false);
    resetRun();
    state.mode = "play";
    syncHud();
  });

  ui.btnHow?.addEventListener("click", () => goHow());
  ui.btnHowBack?.addEventListener("click", () => { show(ui.how, false); state.mode = "menu"; syncHud(); });

  ui.btnLeaders?.addEventListener("click", () => goLeaders());
  ui.btnLeadersClose?.addEventListener("click", () => { show(ui.leaders, false); state.mode = "menu"; syncHud(); });

  ui.tabLocal?.addEventListener("click", () => {
    ui.tabLocal.classList.add("on");
    ui.tabChain.classList.remove("on");
    ui.listLocal.classList.remove("hidden");
    ui.listChain.classList.add("hidden");
  });
  ui.tabChain?.addEventListener("click", () => {
    ui.tabChain.classList.add("on");
    ui.tabLocal.classList.remove("on");
    ui.listChain.classList.remove("hidden");
    ui.listLocal.classList.add("hidden");
  });

  ui.btnCopyBoard?.addEventListener("click", async () => {
    const local = [...state.runs].sort((a, b) => b.score - a.score).slice(0, 10);
    const txt = local.map((r, i) => `#${i + 1} ${r.score} (W${r.wave} K${r.kills})`).join("\n");
    await copyText(txt || "EMPTY");
    toast("COPIED");
  });

  ui.btnReset?.addEventListener("click", () => {
    state.runs = [];
    localStorage.removeItem(LS_RUNS);
    toast("RESET");
    renderBoards();
  });

  ui.btnShare?.addEventListener("click", () => shareOrCopy(buildShareLink()));
  ui.btnCopyLink?.addEventListener("click", async () => { await copyText(buildShareLink()); toast("LINK COPIED"); });

  ui.btnAgain?.addEventListener("click", () => {
    ensureAudio();
    show(ui.over, false);
    resetRun();
    state.mode = "play";
    syncHud();
  });

  ui.btnMenu?.addEventListener("click", () => goMenu());

  // ==== Intro buttons (autoplay muted; tap enables sound)
  ui.btnSkip?.addEventListener("click", () => {
    try { ui.introVideo?.pause(); } catch {}
    goMenu();
  });

  ui.btnStart?.addEventListener("click", () => {
    ensureAudio();
    // enable intro audio if there is a video
    try {
      if (ui.introVideo) {
        ui.introVideo.muted = false;
        ui.introVideo.play().catch(() => {});
      }
    } catch {}
    sfx(740, 0.05, "triangle", 0.06);
    setTimeout(() => goMenu(), 650);
  });

  ui.introVideo?.addEventListener("ended", () => goMenu());

  // ==== Boot
  function boot() {
    setSoundBtn();
    syncMenu();
    syncHud();

    // merge chainboard with local best
    if (state.id) state.chainBoard = mergeBoard(state.chainBoard, [{ id: state.id, score: state.best }]);

    // try play bg video
    try { ui.bgVideo?.play().catch(() => {}); } catch {}

    goIntro();
    toast("LOADED");
    requestAnimationFrame(loop);
  }

  function loop(t) {
    const dt = clamp((t - G.last) / 1000, 0, 0.033);
    G.last = t;
    update(dt, t);
    requestAnimationFrame(loop);
  }

  boot();
})();
