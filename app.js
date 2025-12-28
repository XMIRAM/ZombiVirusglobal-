(() => {
  const $ = (s) => document.querySelector(s);

  const els = {
    screenHome: $("#screenHome"),
    screenGame: $("#screenGame"),
    screenTrace: $("#screenTrace"),

    btnJoin: $("#btnJoin"),
    btnPlay: $("#btnPlay"),
    btnTrace: $("#btnTrace"),
    btnBackFromGame: $("#btnBackFromGame"),
    btnBackFromTrace: $("#btnBackFromTrace"),

    statusText: $("#statusText"),
    caseText: $("#caseText"),
    fromText: $("#fromText"),
    chainLenText: $("#chainLenText"),

    myIdText: $("#myIdText"),
    myCaseNumText: $("#myCaseNumText"),
    chainList: $("#chainList"),

    btnShare: $("#btnShare"),
    btnCopy: $("#btnCopy"),
    btnCopyTrace: $("#btnCopyTrace"),
    btnReset: $("#btnReset"),

    meterFill: $("#meterFill"),
    meterPct: $("#meterPct"),
    tapZone: $("#tapZone"),
    timerText: $("#timerText"),

    toast: $("#toast"),
    btnSound: $("#btnSound"),
  };

  const LS = {
    myId: "vl_myId",
    receivedChain: "vl_receivedChain",
    spreadCount: "vl_spreadCount",
    sound: "vl_sound",
  };

  const state = {
    myId: localStorage.getItem(LS.myId) || "",
    receivedChain: [],
    sound: (localStorage.getItem(LS.sound) ?? "1") === "1",
    spreadCount: Number(localStorage.getItem(LS.spreadCount) || "0"),
    // game
    load: 0,
    unlocked: false,
    playing: false,
    tLeft: 30.0,
    decayTimer: null,
    gameTimer: null,
  };

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.remove("show"), 1400);
  }

  function vibrate(pattern = 10) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function beep(freq = 520, dur = 0.03) {
    if (!state.sound) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.value = 0.06;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + dur);
      setTimeout(() => ctx.close(), 120);
    } catch { /* ignore */ }
  }

  function makeId() {
    // короткий, удобный для URL
    const t = Date.now().toString(36).slice(-6);
    const r = Math.random().toString(36).slice(2, 6);
    return (t + r).toUpperCase();
  }

  function parseIncomingChain() {
    const url = new URL(window.location.href);
    const c = url.searchParams.get("c");
    const from = url.searchParams.get("from");

    let chain = [];
    if (c) {
      chain = c.split(".").map(s => s.trim()).filter(Boolean).slice(0, 250);
    } else if (from) {
      chain = [from.trim()].filter(Boolean);
    }

    // sanitize: only [A-Z0-9]
    chain = chain.map(x => x.replace(/[^A-Z0-9]/gi, "").toUpperCase()).filter(Boolean);

    // store only if it exists
    if (chain.length) {
      state.receivedChain = chain;
      localStorage.setItem(LS.receivedChain, JSON.stringify(chain));
    } else {
      // fallback to stored
      try {
        const stored = JSON.parse(localStorage.getItem(LS.receivedChain) || "[]");
        state.receivedChain = Array.isArray(stored) ? stored : [];
      } catch {
        state.receivedChain = [];
      }
    }
  }

  function getInfectorId() {
    return state.receivedChain.length ? state.receivedChain[state.receivedChain.length - 1] : "";
  }

  function myCaseNum() {
    // номер кейса внутри цепочки
    // если пришёл по цепочке длиной N (инфекторы), ты становишься N+1
    return state.receivedChain.length + 1;
  }

  function fullChainIncludingMe() {
    const chain = [...state.receivedChain];
    if (state.myId) chain.push(state.myId);
    // optional: cap
    return chain.slice(0, 260);
  }

  function buildShareLink() {
    const url = new URL(window.location.href);
    url.search = "";
    const chainToSend = [...state.receivedChain];
    if (state.myId) chainToSend.push(state.myId);
    // keep URL compact
    url.searchParams.set("c", chainToSend.join("."));
    url.searchParams.set("v", "1");
    return url.toString();
  }

  function setScreen(name) {
    [els.screenHome, els.screenGame, els.screenTrace].forEach(s => s.classList.remove("active"));
    if (name === "home") els.screenHome.classList.add("active");
    if (name === "game") els.screenGame.classList.add("active");
    if (name === "trace") els.screenTrace.classList.add("active");
  }

  function updateHomeUI() {
    const infectedBy = getInfectorId();
    const isActive = !!state.myId;

    els.statusText.textContent = isActive ? "Активирован" : "Не активирован";
    els.caseText.textContent = isActive ? `CASE #${myCaseNum()} • ${state.myId}` : "—";
    els.fromText.textContent = infectedBy ? infectedBy : "PATIENT ZERO";
    els.chainLenText.textContent = String(fullChainIncludingMe().length);

    els.btnJoin.textContent = isActive ? "Infection ID уже есть" : "Получить Infection ID";
    els.btnJoin.disabled = isActive;
  }

  function renderTrace() {
    els.myIdText.textContent = state.myId || "—";
    els.myCaseNumText.textContent = state.myId ? `CASE #${myCaseNum()}` : "—";

    const chain = fullChainIncludingMe();
    els.chainList.innerHTML = "";

    if (!chain.length) {
      els.chainList.innerHTML = `<div class="tiny dim">Цепочки пока нет. Открой игру по ссылке от друга или нажми Join.</div>`;
      return;
    }

    chain.forEach((id, idx) => {
      const isMe = state.myId && idx === chain.length - 1 && id === state.myId;
      const badge = isMe ? "YOU" : `#${idx + 1}`;
      const div = document.createElement("div");
      div.className = "chainItem";
      div.innerHTML = `
        <div class="mono">${id}</div>
        <div class="chainBadge">${badge}</div>
      `;
      els.chainList.appendChild(div);
    });
  }

  function setMeter(pct) {
    const p = Math.max(0, Math.min(100, pct));
    els.meterFill.style.width = `${p}%`;
    els.meterPct.textContent = `${Math.round(p)}%`;
  }

  function resetGame() {
    state.load = 0;
    state.unlocked = false;
    state.playing = false;
    state.tLeft = 30.0;
    setMeter(0);
    els.timerText.textContent = state.tLeft.toFixed(1);
    els.btnShare.disabled = true;

    clearInterval(state.decayTimer);
    clearInterval(state.gameTimer);
    state.decayTimer = null;
    state.gameTimer = null;
  }

  function startGame() {
    resetGame();
    state.playing = true;

    // decay
    state.decayTimer = setInterval(() => {
      if (!state.playing) return;
      if (state.unlocked) return;
      state.load = Math.max(0, state.load - 0.9);
      setMeter(state.load);
    }, 80);

    // countdown
    state.gameTimer = setInterval(() => {
      if (!state.playing) return;
      state.tLeft = Math.max(0, state.tLeft - 0.1);
      els.timerText.textContent = state.tLeft.toFixed(1);
      if (state.tLeft <= 0) {
        state.playing = false;
        clearInterval(state.decayTimer);
        clearInterval(state.gameTimer);
        if (!state.unlocked) toast("Время вышло. Ещё раз!");
      }
    }, 100);
  }

  function boostLoad() {
    if (!state.myId) {
      toast("Сначала получи Infection ID");
      beep(280, 0.05);
      return;
    }
    if (!state.playing) startGame();
    if (state.unlocked) return;

    state.load = Math.min(100, state.load + 4.2);
    setMeter(state.load);
    vibrate(8);
    beep(640, 0.02);

    if (state.load >= 100) {
      state.unlocked = true;
      els.btnShare.disabled = false;
      toast("UNLOCKED: теперь можешь заразить друга");
      vibrate([20, 30, 20]);
      beep(880, 0.05);
    }
  }

  async function doShare() {
    if (!state.myId) return toast("Сначала Join");
    if (!state.unlocked) return toast("Набери 100% Viral Load");

    const link = buildShareLink();
    const text = `☣ VIRAL LINK: открой и получи свой Infection ID\n${link}`;

    // stats
    state.spreadCount += 1;
    localStorage.setItem(LS.spreadCount, String(state.spreadCount));

    try {
      if (navigator.share) {
        await navigator.share({ title: "VIRAL LINK", text, url: link });
        toast("Отправлено");
      } else {
        await navigator.clipboard.writeText(link);
        toast("Ссылка скопирована");
      }
    } catch {
      // user cancelled / blocked
      await copy(link);
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Скопировано");
      vibrate(10);
      beep(720, 0.03);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("Скопировано");
    }
  }

  function join() {
    if (state.myId) return;
    state.myId = makeId();
    localStorage.setItem(LS.myId, state.myId);
    toast(`Твой ID: ${state.myId}`);
    vibrate([10, 40, 10]);
    beep(760, 0.05);
    updateHomeUI();
  }

  function resetAll() {
    localStorage.removeItem(LS.myId);
    localStorage.removeItem(LS.receivedChain);
    localStorage.removeItem(LS.spreadCount);
    state.myId = "";
    state.receivedChain = [];
    state.spreadCount = 0;
    resetGame();
    updateHomeUI();
    renderTrace();
    toast("Сброшено");
  }

  function checkOrientation() {
    const isLandscape = window.innerWidth > window.innerHeight;
    document.body.classList.toggle("landscape", isLandscape);
  }

  function initPWA() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  function wire() {
    els.btnJoin.addEventListener("click", join);

    els.btnPlay.addEventListener("click", () => {
      setScreen("game");
      resetGame();
      toast("Тапай по зоне");
    });

    els.btnTrace.addEventListener("click", () => {
      setScreen("trace");
      renderTrace();
    });

    els.btnBackFromGame.addEventListener("click", () => {
      setScreen("home");
      resetGame();
    });

    els.btnBackFromTrace.addEventListener("click", () => {
      setScreen("home");
    });

    els.tapZone.addEventListener("click", boostLoad);
    els.tapZone.addEventListener("touchstart", (e) => { e.preventDefault(); boostLoad(); }, { passive: false });
    els.tapZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") boostLoad();
    });

    els.btnShare.addEventListener("click", doShare);
    els.btnCopy.addEventListener("click", async () => copy(buildShareLink()));

    els.btnCopyTrace.addEventListener("click", async () => {
      const chain = fullChainIncludingMe();
      if (!chain.length) return toast("Пока нечего копировать");
      await copy(chain.join(" -> "));
    });

    els.btnReset.addEventListener("click", resetAll);

    els.btnSound.addEventListener("click", () => {
      state.sound = !state.sound;
      localStorage.setItem(LS.sound, state.sound ? "1" : "0");
      els.btnSound.querySelector(".icon").textContent = state.sound ? "🔊" : "🔇";
      toast(state.sound ? "Звук: ON" : "Звук: OFF");
    });

    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);
    checkOrientation();
  }

  // boot
  parseIncomingChain();
  updateHomeUI();
  initPWA();
  wire();
})();
