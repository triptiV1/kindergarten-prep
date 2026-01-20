const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = "kids_learning_v1";

const DEFAULT_STATE = {
  voiceOn: true,
  progress: {
    colors: { stars: 0, done: 0 },
    counting: { stars: 0, done: 0 },
    letters: { stars: 0, done: 0 },
    prep: { stars: 0, done: 0, stepIndex: 0 },
  },
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      progress: {
        ...structuredClone(DEFAULT_STATE.progress),
        ...(parsed.progress || {}),
      },
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    if (el.textContent === msg) el.textContent = "";
  }, 1600);
}

function createSpeechManager() {
  const apiOk = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  let unlocked = false;
  let ready = false;
  let voice = null;
  let lastSpoken = { text: "", at: 0 };

  function getVoices() {
    if (!apiOk) return [];
    try {
      return window.speechSynthesis.getVoices() || [];
    } catch {
      return [];
    }
  }

  function pickVoice(voices) {
    if (!voices.length) return null;
    return (
      voices.find((v) => /en-US/i.test(v.lang) && /Samantha/i.test(v.name)) ||
      voices.find((v) => /en-US/i.test(v.lang)) ||
      voices.find((v) => /en/i.test(v.lang)) ||
      voices[0]
    );
  }

  function init() {
    if (!apiOk) return;
    const voices = getVoices();
    voice = pickVoice(voices);
    ready = voices.length > 0;
  }

  function status() {
    return {
      apiOk,
      unlocked,
      ready,
      voices: getVoices().length,
      voiceName: voice ? `${voice.name} (${voice.lang})` : "(none)",
    };
  }

  function unlock() {
    if (!apiOk) return false;
    unlocked = true;
    init();
    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch {
      return false;
    }
    return true;
  }

  function speak(text, { force = false } = {}) {
    if (!apiOk) return { ok: false, reason: "unsupported" };
    if (!state.voiceOn) return { ok: false, reason: "off" };
    if (!unlocked) return { ok: false, reason: "locked" };

    const now = Date.now();
    if (!force && text === lastSpoken.text && now - lastSpoken.at < 350) {
      return { ok: true, reason: "deduped" };
    }
    lastSpoken = { text, at: now };

    init();

    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      // Do not cancel constantly; Safari can become silent. Only cancel if it's already speaking.
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.pitch = 1.1;
      u.volume = 1.0;
      u.onerror = () => {
        toast("Voice blocked or unavailable");
        const hint = $("#voiceHint");
        if (hint) {
          hint.textContent =
            "Voice may be blocked. Try turning off Silent mode, raising volume, or using Chrome on iPhone.";
        }
      };
      window.speechSynthesis.speak(u);
      return { ok: true, reason: "spoken" };
    } catch {
      return { ok: false, reason: "error" };
    }
  }

  if (apiOk) {
    try {
      window.speechSynthesis.onvoiceschanged = () => {
        init();
      };
    } catch {
      // ignore
    }
    init();
  }

  return { status, unlock, speak };
}

const speech = createSpeechManager();

function speak(text, opts) {
  speech.speak(text, opts);
}

function beep(ok) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, ok ? 120 : 220);
  } catch {
    return;
  }
}

function setScreen(id) {
  $$(".screen").forEach((s) => s.classList.remove("screen--active"));
  $("#" + id).classList.add("screen--active");
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function starsText(n) {
  const k = clamp(n, 0, 50);
  return "Stars: " + "★".repeat(k) + "☆".repeat(Math.max(0, 10 - k));
}

function updateHomeMeta() {
  $("#metaColors").textContent = `${state.progress.colors.done} done · ${state.progress.colors.stars} stars`;
  $("#metaCounting").textContent = `${state.progress.counting.done} done · ${state.progress.counting.stars} stars`;
  $("#metaLetters").textContent = `${state.progress.letters.done} done · ${state.progress.letters.stars} stars`;
  $("#metaPrep").textContent = `${state.progress.prep.done} done · ${state.progress.prep.stars} stars`;

  const hint = $("#voiceHint");
  if (!canSpeak()) {
    hint.textContent = "Voice may not be available in this browser.";
  } else {
    hint.textContent = "Tip: Tap a game. The app will speak the question. If not, tap Test Voice.";
  }

  const soundBtn = $("#soundBtn");
  soundBtn.textContent = `Voice: ${state.voiceOn ? "On" : "Off"}`;
  soundBtn.setAttribute("aria-pressed", String(state.voiceOn));
}

const COLORS = [
  { name: "red", hex: "#ff4d6d" },
  { name: "blue", hex: "#4dabff" },
  { name: "yellow", hex: "#ffd24d" },
  { name: "green", hex: "#2de2a6" },
  { name: "purple", hex: "#b07cff" },
  { name: "orange", hex: "#ff9f43" },
];

const SHAPES = ["circle", "square", "triangle", "star"];

function randInt(max) {
  return Math.floor(Math.random() * max);
}

function pickDifferent(arr, notIdx) {
  let i = randInt(arr.length);
  if (arr.length <= 1) return i;
  while (i === notIdx) i = randInt(arr.length);
  return i;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeShapeEl(shape, colorHex) {
  if (shape === "triangle") {
    const el = document.createElement("div");
    el.className = "shape shape--triangle";
    el.style.borderBottomColor = colorHex;
    return el;
  }

  if (shape === "star") {
    const el = document.createElement("div");
    el.className = "shape shape--star";
    el.style.borderBottomColor = colorHex;
    el.style.color = colorHex;
    return el;
  }

  const el = document.createElement("div");
  el.className = `shape shape--${shape}`;
  el.style.background = colorHex;
  return el;
}

let colorsTask = null;

function newColorsTask() {
  const targetColorIdx = randInt(COLORS.length);
  const targetShapeIdx = randInt(SHAPES.length);
  const targetColor = COLORS[targetColorIdx];
  const targetShape = SHAPES[targetShapeIdx];

  const distractorColorIdx = pickDifferent(COLORS, targetColorIdx);
  const distractorShapeIdx = pickDifferent(SHAPES, targetShapeIdx);

  const options = shuffle([
    { color: targetColor, shape: targetShape, correct: true },
    { color: COLORS[distractorColorIdx], shape: targetShape, correct: false },
    { color: targetColor, shape: SHAPES[distractorShapeIdx], correct: false },
    { color: COLORS[distractorColorIdx], shape: SHAPES[distractorShapeIdx], correct: false },
  ]);

  return { targetColor, targetShape, options };
}

function renderColors() {
  colorsTask = newColorsTask();

  const prompt = `Tap the ${colorsTask.targetColor.name} ${colorsTask.targetShape}.`;
  $("#colorsPrompt").textContent = prompt;
  speak(prompt);

  const arena = $("#colorsArena");
  arena.innerHTML = "";

  colorsTask.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bigChoice";
    btn.setAttribute("aria-label", `${opt.color.name} ${opt.shape}`);

    const shapeEl = makeShapeEl(opt.shape, opt.color.hex);
    btn.appendChild(shapeEl);

    btn.addEventListener("click", () => {
      if (opt.correct) {
        beep(true);
        toast("Great job!");
        state.progress.colors.stars += 1;
        state.progress.colors.done += 1;
        saveState();
        updateProgressUI();
        renderColors();
      } else {
        beep(false);
        toast("Try again");
        speak("Try again");
      }
    });

    arena.appendChild(btn);
  });
}

let countingTask = null;

const COUNT_EMOJI = ["🍎", "⭐", "🐟", "🍪", "🧸", "🟦", "🚗", "🌼"]; // visual variety

function newCountingTask() {
  const count = randInt(5) + 1; // 1..5 for ages 3-5
  const emoji = COUNT_EMOJI[randInt(COUNT_EMOJI.length)];

  const correct = count;
  const choices = shuffle(
    Array.from(new Set([correct, clamp(correct - 1, 1, 5), clamp(correct + 1, 1, 5), randInt(5) + 1]))
  ).slice(0, 4);

  while (choices.length < 4) {
    const n = randInt(5) + 1;
    if (!choices.includes(n)) choices.push(n);
  }

  return { count, emoji, choices: shuffle(choices) };
}

function renderCounting() {
  countingTask = newCountingTask();
  const prompt = "How many do you see?";
  $("#countingPrompt").textContent = prompt;
  speak(prompt);

  const items = $("#countingItems");
  items.innerHTML = "";
  items.setAttribute("aria-hidden", "true");

  for (let i = 0; i < countingTask.count; i++) {
    const it = document.createElement("div");
    it.className = "item";
    it.textContent = countingTask.emoji;
    items.appendChild(it);
  }

  const choicesEl = $("#countingChoices");
  choicesEl.innerHTML = "";

  countingTask.choices.forEach((n) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choiceBtn";
    btn.textContent = String(n);
    btn.addEventListener("click", () => {
      if (n === countingTask.count) {
        beep(true);
        toast("Yes!");
        speak("Yes!");
        state.progress.counting.stars += 1;
        state.progress.counting.done += 1;
        saveState();
        updateProgressUI();
        renderCounting();
      } else {
        beep(false);
        toast("Try again");
        speak("Try again");
      }
    });
    choicesEl.appendChild(btn);
  });
}

let lettersTask = null;

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function newLettersTask() {
  const targetIdx = randInt(LETTERS.length);
  const target = LETTERS[targetIdx];

  const pool = new Set([target]);
  while (pool.size < 4) {
    pool.add(LETTERS[randInt(LETTERS.length)]);
  }

  return { target, choices: shuffle(Array.from(pool)) };
}

function renderLetters() {
  lettersTask = newLettersTask();
  const prompt = `Find the letter ${lettersTask.target}.`;
  $("#lettersPrompt").textContent = prompt;
  speak(prompt);

  const choicesEl = $("#lettersChoices");
  choicesEl.innerHTML = "";

  lettersTask.choices.forEach((ch) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choiceBtn";
    btn.textContent = ch;
    btn.addEventListener("click", () => {
      if (ch === lettersTask.target) {
        beep(true);
        toast("Nice!");
        speak("Nice!");
        state.progress.letters.stars += 1;
        state.progress.letters.done += 1;
        saveState();
        updateProgressUI();
        renderLetters();
      } else {
        beep(false);
        toast("Try again");
        speak("Try again");
      }
    });
    choicesEl.appendChild(btn);
  });
}

const PREP_STEPS = [
  {
    title: "Colors",
    desc: "Tap the Colors & Shapes game. Find the color I ask for.",
    start: () => {
      setScreen("colors");
      renderColors();
    },
  },
  {
    title: "Counting",
    desc: "Tap the Counting game. Count up to 5.",
    start: () => {
      setScreen("counting");
      renderCounting();
    },
  },
  {
    title: "Letters",
    desc: "Tap the Letters game. Find the letter I ask for.",
    start: () => {
      setScreen("letters");
      renderLetters();
    },
  },
];

function renderPrep() {
  const stepIndex = clamp(state.progress.prep.stepIndex, 0, PREP_STEPS.length - 1);
  state.progress.prep.stepIndex = stepIndex;
  saveState();

  const step = PREP_STEPS[stepIndex];
  const prompt = `Kindergarten Prep: ${step.title}.`;

  $("#prepPrompt").textContent = prompt;
  $("#prepStep").textContent = step.desc;
  speak(prompt + " " + step.desc);

  $("#prepStart").style.display = "inline-block";
  $("#prepNext").style.display = "inline-block";
}

function updateProgressUI() {
  $("#colorsStars").textContent = starsText(state.progress.colors.stars);
  $("#countingStars").textContent = starsText(state.progress.counting.stars);
  $("#lettersStars").textContent = starsText(state.progress.letters.stars);
  $("#prepStars").textContent = starsText(state.progress.prep.stars);
  updateHomeMeta();
}

function handleHomeNav() {
  $$("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-nav");
      setScreen(target);
      if (target === "colors") renderColors();
      if (target === "counting") renderCounting();
      if (target === "letters") renderLetters();
      if (target === "prep") renderPrep();
    });
  });

  $$("[data-home]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setScreen("home");
      speak("Home");
      updateHomeMeta();
    });
  });
}

function wireButtons() {
  $("#soundBtn").addEventListener("click", () => {
    state.voiceOn = !state.voiceOn;
    saveState();
    updateHomeMeta();
    toast(state.voiceOn ? "Voice on" : "Voice off");
    if (state.voiceOn) speak("Voice on");
  });

  $("#resetBtn").addEventListener("click", () => {
    const ok = window.confirm("Reset stars and progress on this device?");
    if (!ok) return;
    state = structuredClone(DEFAULT_STATE);
    saveState();
    updateProgressUI();
    toast("Reset!");
    speak("Reset");
  });

  $("#colorsNext").addEventListener("click", () => renderColors());
  $("#countingNext").addEventListener("click", () => renderCounting());
  $("#lettersNext").addEventListener("click", () => renderLetters());

  const testBtn = $("#testVoiceBtn");
  if (testBtn) {
    testBtn.addEventListener("click", () => {
      if (!canSpeak()) {
        toast("Voice not supported");
        return;
      }

      try {
        initVoices();
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        const msg = "Hello! Voice is working.";
        // Call speak directly from the button gesture.
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(msg);
        if (preferredVoice) u.voice = preferredVoice;
        u.rate = 0.95;
        u.pitch = 1.1;
        u.volume = 1.0;
        u.onerror = () => {
          toast("Voice blocked in browser settings");
          const hint = $("#voiceHint");
          if (hint) hint.textContent = "Voice may be blocked. Try Safari/Chrome settings, turn off Silent mode, or tap again.";
        };
        window.speechSynthesis.speak(u);
        toast("Testing voice...");
      } catch {
        toast("Voice failed");
      }
    });
  }

  $("#prepStart").addEventListener("click", () => {
    const stepIndex = clamp(state.progress.prep.stepIndex, 0, PREP_STEPS.length - 1);
    PREP_STEPS[stepIndex].start();
    state.progress.prep.stars += 1;
    state.progress.prep.done += 1;
    saveState();
    updateProgressUI();
  });

  $("#prepNext").addEventListener("click", () => {
    state.progress.prep.stepIndex = (state.progress.prep.stepIndex + 1) % PREP_STEPS.length;
    saveState();
    renderPrep();
  });
}

function init() {
  handleHomeNav();
  wireButtons();
  updateProgressUI();
  setScreen("home");
  updateHomeMeta();

  // On some browsers, speech may require first user gesture.
  // The app naturally speaks after taps.

  document.addEventListener(
    "pointerdown",
    () => {
      if (!canSpeak()) return;
      try {
        initVoices();
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      } catch {
        return;
      }
    },
    { once: true }
  );
}

init();
