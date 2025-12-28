(() => {
  const $ = (s) => document.querySelector(s);

  const ui = {
    cv: $("#cv"),

    hudState: $("#hudState"),
    hudHp: $("#hudHp"),
    hudWave: $("#hudWave"),
    hudTime: $("#hudTime"),
    hudScore: $("#hudScore"),
    hudRank: $("#hudRank"),

    btnFire: $("#btnFire"),
    btnBomb: $("#btnBomb"),
    btnDash: $("#btnDash"),
    bombCd: $("#bombCd"),
    dashCd: $("#dashCd"),

    intro: $("#intro"),
    introVideo: $("#introVideo"),
    btnStartSound: $("#btnStartSound"),
    btnSkipIntro: $("#btnSkipIntro"),

    menu: $("#menu"),
    btnSound: $("#btnSound"),
    btnJoin: $("#btnJoin"),
    btnPlay: $("#btnPlay"),
    btnHow: $("#btnHow"),
    btnLeaders: $("#btnLeaders"),
    myId: $("#myId"),
    myRank: $("#myRank"),
    best: $("#best"),
    chain: $("#chain"),

    how: $("#how"),
    btnHowBack: $("#btnHowBack"),

    leaders: $("#leaders"),
    btnLeadersBack: $("#btnLeadersBack"),
    tabLocal: $("#tabLocal"),
    tabChain: $("#tabChain"),
    listLocal: $("#listLocal"),
    listChain: $("#listChain"),
    btnCopyBoard: $("#btnCopyBoard"),
    btnReset: $("#btnReset"),

    over: $("#over"),
    overTitle: $("#overTitle"),
    overScore: $("#overScore"),
    overBest: $("#overBest"),
    overRank: $("#overRank"),
    overKills: $("#overKills"),
    btnShare: $("#btnShare"),
    btnCopyLink: $("#btnCopyLink"),
    btnAgain: $("#btnAgain"),
    btnMenu: $("#btnMenu"),

    toast: $("#toast"),

    bgVideo: $("#bgVideo"),
  };

  const LS = {
    id: "vlz_id",
    best: "vlz_best",
    runs: "vlz_runs",
    sound: "vlz_sound",
  };

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const rnd = (a,b)=>a + Math.random()*(b-a);
  const dist2=(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;};

  function toast(msg){
    ui.toast.textContent = msg;
    ui.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>ui.toast.classList.remove("show"), 1200);
  }
  function vibrate(p){ if (navigator.vibrate) navigator.vibrate(p); }

  // ====== Sound (WebAudio synth). Real “mp3 SFX” не нужны.
  let soundOn = (localStorage.getItem(LS.sound) ?? "1") === "1";
  let audioCtx = null;
  function ensureAudio(){
    if (!soundOn) return null;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function sfx(freq=440, dur=0.04, type="sine", gain=0.06){
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  // ====== ID + chain board in URL (без сервера)
  function makeId(){
    const t = Date.now().toString(36).slice(-6);
    const r = Math.random().toString(36).slice(2,6);
    return (t+r).toUpperCase().replace(/[^A-Z0-9]/g,"");
  }
  function parseUrl(){
    const u = new URL(location.href);
    const c = u.searchParams.get("c") || "";
    const p = u.searchParams.get("p") || "";
    const chain = c.split(".").map(x=>x.replace(/[^A-Z0-9]/gi,"").toUpperCase()).filter(Boolean).slice(0,180);

    // p: ID~SCORE.ID~SCORE...
    const board = [];
    if (p) {
      p.split(".").slice(0,40).forEach(tok=>{
        const [idRaw, scRaw] = tok.split("~");
        const id = (idRaw||"").replace(/[^A-Z0-9]/gi,"").toUpperCase();
        const sc = Number(scRaw||"0");
        if (id && Number.isFinite(sc) && sc>=0) board.push({id, score: Math.floor(sc)});
      });
    }
    return { chain, board };
  }
  function mergeBoard(a,b){
    const m = new Map();
    [...a, ...b].forEach(e=>{
      const prev = m.get(e.id);
      if (!prev || e.score > prev.score) m.set(e.id, {id:e.id, score:e.score});
    });
    return [...m.values()];
  }
  function buildShareLink(myEntry){
    const u = new URL(location.href);
    u.search = "";
    const chain = [...state.chain];
    if (state.id) chain.push(state.id);

    const merged = mergeBoard(state.chainBoard, myEntry ? [myEntry] : []);
    merged.sort((x,y)=>y.score-x.score);
    const top = merged.slice(0,12);

    if (chain.length) u.searchParams.set("c", chain.join("."));
    if (top.length) u.searchParams.set("p", top.map(e=>`${e.id}~${e.score}`).join("."));
    u.searchParams.set("v","z1");
    return u.toString();
  }

  // ====== Ranks
  const RANKS = [
    {name:"Rookie", min:0},
    {name:"Runner", min:800},
    {name:"Slayer", min:1600},
    {name:"Warlord", min:2600},
    {name:"Doom", min:3800},
    {name:"Myth", min:5200},
  ];
  function rankFor(score){
    let r = RANKS[0].name;
    for (const it of RANKS) if (score >= it.min) r = it.name;
    return r;
  }

  // ====== State
  const parsed = parseUrl();
  const state = {
    mode: "menu", // intro/menu/play/over
    id: localStorage.getItem(LS.id) || "",
    best: Number(localStorage.getItem(LS.best) || "0"),
    runs: [],
    chain: parsed.chain,
    chainBoard: parsed.board,

    // game
    t: 60.0,
    score: 0,
    kills: 0,
    wave: 1,
    hp: 3,
    combo: 0,
    mult: 1,

    // cooldowns
    bombCd: 0,
    dashCd: 0,

    // input
    aimX: 0,
    aimY: 0,
    firing: false,

    // camera shake
    shake: 0,
  };

  try {
    state.runs = JSON.parse(localStorage.getItem(LS.runs) || "[]") || [];
    if (!Array.isArray(state.runs)) state.runs = [];
  } catch { state.runs = []; }

  // ====== Portrait only
  function checkOrientation(){
    document.body.classList.toggle("landscape", window.innerWidth > window.innerHeight);
  }
  window.addEventListener("resize", checkOrientation);
  window.addEventListener("orientationchange", checkOrientation);
  checkOrientation();

  // ====== Canvas setup
  const cv = ui.cv;
  const ctx = cv.getContext("2d", { alpha:true });

  const G = { w:0, h:0, dpr:1, last: performance.now() };
  function resize(){
    const r = cv.getBoundingClientRect();
    G.dpr = Math.min(2.25, window.devicePixelRatio || 1);
    cv.width = Math.floor(r.width * G.dpr);
    cv.height = Math.floor(r.height * G.dpr);
    G.w = cv.width; G.h = cv.height;
    state.aimX = G.w*0.5; state.aimY = G.h*0.35;
    player.x = G.w*0.5; player.y = G.h*0.78;
  }
  window.addEventListener("resize", resize);
  resize();

  // roundRect polyfill
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r){
      r = Math.min(r, w/2, h/2);
      this.beginPath();
      this.moveTo(x+r, y);
      this.arcTo(x+w, y, x+w, y+h, r);
      this.arcTo(x+w, y+h, x, y+h, r);
      this.arcTo(x, y+h, x, y, r);
      this.arcTo(x, y, x+w, y, r);
      this.closePath();
      return this;
    };
  }

  // ====== Entities
  const player = {
    x: G.w*0.5, y: G.h*0.78,
    r: 18,
    vx: 0, vy: 0,
    invuln: 0,
  };

  const bullets = [];
  const zombies = [];
  const particles = [];
  const pickups = [];

  function burst(x,y, n, color="g"){
    for (let i=0;i<n;i++){
      const a = rnd(0, Math.PI*2);
      const sp = rnd(120, 680) * G.dpr;
      particles.push({
        x,y,
        vx: Math.cos(a)*sp,
        vy: Math.sin(a)*sp,
        life: rnd(0.18, 0.65),
        t: 0,
        color,
        r: rnd(1.2, 3.2)*G.dpr
      });
    }
  }

  function spawnZombie(){
    const side = Math.random();
    const x = rnd(40, G.w-40);
    const y = -60 * G.dpr;

    // tougher with wave
    const hp = 1 + Math.floor((state.wave-1)/3);
    const sp = (85 + state.wave*6) * G.dpr;

    zombies.push({
      x, y,
      r: (16 + rnd(-2,2)) * G.dpr,
      hp,
      sp,
      wob: rnd(0, 10),
    });
  }

  function spawnPickup(x,y){
    // rare: serum heal or rage
    const roll = Math.random();
    const type = roll < 0.6 ? "serum" : "rage";
    pickups.push({ x, y, type, r: 12*G.dpr, t: 0 });
  }

  // ====== UI helpers
  function show(el, on){ el.classList.toggle("show", !!on); }

  function join(){
    if (state.id) return;
    state.id = makeId();
    localStorage.setItem(LS.id, state.id);
    toast(`ID: ${state.id}`);
    vibrate([10,30,10]);
    sfx(720, 0.05, "triangle", 0.06);
    syncMenu();
  }

  function hearts(hp){
    return "♥".repeat(Math.max(0,hp)) + "·".repeat(Math.max(0,3-hp));
  }

  function syncHUD(){
    ui.hudState.textContent = state.mode.toUpperCase();
    ui.hudHp.textContent = hearts(state.hp);
    ui.hudWave.textContent = String(state.wave);
    ui.hudTime.textContent = state.t.toFixed(1);
    ui.hudScore.textContent = String(Math.floor(state.score));
    ui.hudRank.textContent = rankFor(state.best);

    ui.bombCd.textContent = state.bombCd > 0 ? `${state.bombCd.toFixed(1)}s` : "READY";
    ui.dashCd.textContent = state.dashCd > 0 ? `${state.dashCd.toFixed(1)}s` : "READY";
  }

  function syncMenu(){
    ui.myId.textContent = state.id || "—";
    ui.best.textContent = String(state.best);
    ui.myRank.textContent = rankFor(state.best);
    ui.chain.textContent = String((state.id ? state.chain.length+1 : state.chain.length) || 0);
  }

  // ====== Leaderboards
  function renderBoards(){
    // local top
    const local = [...state.runs].sort((a,b)=>b.score-a.score).slice(0,10);
    ui.listLocal.innerHTML = local.length
      ? local.map((r,i)=>`
          <div class="item">
            <div>
              <div class="mono">#${i+1} ${new Date(r.ts).toLocaleDateString()} ${new Date(r.ts).toLocaleTimeString().slice(0,5)}</div>
              <div class="k">WAVE ${r.wave} · KILLS ${r.kills}</div>
            </div>
            <div class="badge">${r.score}</div>
          </div>
        `).join("")
      : `<div class="item"><div>Сыграй пару раз — тут появится топ.</div><div class="badge">—</div></div>`;

    // chain top (from URL)
    const chainMerged = mergeBoard(state.chainBoard, state.id ? [{id:state.id, score: state.best}] : []);
    chainMerged.sort((a,b)=>b.score-a.score);
    ui.listChain.innerHTML = chainMerged.length
      ? chainMerged.slice(0,10).map((e,i)=>`
          <div class="item">
            <div>
              <div class="mono">${e.id === state.id ? "YOU • " : ""}${e.id}</div>
              <div class="k">${rankFor(e.score)}</div>
            </div>
            <div class="badge">#${i+1} · ${e.score}</div>
          </div>
        `).join("")
      : `<div class="item"><div>Пока пусто. Выиграй и шарь ссылку.</div><div class="badge">—</div></div>`;
  }

  async function copyText(text){
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); ta.remove();
    }
    vibrate(10);
    sfx(760,0.04,"triangle",0.06);
  }

  async function shareOrCopy(url){
    const text = `☣ VIRAL LINK — побей мой рекорд: ${state.best}\n${url}`;
    try{
      if (navigator.share) await navigator.share({ title:"VIRAL LINK", text, url });
      else await copyText(url);
      toast("DONE");
    } catch {
      await copyText(url);
      toast("LINK COPIED");
    }
  }

  // ====== Game lifecycle
  function resetRun(){
    state.mode = "play";
    state.t = 60.0;
    state.score = 0;
    state.kills = 0;
    state.wave = 1;
    state.hp = 3;
    state.combo = 0;
    state.mult = 1;

    state.bombCd = 0;
    state.dashCd = 0;
    state.shake = 0;

    bullets.length = 0;
    zombies.length = 0;
    particles.length = 0;
    pickups.length = 0;

    player.x = G.w*0.5;
    player.y = G.h*0.78;
    player.vx = player.vy = 0;
    player.invuln = 0;

    spawnTimer = 0;
    fireTimer = 0;

    toast("GO!");
    sfx(520,0.05,"sine",0.05);
    vibrate(10);
  }

  function endRun(){
    state.mode = "over";

    const score = Math.floor(state.score);
    if (score > state.best) {
      state.best = score;
      localStorage.setItem(LS.best, String(state.best));
      toast("NEW BEST!");
      sfx(920,0.08,"triangle",0.08);
      vibrate([20,25,20]);
    }

    // store run local
    state.runs.push({ score, wave: state.wave, kills: state.kills, ts: Date.now() });
    state.runs = state.runs.slice(-80);
    localStorage.setItem(LS.runs, JSON.stringify(state.runs));

    // update chainBoard in memory (for rendering + sharing)
    if (state.id) {
      state.chainBoard = mergeBoard(state.chainBoard, [{ id: state.id, score: state.best }]);
    }

    ui.overScore.textContent = String(score);
    ui.overBest.textContent = String(state.best);
    ui.overRank.textContent = rankFor(state.best);
    ui.overKills.textContent = String(state.kills);

    show(ui.over, true);
    show(ui.menu, false);
    show(ui.how, false);
    show(ui.leaders, false);

    syncMenu();
  }

  // ====== Gameplay mechanics
  function fireBullet(){
    // direction from player to aim
    const dx = state.aimX - player.x;
    const dy = state.aimY - player.y;
    const len = Math.max(1, Math.hypot(dx,dy));
    const ux = dx/len, uy = dy/len;

    const sp = 720 * G.dpr;
    bullets.push({
      x: player.x + ux*22*G.dpr,
      y: player.y + uy*22*G.dpr,
      vx: ux*sp,
      vy: uy*sp,
      r: 3.2*G.dpr,
      life: 0.9,
      t: 0
    });

    // muzzle particles
    burst(player.x + ux*24*G.dpr, player.y + uy*24*G.dpr, 8, "c");
    sfx(560 + rnd(-40,40), 0.02, "square", 0.03);
  }

  function bomb(){
    if (state.bombCd > 0) return;
    state.bombCd = 9.5;

    // kill / damage near player
    const R = 130 * G.dpr;
    let killed = 0;

    for (let i=zombies.length-1;i>=0;i--){
      const z = zombies[i];
      if (dist2(player.x,player.y,z.x,z.y) <= R*R){
        zombies.splice(i,1);
        killed++;
        state.kills++;
        state.combo++;
        state.mult = 1 + clamp(state.combo,0,25)*0.05;
        state.score += 110 * state.mult;
        burst(z.x,z.y,24,"g");
        if (Math.random()<0.08) spawnPickup(z.x,z.y);
      }
    }

    state.shake = Math.min(1, state.shake + 0.55);
    burst(player.x, player.y, 70, "p");
    vibrate([20,40,20]);
    sfx(180,0.08,"sawtooth",0.06);

    toast(killed ? `BOMB: +${killed}` : "BOMB");
  }

  function dash(){
    if (state.dashCd > 0) return;
    state.dashCd = 6.5;

    // quick impulse away from aim (so you can dodge)
    const dx = state.aimX - player.x;
    const dy = state.aimY - player.y;
    const len = Math.max(1, Math.hypot(dx,dy));
    const ux = dx/len, uy = dy/len;

    // dash opposite direction
    player.vx += -ux * 22;
    player.vy += -uy * 22;
    player.invuln = Math.max(player.invuln, 0.65);

    burst(player.x, player.y, 26, "c");
    vibrate(10);
    sfx(820,0.03,"triangle",0.05);
  }

  let spawnTimer = 0;
  let fireTimer = 0;

  function step(dt, t){
    // background vibe: auto-play bg video muted
    if (ui.bgVideo && ui.bgVideo.paused) ui.bgVideo.play().catch(()=>{});

    // decay cooldowns
    state.bombCd = Math.max(0, state.bombCd - dt);
    state.dashCd = Math.max(0, state.dashCd - dt);
    player.invuln = Math.max(0, player.invuln - dt);

    // camera shake
    const sh = state.shake;
    state.shake = Math.max(0, state.shake - dt*3.2);

    ctx.save();
    if (sh > 0) ctx.translate(rnd(-1,1)*sh*10*G.dpr, rnd(-1,1)*sh*10*G.dpr);

    ctx.clearRect(0,0,G.w,G.h);

    // subtle vignette
    const gx = (Math.sin(t*0.0012)*0.5+0.5)*G.w;
    const gy = (Math.cos(t*0.0011)*0.5+0.5)*G.h;
    const grad = ctx.createRadialGradient(gx,gy,10,gx,gy,Math.max(G.w,G.h));
    grad.addColorStop(0,"rgba(125,255,204,0.10)");
    grad.addColorStop(0.6,"rgba(0,0,0,0)");
    grad.addColorStop(1,"rgba(0,0,0,0.55)");
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,G.w,G.h);

    // MENU idle look
    if (state.mode !== "play") {
      // draw player as decorative glow
      drawPlayer(t, true);
      drawParticles(dt);
      ctx.restore();
      syncHUD();
      return;
    }

    // time
    state.t = Math.max(0, state.t - dt);
    if (state.t <= 0) { endRun(); ctx.restore(); return; }

    // wave ramp
    const targetWave = 1 + Math.floor((60 - state.t) / 10);
    state.wave = Math.max(state.wave, targetWave);

    // spawn
    spawnTimer += dt;
    const rate = Math.max(0.10, 0.42 - state.wave*0.03); // faster with wave
    while (spawnTimer >= rate){
      spawnTimer -= rate;
      spawnZombie();
      if (state.wave >= 5 && Math.random() < 0.25) spawnZombie();
    }

    // player physics (light spring to center + dash impulse damping)
    player.vx *= (1 - dt*2.4);
    player.vy *= (1 - dt*2.4);
    player.x += player.vx * 60;
    player.y += player.vy * 60;
    player.x = clamp(player.x, 42*G.dpr, G.w - 42*G.dpr);
    player.y = clamp(player.y, 110*G.dpr, G.h - 92*G.dpr);

    // fire
    if (state.firing) {
      fireTimer += dt;
      const fireRate = 0.09; // bullets interval
      while (fireTimer >= fireRate){
        fireTimer -= fireRate;
        fireBullet();
      }
    } else {
      fireTimer = Math.min(fireTimer, 0.04);
    }

    // update bullets
    for (let i=bullets.length-1;i>=0;i--){
      const b = bullets[i];
      b.t += dt;
      if (b.t >= b.life) { bullets.splice(i,1); continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // trail
      if (Math.random() < 0.4) particles.push({
        x:b.x, y:b.y,
        vx:rnd(-80,80)*G.dpr, vy:rnd(-80,80)*G.dpr,
        life:rnd(0.12,0.28), t:0, color:"c", r:rnd(1,2.4)*G.dpr
      });

      // collision with zombies
      for (let j=zombies.length-1;j>=0;j--){
        const z = zombies[j];
        const rr = (z.r + b.r);
        if (dist2(b.x,b.y,z.x,z.y) <= rr*rr){
          bullets.splice(i,1);
          z.hp -= 1;
          burst(b.x,b.y,10,"c");
          if (z.hp <= 0) {
            zombies.splice(j,1);
            state.kills++;
            state.combo++;
            state.mult = 1 + clamp(state.combo,0,30)*0.05;
            state.score += (90 + state.wave*6) * state.mult;
            burst(z.x,z.y,28,"g");
            sfx(660 + rnd(-50,50), 0.03, "triangle", 0.05);
            vibrate(6);
            if (Math.random() < 0.06) spawnPickup(z.x,z.y);
          }
          break;
        }
      }
    }

    // update zombies
    for (let i=zombies.length-1;i>=0;i--){
      const z = zombies[i];
      const dx = player.x - z.x;
      const dy = player.y - z.y;
      const len = Math.max(1, Math.hypot(dx,dy));
      const ux = dx/len, uy = dy/len;
      const wob = Math.sin((t*0.001)*3 + z.wob) * 0.22;

      z.x += (ux + wob) * z.sp * dt;
      z.y += (uy - wob) * z.sp * dt;

      // hit player
      const rr = (z.r + player.r*G.dpr);
      if (dist2(z.x,z.y, player.x,player.y) <= rr*rr) {
        if (player.invuln <= 0) {
          state.hp -= 1;
          player.invuln = 0.85;
          state.combo = 0;
          state.mult = 1;
          state.shake = Math.min(1, state.shake + 0.45);
          burst(player.x, player.y, 36, "r");
          vibrate([15,40,15]);
          sfx(140,0.08,"sawtooth",0.06);
          toast(state.hp > 0 ? "HIT!" : "DOWN!");
          if (state.hp <= 0) { endRun(); ctx.restore(); return; }
        }
      }
    }

    // pickups
    for (let i=pickups.length-1;i>=0;i--){
      const p = pickups[i];
      p.t += dt;
      // float up a bit
      p.y += Math.sin((t*0.001)*4 + p.x*0.01) * 0.18 * G.dpr;

      const rr = (p.r + player.r*G.dpr);
      if (dist2(p.x,p.y, player.x,player.y) <= rr*rr) {
        pickups.splice(i,1);
        if (p.type === "serum") {
          state.hp = Math.min(3, state.hp+1);
          toast("SERUM +HP");
          burst(p.x,p.y,40,"g");
          sfx(880,0.05,"triangle",0.07);
          vibrate(10);
        } else {
          // rage: score boost
          toast("RAGE +SCORE");
          state.score += 240;
          burst(p.x,p.y,50,"p");
          sfx(980,0.06,"square",0.05);
          vibrate([10,20,10]);
        }
      }
      // despawn after some time
      if (p.t > 6.5) pickups.splice(i,1);
    }

    // draw entities (zombies then bullets then player)
    drawZombies(t);
    drawBullets(t);
    drawPickups(t);
    drawPlayer(t, false);
    drawParticles(dt);

    ctx.restore();
    syncHUD();
  }

  function drawPlayer(t, idle){
    const tt = t*0.001;
    const pulse = 1 + Math.sin(tt*8) * (idle ? 0.05 : 0.08);
    const r = player.r * G.dpr * pulse;

    // glow
    ctx.save();
    ctx.shadowBlur = 30*G.dpr;
    ctx.shadowColor = player.invuln>0 ? "rgba(86,214,255,0.35)" : "rgba(125,255,204,0.30)";

    const g = ctx.createRadialGradient(player.x,player.y, 3, player.x,player.y, r*2.3);
    g.addColorStop(0, player.invuln>0 ? "rgba(86,214,255,0.92)" : "rgba(125,255,204,0.95)");
    g.addColorStop(0.55, "rgba(26,242,166,0.50)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(player.x,player.y, r*1.35, 0, Math.PI*2); ctx.fill();

    // core
    ctx.shadowBlur = 12*G.dpr;
    ctx.shadowColor = "rgba(255,255,255,0.12)";
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.beginPath(); ctx.arc(player.x,player.y, r*0.55, 0, Math.PI*2); ctx.fill();

    // aim line
    if (!idle) {
      const dx = state.aimX - player.x;
      const dy = state.aimY - player.y;
      const len = Math.max(1, Math.hypot(dx,dy));
      const ux = dx/len, uy = dy/len;
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = "rgba(125,255,204,0.30)";
      ctx.lineWidth = 2*G.dpr;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.x + ux*120*G.dpr, player.y + uy*120*G.dpr);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawZombies(t){
    const tt = t*0.001;
    for (const z of zombies) {
      const wob = Math.sin(tt*6 + z.wob) * 0.12;
      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.rotate(wob);

      // glow outline (red)
      ctx.shadowBlur = 22*G.dpr;
      ctx.shadowColor = "rgba(255,59,110,0.26)";
      ctx.fillStyle = "rgba(255,59,110,0.86)";
      ctx.beginPath();
      ctx.arc(0,0, z.r*1.05, 0, Math.PI*2);
      ctx.fill();

      // inner body
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.arc(0,0, z.r*0.72, 0, Math.PI*2);
      ctx.fill();

      // eyes
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(-z.r*0.22, -z.r*0.12, z.r*0.10, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( z.r*0.22, -z.r*0.12, z.r*0.10, 0, Math.PI*2); ctx.fill();

      // hp ring for tough zombies
      if (z.hp > 1) {
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = "rgba(255,59,110,0.45)";
        ctx.lineWidth = 2*G.dpr;
        ctx.beginPath();
        ctx.arc(0,0, z.r*1.25, 0, Math.PI*2*(z.hp/3));
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  function drawBullets(){
    for (const b of bullets) {
      ctx.save();
      ctx.shadowBlur = 16*G.dpr;
      ctx.shadowColor = "rgba(86,214,255,0.22)";
      ctx.fillStyle = "rgba(86,214,255,0.92)";
      ctx.beginPath();
      ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPickups(t){
    const tt = t*0.001;
    for (const p of pickups) {
      ctx.save();
      const pulse = 1 + Math.sin(tt*8 + p.x*0.01)*0.08;
      const r = p.r*pulse;
      ctx.shadowBlur = 18*G.dpr;
      ctx.shadowColor = p.type==="serum" ? "rgba(125,255,204,0.22)" : "rgba(176,140,255,0.22)";
      ctx.fillStyle = p.type==="serum" ? "rgba(125,255,204,0.92)" : "rgba(176,140,255,0.92)";
      ctx.beginPath();
      ctx.roundRect(p.x-r*0.9, p.y-r*0.6, r*1.8, r*1.2, r*0.6);
      ctx.fill();

      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.roundRect(p.x-r*0.45, p.y-r*0.48, r*0.35, r*0.96, r*0.22);
      ctx.fill();

      ctx.restore();
    }
  }

  function drawParticles(dt){
    for (let i=particles.length-1;i>=0;i--){
      const p = particles[i];
      p.t += dt;
      const k = 1 - (p.t/p.life);
      if (k <= 0) { particles.splice(i,1); continue; }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= (1 - 2.2*dt);
      p.vy *= (1 - 2.2*dt);

      ctx.save();
      ctx.globalAlpha = k*0.9;

      let col = "rgba(125,255,204,0.9)";
      let glow = "rgba(125,255,204,0.22)";
      if (p.color==="c") { col="rgba(86,214,255,0.92)"; glow="rgba(86,214,255,0.22)"; }
      if (p.color==="p") { col="rgba(176,140,255,0.92)"; glow="rgba(176,140,255,0.22)"; }
      if (p.color==="r") { col="rgba(255,59,110,0.92)"; glow="rgba(255,59,110,0.22)"; }

      ctx.shadowBlur = 16*G.dpr;
      ctx.shadowColor = glow;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(p.x,p.y, p.r*(0.8+k*0.9), 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ====== Input: aim by moving finger anywhere on canvas
  function setAimFromEvent(e){
    const r = cv.getBoundingClientRect();
    state.aimX = (e.clientX - r.left) * G.dpr;
    state.aimY = (e.clientY - r.top) * G.dpr;
  }
  cv.addEventListener("pointerdown", (e)=>{
    cv.setPointerCapture(e.pointerId);
    ensureAudio(); // first interaction enables audio
    setAimFromEvent(e);
  });
  cv.addEventListener("pointermove", (e)=> setAimFromEvent(e));

  // Fire button hold
  ui.btnFire.addEventListener("pointerdown", ()=>{
    ensureAudio();
    state.firing = true;
  });
  ui.btnFire.addEventListener("pointerup", ()=> state.firing = false);
  ui.btnFire.addEventListener("pointercancel", ()=> state.firing = false);
  ui.btnFire.addEventListener("pointerleave", ()=> state.firing = false);

  ui.btnBomb.addEventListener("click", ()=> { ensureAudio(); if(state.mode==="play") bomb(); });
  ui.btnDash.addEventListener("click", ()=> { ensureAudio(); if(state.mode==="play") dash(); });

  // ====== UI buttons
  ui.btnJoin.addEventListener("click", join);

  ui.btnPlay.addEventListener("click", ()=>{
    ensureAudio();
    join();
    show(ui.menu,false);
    show(ui.how,false);
    show(ui.leaders,false);
    show(ui.over,false);
    resetRun();
    state.mode="play";
    syncHUD();
  });

  ui.btnMenu.addEventListener("click", ()=>{
    state.mode="menu";
    show(ui.over,false);
    show(ui.menu,true);
    syncMenu();
  });

  ui.btnAgain.addEventListener("click", ()=>{
    ensureAudio();
    show(ui.over,false);
    resetRun();
    state.mode="play";
  });

  ui.btnHow.addEventListener("click", ()=> show(ui.how,true));
  ui.btnHowBack.addEventListener("click", ()=> show(ui.how,false));

  ui.btnLeaders.addEventListener("click", ()=>{
    renderBoards();
    show(ui.leaders,true);
  });
  ui.btnLeadersBack.addEventListener("click", ()=> show(ui.leaders,false));

  ui.tabLocal.addEventListener("click", ()=>{
    ui.tabLocal.classList.add("on"); ui.tabChain.classList.remove("on");
    ui.listLocal.classList.remove("hidden"); ui.listChain.classList.add("hidden");
  });
  ui.tabChain.addEventListener("click", ()=>{
    ui.tabChain.classList.add("on"); ui.tabLocal.classList.remove("on");
    ui.listChain.classList.remove("hidden"); ui.listLocal.classList.add("hidden");
  });

  ui.btnCopyBoard.addEventListener("click", async ()=>{
    const local = [...state.runs].sort((a,b)=>b.score-a.score).slice(0,10);
    const txt = local.map((r,i)=>`#${i+1} ${r.score} (W${r.wave} K${r.kills})`).join("\n");
    await copyText(txt || "EMPTY");
    toast("COPIED");
  });

  ui.btnReset.addEventListener("click", ()=>{
    state.runs = [];
    localStorage.removeItem(LS.runs);
    toast("RESET");
    renderBoards();
  });

  ui.btnSound.addEventListener("click", ()=>{
    soundOn = !soundOn;
    localStorage.setItem(LS.sound, soundOn ? "1" : "0");
    ui.btnSound.textContent = soundOn ? "SOUND: ON" : "SOUND: OFF";
    toast(soundOn ? "SOUND ON" : "SOUND OFF");
  });
  ui.btnSound.textContent = soundOn ? "SOUND: ON" : "SOUND: OFF";

  ui.btnShare.addEventListener("click", ()=>{
    const link = buildShareLink({ id: state.id, score: state.best });
    shareOrCopy(link);
  });
  ui.btnCopyLink.addEventListener("click", async ()=>{
    const link = buildShareLink({ id: state.id, score: state.best });
    await copyText(link);
    toast("LINK COPIED");
  });

  // ====== INTRO behavior (shows immediately)
  function startIntroMuted(){
    // video can autoplay muted
    try {
      ui.introVideo.muted = true;
      ui.introVideo.play().catch(()=>{});
    } catch {}
  }
  function leaveIntroToMenu(){
    show(ui.intro, false);
    show(ui.menu, true);
    state.mode = "menu";
    syncMenu();
    syncHUD();
  }

  ui.btnSkipIntro.addEventListener("click", ()=>{
    try{ ui.introVideo.pause(); } catch {}
    leaveIntroToMenu();
  });

  ui.btnStartSound.addEventListener("click", ()=>{
    // First user gesture => we can unmute + play with sound
    ensureAudio();
    try {
      ui.introVideo.muted = false;
      ui.introVideo.play().catch(()=>{});
    } catch {}
    sfx(740,0.05,"triangle",0.06);
    // after a short moment, go menu (or wait end)
    setTimeout(()=>leaveIntroToMenu(), 850);
  });

  ui.introVideo.addEventListener("ended", leaveIntroToMenu);

  // ====== Main loop
  function loop(t){
    const dt = clamp((t - G.last)/1000, 0, 0.033);
    G.last = t;
    step(dt, t);
    syncHUD();
    requestAnimationFrame(loop);
  }

  // ====== Boot
  function boot(){
    // try play bg video muted
    ui.bgVideo?.play().catch(()=>{});
    // intro appears immediately
    show(ui.intro, true);
    show(ui.menu, false);
    startIntroMuted();

    // auto join not forced; but you can
    syncMenu();
    syncHUD();

    // merge chain board with your best
    if (state.id) state.chainBoard = mergeBoard(state.chainBoard, [{id:state.id, score: state.best}]);

    requestAnimationFrame(loop);
  }

  // PWA service worker
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

  boot();
})();
