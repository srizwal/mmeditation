import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  mmeditation — a quiet window to the sky                            */
/*                                                                     */
/*  Single-file build. Sections are grouped so each block below maps   */
/*  1:1 to a component file in a Vite project:                         */
/*    data/meditations.js  components/Header.jsx  BreathingCircle.jsx  */
/*    MeditationTimer.jsx  DurationSelector.jsx  MeditationCard.jsx    */
/*    MeditationStep.jsx   MeditationControls.jsx  MoodSelector.jsx    */
/*    ProgressDashboard.jsx  pages/{Home,Meditations,Progress,About}   */
/* ------------------------------------------------------------------ */

/* ============================ DATA ================================= */

const MEDITATIONS = [
  {
    id: "beginner",
    name: "Beginner Meditation",
    short: "Beginner",
    tagline: "Learn the basics.",
    description:
      "A gentle meditation to help you slow down and reconnect with your breath.",
    difficulty: "Beginner",
    goals: ["Beginner", "Mindfulness"],
  },
  {
    id: "breathing",
    name: "Mindful Breathing",
    short: "Breathing",
    tagline: "Reconnect with your breath.",
    description:
      "Five quiet minutes following the breath in, the pause, and the breath out.",
    difficulty: "Beginner",
    goals: ["Relaxation", "Mindfulness"],
  },
  {
    id: "focus",
    name: "Focus",
    short: "Focus",
    tagline: "Improve your attention.",
    description:
      "Settle a scattered mind by returning, again and again, to one steady point.",
    difficulty: "Intermediate",
    goals: ["Focus", "Mindfulness"],
  },
  {
    id: "stress",
    name: "Stress Relief",
    short: "Stress Relief",
    tagline: "Calm your mind.",
    description:
      "A longer exhale to soften tension in the shoulders, jaw, and chest.",
    difficulty: "Beginner",
    goals: ["Stress", "Relaxation"],
  },
  {
    id: "sleep",
    name: "Sleep",
    short: "Sleep",
    tagline: "Prepare for restful sleep.",
    description:
      "Slow the breath and let the day go, one quiet exhale at a time.",
    difficulty: "Beginner",
    goals: ["Sleep", "Relaxation"],
  },
];

/* The guidance runs on fixed clock time. After the last spoken step the
   session simply stays open — the timer keeps counting up and the person
   finishes when they are ready. There is no end time. */
const STEPS = (() => {
  const shape = [
    {
      key: "arrive",
      label: "Arrive",
      title: "Get comfortable",
      instruction:
        "Find a comfortable position. Relax your shoulders. Let your hands rest naturally. Allow your body to become still.",
      duration: 30,
    },
    {
      key: "breathe",
      label: "Breathe",
      title: "Follow your breath",
      instruction: "Bring your attention to your natural breathing.",
      duration: 120,
    },
    {
      key: "observe",
      label: "Observe",
      title: "Notice your thoughts",
      instruction:
        "Thoughts may appear. You don't need to stop them. Simply notice them and gently bring your attention back to your breath.",
      duration: 120,
    },
    {
      key: "present",
      label: "Present",
      title: "Be present",
      instruction:
        "Feel your body. Notice your breathing. Listen to the sounds around you. Simply be here.",
      duration: 30,
    },
    {
      key: "open",
      label: "Open",
      title: "Stay as long as you like",
      instruction:
        "The guidance ends here. Keep following your breath for as long as it feels right, and finish whenever you are ready.",
      duration: Infinity,
    },
  ];
  let start = 0;
  return shape.map((s) => {
    const step = { ...s, start: start, end: start + s.duration };
    start += s.duration;
    return step;
  });
})();

function stepAt(seconds) {
  const i = STEPS.findIndex((s) => seconds < s.end);
  return i === -1 ? STEPS.length - 1 : i;
}

const BREATH_PHASES = [
  { key: "in", label: "Breathe in", ms: 4000, scale: 1 },
  { key: "hold", label: "Hold", ms: 2000, scale: 1 },
  { key: "out", label: "Breathe out", ms: 6000, scale: 0.7 },
];

const MOODS = [
  { emoji: "😌", label: "Peaceful" },
  { emoji: "🙂", label: "Good" },
  { emoji: "😐", label: "Neutral" },
  { emoji: "😴", label: "Relaxed" },
];

/* Ambient sounds. Everything is synthesised in the browser with the Web
   Audio API — shaped noise, no audio files, so it works offline and loops
   forever without a seam. */
const SOUNDS = [
  {
    id: "rain",
    name: "Rain",
    description: "Steady rainfall, close and even.",
    noise: "white",
    filter: { type: "lowpass", freq: 2100, q: 0.7 },
    sway: { rate: 0.07, depth: 0.08 },
    level: 0.32,
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Slow waves arriving and drawing back.",
    noise: "brown",
    filter: { type: "lowpass", freq: 620, q: 0.5 },
    sway: { rate: 0.06, depth: 0.5 },
    level: 0.6,
  },
  {
    id: "wind",
    name: "Wind",
    description: "Air moving across an open field.",
    noise: "brown",
    filter: { type: "lowpass", freq: 950, q: 0.3 },
    sway: { rate: 0.05, depth: 0.28 },
    level: 0.5,
  },
  {
    id: "stream",
    name: "Stream",
    description: "Water running over stones.",
    noise: "white",
    filter: { type: "bandpass", freq: 1300, q: 0.9 },
    sway: { rate: 0.13, depth: 0.2 },
    level: 0.34,
  },
  {
    id: "silence",
    name: "Silence",
    description: "Just the room you are already in.",
    silent: true,
  },
];

/* Pure tones. Two sine waves a few cents apart give a slow shimmer instead
   of a dead, piercing test tone; a sub an octave down adds body. */
const FREQUENCIES = [
  { id: "hz396", name: "396 Hz", description: "Low and grounding.", tone: 396, level: 0.075 },
  { id: "hz432", name: "432 Hz", description: "Warm, settled.", tone: 432, level: 0.07 },
  { id: "hz528", name: "528 Hz", description: "Open and clear.", tone: 528, level: 0.06 },
];

const ALL_SOUNDS = SOUNDS.concat(FREQUENCIES);

/* ========================== STORAGE ================================ */
/* Persisted through the artifact storage API. In a Vite project swap
   the two functions below for localStorage.getItem / setItem.        */

const STORE_KEY = "mmeditation:v1";
let fallbackStore = null;

async function loadProgress() {
  try {
    const res = await window.storage.get(STORE_KEY);
    if (res && res.value) return JSON.parse(res.value);
    return { sessions: [] };
  } catch (e) {
    return fallbackStore || { sessions: [] };
  }
}

async function saveProgress(data) {
  fallbackStore = data;
  try {
    await window.storage.set(STORE_KEY, JSON.stringify(data));
  } catch (e) {
    /* keep the in-memory copy for this visit */
  }
}

/* ============================ DATES ================================ */

const DAY_MS = 86400000;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function computeStats(sessions) {
  const byDay = {};
  sessions.forEach((s) => {
    const seconds = s.seconds != null ? s.seconds : (s.minutes || 0) * 60;
    if (!byDay[s.day]) byDay[s.day] = { seconds: 0, count: 0, moods: [] };
    byDay[s.day].seconds += seconds;
    byDay[s.day].count += 1;
    if (s.mood) byDay[s.day].moods.push(s.mood);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dayKey(today);
  const yesterdayKey = dayKey(new Date(today.getTime() - DAY_MS));

  // Streak: today counts if practised, otherwise start counting from yesterday.
  let streak = 0;
  let cursor = new Date(today);
  if (!byDay[todayKey]) cursor = new Date(today.getTime() - DAY_MS);
  while (byDay[dayKey(cursor)]) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const key = dayKey(d);
    week.push({
      key: key,
      name: DAY_NAMES[d.getDay()],
      shortName: DAY_NAMES[d.getDay()].slice(0, 3),
      seconds: byDay[key] ? byDay[key].seconds : 0,
      isToday: i === 0,
    });
  }

  // One row per day the person actually sat, newest first.
  const daily = Object.keys(byDay)
    .sort()
    .reverse()
    .map((key) => {
      const d = new Date(key + "T00:00:00");
      let label;
      if (key === todayKey) label = "Today";
      else if (key === yesterdayKey) label = "Yesterday";
      else label = DAY_NAMES[d.getDay()].slice(0, 3) + " " + d.getDate() + " " + MONTHS[d.getMonth()];
      return {
        key: key,
        label: label,
        seconds: byDay[key].seconds,
        count: byDay[key].count,
        mood: byDay[key].moods[byDay[key].moods.length - 1] || "",
      };
    });

  const totalSeconds = sessions.reduce(
    (a, s) => a + (s.seconds != null ? s.seconds : (s.minutes || 0) * 60),
    0
  );

  return {
    streak,
    week,
    weekSeconds: week.reduce((a, b) => a + b.seconds, 0),
    todaySeconds: byDay[todayKey] ? byDay[todayKey].seconds : 0,
    totalSessions: sessions.length,
    totalSeconds,
    daysPractised: daily.length,
    practisedToday: Boolean(byDay[todayKey]),
    daily,
  };
}

function useProgress() {
  const [sessions, setSessions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef([]);

  const commit = useCallback((next) => {
    ref.current = next;
    setSessions(next);
    saveProgress({ sessions: next });
  }, []);

  useEffect(() => {
    let alive = true;
    loadProgress().then((d) => {
      if (!alive) return;
      const list = d && Array.isArray(d.sessions) ? d.sessions : [];
      ref.current = list;
      setSessions(list);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const addSession = useCallback(
    (entry) => {
      commit(ref.current.concat(entry));
    },
    [commit]
  );

  const updateLastMood = useCallback(
    (mood) => {
      if (!ref.current.length) return;
      const next = ref.current.slice();
      next[next.length - 1] = { ...next[next.length - 1], mood };
      commit(next);
    },
    [commit]
  );

  const stats = useMemo(() => computeStats(sessions), [sessions]);
  return { sessions, stats, loaded, addSession, updateLastMood };
}

/* ============================ UTILS ================================ */

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h ? h + ":" + mm + ":" + ss : mm + ":" + ss;
}

/* Human-readable length, e.g. "8 minutes", "1 h 04 min", "45 seconds". */
function formatLength(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return s + (s === 1 ? " second" : " seconds");
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h) return h + " h " + String(m).padStart(2, "0") + " min";
  return m + (m === 1 ? " minute" : " minutes");
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener ? mq.addEventListener("change", update) : mq.addListener(update);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", update) : mq.removeListener(update);
    };
  }, []);
  return reduced;
}

function useHashRoute() {
  const read = () => {
    const h = window.location.hash.replace(/^#/, "");
    return h.startsWith("/") ? h : "/";
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((to) => {
    if (window.location.hash === "#" + to) return;
    window.location.hash = to;
  }, []);
  return [route, navigate];
}

/* ============================ SOUND ================================ */

/* A short buffer that fades out at each end pulses audibly every time it
   wraps. Instead: generate a long stream with extra tail, then wrap the tail
   back over the head with an equal-power crossfade. The last sample and the
   first sample are consecutive samples of the same original stream, so the
   loop point is mathematically continuous and the level never dips. */
function makeNoise(ctx, kind) {
  const rate = ctx.sampleRate;
  const loopLength = Math.floor(rate * 18);
  const cross = Math.floor(rate * 3);
  const raw = new Float32Array(loopLength + cross);

  if (kind === "brown") {
    let last = 0;
    for (let i = 0; i < raw.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      raw[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < raw.length; i++) raw[i] = Math.random() * 2 - 1;
  }

  const buffer = ctx.createBuffer(1, loopLength, rate);
  const data = buffer.getChannelData(0);
  data.set(raw.subarray(0, loopLength));

  for (let i = 0; i < cross; i++) {
    const t = i / cross;
    const head = Math.sin(t * Math.PI * 0.5); // 0 -> 1
    const tail = Math.cos(t * Math.PI * 0.5); // 1 -> 0
    data[i] = raw[i] * head + raw[loopLength + i] * tail;
  }

  // Keep every sound at a comparable level regardless of how it was built.
  let peak = 0;
  for (let i = 0; i < loopLength; i++) {
    const v = data[i] < 0 ? -data[i] : data[i];
    if (v > peak) peak = v;
  }
  if (peak > 0) {
    const norm = 0.9 / peak;
    for (let i = 0; i < loopLength; i++) data[i] *= norm;
  }

  return buffer;
}

function useAmbience() {
  const ref = useRef({ ctx: null, master: null, chains: {}, buffers: {} });
  const [activeIds, setActiveIds] = useState([]);
  const [muted, setMuted] = useState(false);

  const ensureContext = useCallback(() => {
    const s = ref.current;
    if (!s.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        s.ctx = new Ctx();
      } catch (e) {
        return null;
      }
      s.master = s.ctx.createGain();
      s.master.gain.value = muted ? 0.0001 : 1;
      // Keeps layered sounds from clipping when several play at once.
      const limiter = s.ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.02;
      limiter.release.value = 0.4;
      s.master.connect(limiter);
      limiter.connect(s.ctx.destination);
    }
    if (s.ctx.state === "suspended") s.ctx.resume();
    return s.ctx;
  }, [muted]);

  const stopChain = useCallback((id, fadeSeconds) => {
    const s = ref.current;
    const chain = s.chains[id];
    if (!chain || !s.ctx) return;
    const t = s.ctx.currentTime;
    try {
      chain.gain.gain.cancelScheduledValues(t);
      chain.gain.gain.setValueAtTime(chain.gain.gain.value, t);
      chain.gain.gain.linearRampToValueAtTime(0.0001, t + fadeSeconds);
      chain.sources.forEach((n) => n.stop(t + fadeSeconds + 0.1));
    } catch (e) {
      /* already stopped */
    }
    delete s.chains[id];
  }, []);

  const stopAll = useCallback(
    (fadeSeconds) => {
      Object.keys(ref.current.chains).forEach((id) => stopChain(id, fadeSeconds));
    },
    [stopChain]
  );

  const start = useCallback(
    (sound) => {
      const ctx = ensureContext();
      if (!ctx) return;
      const s = ref.current;

      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(s.master);

      const sources = [];

      if (sound.tone) {
        // Two sines a few cents apart, plus a quiet octave below.
        const mix = ctx.createGain();
        mix.gain.value = 1;
        [sound.tone, sound.tone * 1.004].forEach((f) => {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = f;
          osc.connect(mix);
          osc.start();
          sources.push(osc);
        });
        const sub = ctx.createOscillator();
        sub.type = "sine";
        sub.frequency.value = sound.tone / 2;
        const subGain = ctx.createGain();
        subGain.gain.value = 0.35;
        sub.connect(subGain);
        subGain.connect(mix);
        sub.start();
        sources.push(sub);
        mix.connect(gain);
      } else {
        const source = ctx.createBufferSource();
        // Generating an 18-second buffer costs real time and memory, so each
        // kind is built once and reused.
        if (!s.buffers[sound.noise]) s.buffers[sound.noise] = makeNoise(ctx, sound.noise);
        source.buffer = s.buffers[sound.noise];
        source.loop = true;
        source.loopStart = 0;
        source.loopEnd = source.buffer.duration;

        // Blocks the slow DC wander of brown noise, which otherwise reads as
        // the sound swelling and dropping away.
        const dc = ctx.createBiquadFilter();
        dc.type = "highpass";
        dc.frequency.value = 30;

        const filter = ctx.createBiquadFilter();
        filter.type = sound.filter.type;
        filter.frequency.value = sound.filter.freq;
        filter.Q.value = sound.filter.q;

        source.connect(dc);
        dc.connect(filter);
        filter.connect(gain);
        source.start();
        sources.push(source);
      }

      gain.gain.linearRampToValueAtTime(sound.level, ctx.currentTime + (sound.tone ? 3.5 : 2.5));

      // A very slow oscillator breathes the level so it never sounds static.
      const sway = sound.sway || (sound.tone ? { rate: 0.05, depth: 0.22 } : null);
      if (sway) {
        const osc = ctx.createOscillator();
        osc.frequency.value = sway.rate;
        const swayGain = ctx.createGain();
        swayGain.gain.value = sound.level * sway.depth;
        osc.connect(swayGain);
        swayGain.connect(gain.gain);
        osc.start();
        sources.push(osc);
      }

      s.chains[sound.id] = { sources: sources, gain: gain };
    },
    [ensureContext]
  );

  const toggle = useCallback(
    (sound) => {
      if (sound.silent) {
        stopAll(1.2);
        setActiveIds([]);
        return;
      }
      if (activeIds.indexOf(sound.id) !== -1) {
        stopChain(sound.id, 1.2);
        setActiveIds(activeIds.filter((id) => id !== sound.id));
      } else {
        start(sound);
        setActiveIds(activeIds.concat(sound.id));
      }
    },
    [activeIds, start, stopChain, stopAll]
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      const s = ref.current;
      if (s.master && s.ctx) {
        const t = s.ctx.currentTime;
        s.master.gain.cancelScheduledValues(t);
        s.master.gain.setValueAtTime(s.master.gain.value, t);
        s.master.gain.linearRampToValueAtTime(next ? 0.0001 : 1, t + 0.4);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      stopAll(0.1);
      const s = ref.current;
      if (s.ctx) setTimeout(() => s.ctx.close(), 400);
    };
  }, [stopAll]);

  const playing = ALL_SOUNDS.filter((s) => activeIds.indexOf(s.id) !== -1);
  const isOn = useCallback((id) => activeIds.indexOf(id) !== -1, [activeIds]);
  return { activeIds, playing, isOn, muted, toggle, toggleMute };
}

/* ============================ SKY ================================== */

function Cloud({ top, width, duration, delay, opacity }) {
  const puffs = [
    [0.0, 0.4, 0.4],
    [0.18, 0.12, 0.54],
    [0.42, 0.0, 0.62],
    [0.66, 0.24, 0.46],
    [0.3, 0.42, 0.48],
  ];
  return (
    <div
      className="mm-cloud"
      style={{
        top: top,
        width: width,
        height: width * 0.72,
        opacity: opacity,
        animationDuration: duration + "s",
        animationDelay: "-" + delay + "s",
      }}
      aria-hidden="true"
    >
      <div
        className="mm-puff"
        style={{ left: width * 0.03, top: width * 0.44, width: width * 0.94, height: width * 0.24 }}
      />
      {puffs.map((p, i) => (
        <div
          key={i}
          className="mm-puff"
          style={{
            left: p[0] * width,
            top: p[1] * width,
            width: p[2] * width,
            height: p[2] * width,
          }}
        />
      ))}
    </div>
  );
}

function Sky() {
  const clouds = [
    { top: "6%", width: 300, duration: 260, delay: 30, opacity: 0.9 },
    { top: "14%", width: 180, duration: 340, delay: 190, opacity: 0.75 },
    { top: "28%", width: 420, duration: 420, delay: 90, opacity: 0.62 },
    { top: "44%", width: 220, duration: 300, delay: 240, opacity: 0.7 },
    { top: "58%", width: 340, duration: 380, delay: 140, opacity: 0.55 },
    { top: "72%", width: 260, duration: 320, delay: 60, opacity: 0.6 },
    { top: "86%", width: 400, duration: 440, delay: 210, opacity: 0.5 },
  ];
  return (
    <div className="mm-sky" aria-hidden="true">
      <div className="mm-sun" />
      <div className="mm-clouds">
        {clouds.map((c, i) => (
          <Cloud key={i} {...c} />
        ))}
      </div>
      <div className="mm-haze" />
    </div>
  );
}

/* ========================= BREATHING CIRCLE ======================== */

function useBreath(active) {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!active) return undefined;
    const t = setTimeout(
      () => setIndex((i) => (i + 1) % BREATH_PHASES.length),
      BREATH_PHASES[index].ms
    );
    return () => clearTimeout(t);
  }, [index, active]);

  useEffect(() => {
    if (!active) setIndex(0);
  }, [active]);

  const phase = BREATH_PHASES[index];
  return {
    phase,
    scale: reduced ? 0.86 : phase.scale,
    duration: reduced ? 0 : phase.key === "hold" ? 0 : phase.ms,
  };
}

function Face() {
  return (
    <svg className="mm-face" viewBox="0 0 100 72" aria-hidden="true">
      <circle cx="33" cy="26" r="4.4" fill="currentColor" />
      <circle cx="67" cy="26" r="4.4" fill="currentColor" />
      <path
        d="M31 45c4.6 8.2 11.2 12.3 19 12.3S64.4 53.2 69 45"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BreathingCircle({ breath, children, size = "hero" }) {
  return (
    <div className={"mm-circle mm-circle-" + size}>
      <div
        className="mm-aura mm-aura-outer"
        style={{
          transform: "scale(" + breath.scale + ")",
          transitionDuration: breath.duration + "ms",
        }}
      />
      <div
        className="mm-aura mm-aura-inner"
        style={{
          transform: "scale(" + (0.88 + (breath.scale - 0.7) * 0.4) + ")",
          transitionDuration: breath.duration + "ms",
        }}
      />
      <svg className="mm-ring" viewBox="0 0 200 200" aria-hidden="true">
        <circle className="mm-ring-track" cx="100" cy="100" r="92" />
      </svg>
      <div className="mm-dial">{children}</div>
    </div>
  );
}

/* ============================ HEADER =============================== */

function Mark() {
  return (
    <svg className="mm-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M16 5c3 3.4 4.4 6.8 4.4 10.2 0 3-1.5 5.8-4.4 8.4-2.9-2.6-4.4-5.4-4.4-8.4C11.6 11.8 13 8.4 16 5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M16 23.6c-3.3 1.9-6.6 1.6-9.9-.9 1.6-3.7 4.2-5.4 7.8-5.1M16 23.6c3.3 1.9 6.6 1.6 9.9-.9-1.6-3.7-4.2-5.4-7.8-5.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Header({ route, navigate }) {
  const links = [
    { to: "/", label: "Home" },
    { to: "/guide", label: "Guide" },
    { to: "/progress", label: "Progress" },
    { to: "/about", label: "About" },
  ];

  return (
    <header className="mm-header">
      <a
        className="mm-logo"
        href="#/"
        onClick={(e) => {
          e.preventDefault();
          navigate("/");
        }}
      >
        <Mark />
        <span>mmeditation</span>
      </a>
      <nav className="mm-nav" aria-label="Main">
        {links.map((l) => (
          <a
            key={l.to}
            href={"#" + l.to}
            className={"mm-navlink" + (route === l.to ? " is-current" : "")}
            aria-current={route === l.to ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(l.to);
            }}
          >
            {l.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

/* =========================== SOUND CARD ============================ */

function SoundChip({ sound, ambience }) {
  const on = ambience.isOn(sound.id);
  const silence = Boolean(sound.silent);
  return (
    <button
      className={"mm-sound-chip" + (on ? " is-active" : "") + (silence ? " is-silence" : "")}
      onClick={() => ambience.toggle(sound)}
      aria-pressed={silence ? undefined : on}
      title={sound.description}
    >
      {!silence && (
        <span className={"mm-wave" + (on && !ambience.muted ? " is-playing" : "")} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      {sound.name}
    </button>
  );
}

function SoundPicker({ ambience }) {
  return (
    <div className="mm-sounds">
      <div className="mm-sound-row">
        <span className="mm-sound-label">Ambience</span>
        <div className="mm-chip-row">
          {SOUNDS.map((s) => (
            <SoundChip key={s.id} sound={s} ambience={ambience} />
          ))}
        </div>
      </div>
      <div className="mm-sound-row">
        <span className="mm-sound-label">Frequencies</span>
        <div className="mm-chip-row">
          {FREQUENCIES.map((s) => (
            <SoundChip key={s.id} sound={s} ambience={ambience} />
          ))}
        </div>
      </div>
      <p className="mm-sub-note">
        Layer as many as you like — they keep playing through your meditation.
      </p>
    </div>
  );
}

/* ============================= HOME ================================ */

function Home({ onBegin, ambience }) {
  const breath = useBreath(true);
  const base = MEDITATIONS[0];

  return (
    <div className="mm-page">
      <section className="mm-hero">
        <h1 className="mm-display">Take a moment for yourself.</h1>
        <p className="mm-lede">Slow down. Breathe. Be present.</p>

        <SoundPicker ambience={ambience} />

        <BreathingCircle breath={breath}>
          <Face />
          <p className="mm-clock">{formatClock(0)}</p>
        </BreathingCircle>

        <p className="mm-hero-desc">{base.description}</p>

        <p className="mm-note">No clock, no countdown. Sit, then finish when you're ready.</p>

        <button className="mm-btn mm-btn-primary mm-begin" onClick={() => onBegin(base)}>
          Begin meditation
        </button>
      </section>

      <section className="mm-quote">
        <p>You don't have to be still to begin. Sit down, and the stillness comes to find you.</p>
      </section>

      <footer className="mm-footer">
        <p>Sit somewhere quiet. The sky will wait for you.</p>
      </footer>
    </div>
  );
}

/* ========================== PROGRESS PAGE ========================== */

function ProgressDashboard({ stats }) {
  const peak = Math.max(300, ...stats.week.map((d) => d.seconds));
  return (
    <>
      <div className="mm-panel mm-stats-row">
        <div className="mm-stat">
          <p className="mm-stat-label">Current streak</p>
          <p className="mm-stat-value">
            {stats.streak} <span>{stats.streak === 1 ? "day" : "days"}</span>
          </p>
        </div>
        <div className="mm-stat">
          <p className="mm-stat-label">Days practised</p>
          <p className="mm-stat-value">
            {stats.daysPractised} <span>{stats.daysPractised === 1 ? "day" : "days"}</span>
          </p>
        </div>
        <div className="mm-stat">
          <p className="mm-stat-label">Total sessions</p>
          <p className="mm-stat-value">
            {stats.totalSessions} <span>sat</span>
          </p>
        </div>
        <div className="mm-stat">
          <p className="mm-stat-label">Total time</p>
          <p className="mm-stat-value">
            {Math.round(stats.totalSeconds / 60)} <span>minutes</span>
          </p>
        </div>
      </div>

      <section className="mm-panel">
        <h2 className="mm-h2-sm">This week</h2>
        <div className="mm-chart">
          {stats.week.map((d) => (
            <div className="mm-bar-col" key={d.key}>
              <div className="mm-bar-track">
                <div
                  className={"mm-bar" + (d.isToday ? " is-today" : "")}
                  style={{ height: Math.min(100, (d.seconds / peak) * 100) + "%" }}
                />
              </div>
              <span className="mm-bar-min">
                {d.seconds ? Math.max(1, Math.round(d.seconds / 60)) : ""}
              </span>
              <span className={"mm-bar-day" + (d.isToday ? " is-today" : "")}>{d.shortName}</span>
            </div>
          ))}
        </div>
        <p className="mm-chart-note">
          {Math.round(stats.weekSeconds / 60)} minutes across the last seven days.
        </p>
      </section>

      <section className="mm-panel">
        <h2 className="mm-h2-sm">Daily record</h2>
        {stats.daily.length ? (
          <ul className="mm-history">
            {stats.daily.map((d) => (
              <li key={d.key}>
                <span className="mm-hist-day">{d.label}</span>
                <span className="mm-hist-name">
                  {d.count} {d.count === 1 ? "session" : "sessions"}
                </span>
                <span className="mm-hist-mood">{d.mood}</span>
                <span className="mm-hist-min">{formatLength(d.seconds)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mm-quiet">
            Nothing here yet. The day you first sit down, it gets its own line — and every day after
            that.
          </p>
        )}
      </section>
    </>
  );
}

function ProgressPage({ stats, loaded }) {
  return (
    <div className="mm-page mm-page-narrow">
      <header className="mm-page-head">
        <h1 className="mm-h1">Progress</h1>
        <p className="mm-lede-sm">A quiet record of every day you sat down.</p>
      </header>
      {loaded ? <ProgressDashboard stats={stats} /> : <div className="mm-panel mm-quiet">Loading your record…</div>}
    </div>
  );
}

/* ============================= GUIDE =============================== */

const GUIDE = [
  {
    title: "Sit somewhere you can stay",
    body:
      "A chair, a cushion, the edge of your bed — it matters less than you think. Put both feet on the floor, let your back be upright but not stiff, and rest your hands wherever they fall naturally. If you're comfortable enough to forget your body for a few minutes, the position is right.",
  },
  {
    title: "Let the eyes close, or nearly",
    body:
      "Closed eyes make it easier to notice the breath. If closing them makes you drowsy or uneasy, let them stay open and rest your gaze on the floor a metre or two ahead, unfocused.",
  },
  {
    title: "Find the breath where you feel it",
    body:
      "At the nostrils, in the chest, or in the belly — pick one place and stay there. Don't lengthen or deepen it. You're watching the breath, not making it. The circle on screen expands and contracts on a four-second in, two-second hold, six-second out; follow it if it helps, ignore it if it doesn't.",
  },
  {
    title: "When the mind wanders, come back",
    body:
      "It will wander, over and over, and that isn't failure — noticing you've drifted is the actual practice. There's no need to judge the thought or push it away. Notice, then return to the breath. Doing that a hundred times is a hundred successful repetitions.",
  },
  {
    title: "Finish on your own terms",
    body:
      "Nothing here ends the session but you. Two minutes counts. So does twenty. Before you stand up, take one slow breath and notice how the room sounds — it makes the shift back into your day less abrupt.",
  },
];

function GuidePage({ onBegin }) {
  return (
    <div className="mm-page mm-page-narrow">
      <header className="mm-page-head">
        <h1 className="mm-h1">How to meditate</h1>
        <p className="mm-lede-sm">
          Five things worth knowing before you sit. None of them take practice to get right.
        </p>
      </header>

      <ol className="mm-guide">
        {GUIDE.map((g, i) => (
          <li className="mm-panel mm-guide-step" key={g.title}>
            <span className="mm-guide-num">{i + 1}</span>
            <div>
              <h2 className="mm-h2-sm">{g.title}</h2>
              <p className="mm-quiet">{g.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mm-panel mm-guide-end">
        <p>
          The guidance inside a session walks the same path: get comfortable, follow the breath,
          notice your thoughts, be present. After that it goes quiet and leaves you to sit.
        </p>
        <button className="mm-btn mm-btn-primary" onClick={() => onBegin(MEDITATIONS[0])}>
          Begin meditation
        </button>
      </div>
    </div>
  );
}

/* ============================ ABOUT ================================ */

function About({ onBegin }) {
  return (
    <div className="mm-page mm-page-narrow">
      <div className="mm-panel mm-about">
        <h1 className="mm-h1">About mmeditation</h1>
        <p>
          mmeditation is a simple space designed to help you slow down, breathe, and create a few
          moments of stillness in your day.
        </p>
        <p className="mm-quiet">
          No accounts, no streak pressure, no noise. Open the page, sit down, and follow the breath
          for as long as you like. That's the whole idea.
        </p>
        <button className="mm-btn mm-btn-primary" onClick={() => onBegin(MEDITATIONS[0])}>
          Begin meditation
        </button>
        <div className="mm-contact">
          <p className="mm-quiet">Questions, requests, or a sound you'd like added?</p>
          <a
            className="mm-btn mm-btn-quiet mm-contact-link"
            href="https://www.facebook.com/happyfrequencies"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="mmeditation on Facebook (opens in a new tab)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5h1.65V3.6A22 22 0 0 0 14.3 3.5c-2.4 0-4 1.45-4 4.1v2.3H7.6V13h2.7v8Z"
              />
            </svg>
            facebook.com/happyfrequencies
          </a>
        </div>
      </div>
    </div>
  );
}

/* ========================= SESSION (MODE) ========================== */

function SessionView({ meditation, ambience, onFinish }) {
  /* Timing is kept on the wall clock, not by counting interval ticks: a
     backgrounded tab or a sleeping phone throttles or stops the interval, and
     a tick-counting timer would silently lose that time. The interval only
     decides when to repaint. */
  const clock = useRef({ startedAt: Date.now(), banked: 0, running: true });
  const [shown, setShown] = useState(0); // whole seconds, so we repaint 1x/sec
  const [paused, setPaused] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmingRef = useRef(false);
  const dialogRef = useRef(null);
  const returnFocus = useRef(null);
  const breath = useBreath(!paused);

  const readElapsed = useCallback(() => {
    const c = clock.current;
    return c.running ? c.banked + (Date.now() - c.startedAt) / 1000 : c.banked;
  }, []);

  const togglePause = useCallback(() => {
    const c = clock.current;
    if (c.running) {
      c.banked += (Date.now() - c.startedAt) / 1000;
      c.running = false;
    } else {
      c.startedAt = Date.now();
      c.running = true;
    }
    setPaused(!c.running);
    setShown(Math.floor(c.running ? c.banked : c.banked));
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const tick = () => setShown(Math.floor(readElapsed()));
    const id = setInterval(tick, 250);
    // Catch up immediately when the tab or phone comes back.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [paused, readElapsed]);

  useEffect(() => {
    confirmingRef.current = confirming;
  }, [confirming]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setConfirming((c) => !c);
        return;
      }
      // Space must still activate a focused button, so only treat it as a
      // pause shortcut when focus isn't on a control.
      const tag = e.target && e.target.tagName;
      if (e.code === "Space" && tag !== "BUTTON" && tag !== "A" && !confirmingRef.current) {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause]);

  // Focus moves into the dialog, stays there while it is open, and returns.
  useEffect(() => {
    if (!confirming) return undefined;
    const node = dialogRef.current;
    if (!node) return undefined;
    returnFocus.current = document.activeElement;
    const buttons = node.querySelectorAll("button");
    if (buttons[0]) buttons[0].focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const list = node.querySelectorAll("button");
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", trap);
    return () => {
      node.removeEventListener("keydown", trap);
      const back = returnFocus.current;
      if (back && back.focus && document.contains(back)) back.focus();
    };
  }, [confirming]);

  const stepIndex = stepAt(shown);
  const step = STEPS[stepIndex];
  const guided = isFinite(step.duration);

  return (
    <div className="mm-session">
      <h1 className="mm-sr">Meditation in progress</h1>
      <div className="mm-session-inner">
        <div className="mm-session-top">
          <div className="mm-steps" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span
                key={s.key}
                className={
                  "mm-step-dot" +
                  (i < stepIndex ? " is-past" : "") +
                  (i === stepIndex ? " is-now" : "") +
                  (s.key === "open" ? " is-open" : "")
                }
              />
            ))}
          </div>

          <div aria-live="polite" className="mm-step-live">
            <div className="mm-step-copy" key={step.key}>
              <h2 className="mm-step-title">{step.title}</h2>
              <p className="mm-step-instruction">{step.instruction}</p>
            </div>
          </div>
        </div>

        <BreathingCircle breath={breath} size="session">
          <Face />
          <p className="mm-clock" role="timer" aria-live="off">
            {formatClock(shown)}
          </p>
        </BreathingCircle>

        <div className="mm-session-bottom">
          <p className="mm-session-note">
            {paused
              ? "Everything is paused. Resume when you're ready."
              : guided
              ? "Stay as long as you like — finish when you're ready."
              : "Open sitting. Nothing is counting down."}
          </p>

          {ambience.playing.length > 0 && (
            <button className="mm-sound-pill" onClick={ambience.toggleMute}>
              <span className={"mm-wave" + (ambience.muted ? "" : " is-playing")} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {ambience.playing.map((s) => s.name).join(" + ")} ·{" "}
              {ambience.muted ? "Unmute" : "Mute"}
            </button>
          )}

          <div className="mm-controls">
            <button className="mm-btn mm-btn-primary" onClick={togglePause}>
              {paused ? "Resume" : "Pause"}
            </button>
            <button className="mm-btn mm-btn-quiet" onClick={() => setConfirming(true)}>
              Finish
            </button>
          </div>
        </div>
      </div>

      {confirming && (
        <div className="mm-modal-veil" onClick={() => setConfirming(false)}>
          <div
            className="mm-modal"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mm-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="mm-dialog-title">Finish this meditation?</h2>
            <p className="mm-quiet">Your time will be saved to today's record.</p>
            <div className="mm-modal-actions">
              <button className="mm-btn mm-btn-primary" onClick={() => setConfirming(false)}>
                Continue
              </button>
              <button className="mm-btn mm-btn-quiet" onClick={() => onFinish(readElapsed())}>
                Finish meditation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================== COMPLETION ============================= */

function Completion({ seconds, streak, onDone, onMood }) {
  const [mood, setMood] = useState(null);
  const breath = useBreath(true);

  return (
    <div className="mm-session">
      <div className="mm-session-inner mm-complete">
        <BreathingCircle breath={breath} size="small">
          <span className="mm-check" aria-hidden="true">
            ✓
          </span>
        </BreathingCircle>

        <h1 className="mm-display mm-display-sm">You made time for yourself.</h1>
        <p className="mm-lede">Take one slow breath before continuing your day.</p>

        <p className="mm-complete-meta">
          Meditation completed · {formatLength(seconds)}
        </p>
        <p className="mm-note mm-note-soft">
          Saved to today's record{streak > 1 ? " · " + streak + " days in a row" : ""}.
        </p>

        <div className="mm-moods">
          <h2 className="mm-h2-sm">How do you feel?</h2>
          <div className="mm-mood-row">
            {MOODS.map((m) => (
              <button
                key={m.label}
                className={"mm-mood" + (mood === m.label ? " is-active" : "")}
                onClick={() => {
                  setMood(m.label);
                  onMood(m.emoji + " " + m.label);
                }}
                aria-pressed={mood === m.label}
              >
                <span className="mm-mood-emoji">{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button className="mm-btn mm-btn-primary mm-begin" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

/* ============================== APP ================================ */

export default function App() {
  const [route, navigate] = useHashRoute();
  const [session, setSession] = useState(null); // {meditation, stage, seconds}
  const { stats, loaded, addSession, updateLastMood } = useProgress();
  const ambience = useAmbience();

  const begin = useCallback((meditation) => {
    setSession({ meditation: meditation, stage: "running", seconds: 0, startedAt: Date.now() });
  }, []);

  const finish = useCallback(
    (elapsed) => {
      if (!session) return;
      const secs = Math.max(1, Math.round(elapsed));
      const now = new Date();
      addSession({
        day: dayKey(now),
        dayName: DAY_NAMES[now.getDay()],
        at: now.toISOString(),
        seconds: secs,
        name: session.meditation.short,
        id: session.meditation.id,
        mood: null,
      });
      setSession({ ...session, stage: "complete", seconds: secs });
    },
    [session, addSession]
  );

  let content;
  if (route === "/guide") content = <GuidePage onBegin={begin} />;
  else if (route === "/progress") content = <ProgressPage stats={stats} loaded={loaded} />;
  else if (route === "/about") content = <About onBegin={begin} />;
  else content = <Home onBegin={begin} ambience={ambience} />;

  return (
    <div className="mm-root">
      <Styles />
      <Sky />
      {session ? (
        session.stage === "running" ? (
          <SessionView
            key={session.startedAt}
            meditation={session.meditation}
            ambience={ambience}
            onFinish={finish}
          />
        ) : (
          <Completion
            seconds={session.seconds}
            streak={stats.streak}
            onMood={updateLastMood}
            onDone={() => setSession(null)}
          />
        )
      ) : (
        <>
          <Header route={route} navigate={navigate} />
          <main>{content}</main>
        </>
      )}
    </div>
  );
}

/* ============================ STYLES =============================== */

function Styles() {
  return (
    <style>{`
.mm-root{
  --sky-high:#5aa9e0;
  --sky-mid:#9fd2f2;
  --sky-low:#e6f4fd;
  --ink:#2b4257;
  --ink-soft:#4a6478;
  --green:#5d9c7b;
  --green-deep:#4a8367;
  --glass:rgba(255,255,255,.42);
  --glass-strong:rgba(255,255,255,.62);
  --edge:rgba(255,255,255,.72);
  --serif:'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif;
  --sans:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  position:relative;
  min-height:100vh;
  min-height:100dvh;
  color:var(--ink);
  font-family:var(--sans);
  -webkit-font-smoothing:antialiased;
}
.mm-root *{box-sizing:border-box;}
.mm-root p,.mm-root h1,.mm-root h2,.mm-root h3,.mm-root ul{margin:0;padding:0;}
.mm-root ul{list-style:none;}
.mm-root button{font:inherit;color:inherit;cursor:pointer;}
.mm-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0;}
.mm-root :focus-visible{outline:2px solid rgba(45,80,110,.75);outline-offset:3px;border-radius:999px;}

/* ---- sky ---- */
.mm-sky{position:fixed;inset:0;z-index:0;overflow:hidden;
  background:linear-gradient(180deg,var(--sky-high) 0%,#7cc0ea 28%,var(--sky-mid) 58%,var(--sky-low) 100%);}
.mm-sun{position:absolute;top:-14vh;right:-8vw;width:70vw;height:70vw;max-width:760px;max-height:760px;
  background:radial-gradient(circle,rgba(255,255,255,.85) 0%,rgba(255,255,255,.28) 42%,rgba(255,255,255,0) 70%);}
.mm-clouds{position:absolute;inset:0;}
.mm-cloud{position:absolute;left:0;filter:blur(13px);animation-name:mm-drift;
  animation-timing-function:linear;animation-iteration-count:infinite;
  will-change:transform;transform:translate3d(-40vw,0,0);backface-visibility:hidden;}
.mm-puff{position:absolute;background:#fff;border-radius:999px;}
.mm-haze{position:absolute;left:0;right:0;bottom:0;height:34vh;
  background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.55));}
@keyframes mm-drift{from{transform:translate3d(-40vw,0,0)}to{transform:translate3d(120vw,0,0)}}

/* ---- header ---- */
.mm-header{position:relative;z-index:3;display:flex;flex-direction:column;align-items:center;
  gap:14px;padding:26px clamp(16px,4vw,44px) 8px;}
.mm-logo{display:flex;align-items:center;gap:10px;text-decoration:none;
  color:var(--ink);font-family:var(--serif);font-size:clamp(16px,2.6vw,21px);
  text-transform:uppercase;letter-spacing:.2em;}
.mm-logo span{padding-left:.1em;}
.mm-mark{width:26px;height:26px;color:var(--green-deep);flex:none;}
.mm-nav{display:flex;justify-content:center;gap:clamp(20px,4vw,38px);}
.mm-navlink{color:var(--ink-soft);text-decoration:none;font-size:14px;text-transform:uppercase;
  letter-spacing:.17em;padding-bottom:4px;border-bottom:1px solid transparent;
  transition:color .3s ease,border-color .3s ease;}
.mm-navlink:hover{color:var(--ink);}
.mm-navlink.is-current{color:var(--ink);border-bottom-color:rgba(93,156,123,.8);}

/* ---- buttons ---- */
.mm-btn{border-radius:999px;border:1px solid var(--edge);padding:11px 22px;font-size:15px;
  background:var(--glass);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  transition:background .35s ease,transform .35s ease,border-color .35s ease;}
.mm-btn:hover{background:var(--glass-strong);}
.mm-btn:active{transform:scale(.985);}
.mm-btn-quiet{background:rgba(255,255,255,.34);color:var(--ink-soft);}
.mm-btn-quiet:hover{color:var(--ink);}
.mm-btn-primary{background:rgba(126,186,155,.42);border-color:rgba(255,255,255,.8);color:#25452f;}
.mm-btn-primary:hover{background:rgba(126,186,155,.62);}
.mm-begin{padding:15px 40px;font-size:16.5px;letter-spacing:.01em;}

/* ---- layout ---- */
main{position:relative;z-index:2;}
.mm-page{max-width:1080px;margin:0 auto;padding:0 clamp(16px,4vw,32px) 80px;}
.mm-page-narrow{max-width:760px;padding-top:22px;}
.mm-page-head{text-align:center;margin:14px 0 26px;}

/* ---- type ---- */
.mm-display{font-family:var(--serif);font-weight:400;font-size:clamp(30px,5.4vw,50px);
  line-height:1.14;letter-spacing:-.012em;}
.mm-display-sm{font-size:clamp(26px,4.4vw,38px);}
.mm-h1{font-family:var(--serif);font-weight:400;font-size:clamp(26px,4vw,36px);}
.mm-h2-sm{font-family:var(--serif);font-weight:400;font-size:19px;margin-bottom:14px;}
.mm-lede{font-size:clamp(15px,2vw,17.5px);color:var(--ink-soft);letter-spacing:.02em;}
.mm-lede-sm{font-size:15px;color:var(--ink-soft);margin-top:8px;}
.mm-quiet{color:var(--ink-soft);font-size:14.5px;line-height:1.7;}

/* ---- hero ---- */
.mm-hero{display:flex;flex-direction:column;align-items:center;text-align:center;
  padding:clamp(14px,4vh,40px) 0 clamp(20px,4vh,36px);}
.mm-hero .mm-lede{margin-top:12px;}
.mm-hero-desc{max-width:44ch;margin:22px auto 0;font-size:15px;line-height:1.7;color:var(--ink-soft);}

/* ---- breathing circle ---- */
.mm-circle{position:relative;width:min(78vw,360px);height:min(78vw,360px);margin:clamp(26px,5vh,46px) 0 4px;
  display:grid;place-items:center;}
.mm-circle-small{width:min(44vw,150px);height:min(44vw,150px);margin:0 0 26px;}
.mm-circle-session{width:min(66vw,44vh,300px);height:min(66vw,44vh,300px);
  margin:clamp(14px,3vh,28px) 0;}
.mm-aura{position:absolute;inset:0;border-radius:50%;transition-property:transform;
  transition-timing-function:cubic-bezier(.4,0,.35,1);}
.mm-aura-outer{background:radial-gradient(circle,rgba(255,255,255,.5) 40%,rgba(255,255,255,.12) 70%,rgba(255,255,255,0) 78%);}
.mm-aura-inner{background:radial-gradient(circle,rgba(190,226,208,.45) 30%,rgba(255,255,255,.16) 66%,rgba(255,255,255,0) 76%);}
.mm-ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);}
.mm-ring-track{fill:none;stroke:rgba(255,255,255,.6);stroke-width:2.2;}
.mm-dial{position:relative;width:76%;height:76%;border-radius:50%;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:12px;text-align:center;padding:12px;
  background:rgba(255,255,255,.34);border:1px solid rgba(255,255,255,.6);
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}
.mm-check{font-size:44px;color:var(--green-deep);}
.mm-face{width:40%;max-width:104px;height:auto;color:var(--ink);opacity:.68;}
.mm-clock{font-family:var(--serif);font-size:clamp(22px,5.2vw,30px);line-height:1;
  letter-spacing:.06em;color:var(--ink);font-variant-numeric:tabular-nums;opacity:.8;}

/* ---- sounds ---- */
.mm-sounds{display:flex;flex-direction:column;align-items:center;gap:12px;
  margin:30px 0 4px;width:100%;max-width:720px;}
.mm-sound-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center;}
.mm-sound-label{font-size:11px;text-transform:uppercase;letter-spacing:.16em;color:var(--ink-soft);
  min-width:88px;text-align:right;}
.mm-chip-row{display:flex;gap:7px;flex-wrap:wrap;justify-content:center;}
.mm-sound-chip{display:inline-flex;align-items:center;gap:7px;padding:7px 15px;border-radius:999px;
  font-size:13.5px;color:var(--ink-soft);border:1px solid rgba(255,255,255,.7);
  background:rgba(255,255,255,.32);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  transition:background .3s ease,color .3s ease,border-color .3s ease;}
.mm-sound-chip:hover{background:rgba(255,255,255,.55);color:var(--ink);}
.mm-sound-chip.is-active{background:rgba(126,186,155,.5);color:#25452f;border-color:rgba(255,255,255,.9);}
.mm-sound-chip.is-silence{font-style:italic;}
.mm-sub-note{font-size:12.5px;color:var(--ink-soft);margin-top:2px;}
.mm-sound-pill{display:inline-flex;align-items:center;gap:10px;margin-bottom:18px;
  padding:8px 18px;border-radius:999px;font-size:13px;color:var(--ink-soft);
  border:1px solid rgba(255,255,255,.7);background:rgba(255,255,255,.3);
  transition:background .3s ease,color .3s ease;}
.mm-sound-pill:hover{background:rgba(255,255,255,.5);color:var(--ink);}

.mm-wave{display:flex;align-items:flex-end;gap:2px;height:11px;}
.mm-wave i{width:2px;height:3px;border-radius:2px;background:currentColor;opacity:.55;
  transition:height .3s ease;}
.mm-wave.is-playing i{animation:mm-bob 2s ease-in-out infinite;}
.mm-wave.is-playing i:nth-child(2){animation-duration:2.7s;animation-delay:-.5s;}
.mm-wave.is-playing i:nth-child(3){animation-duration:2.3s;animation-delay:-1.1s;}
@keyframes mm-bob{0%,100%{height:3px}50%{height:11px}}

/* ---- notes ---- */
.mm-note{margin:20px 0 clamp(32px,6vh,52px);font-size:13.5px;letter-spacing:.02em;
  color:var(--ink-soft);}
.mm-note-soft{margin:18px 0 0;opacity:.85;}

/* ---- panels & cards ---- */
.mm-panel{background:var(--glass);border:1px solid var(--edge);border-radius:22px;
  padding:clamp(18px,3vw,26px);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  margin-bottom:22px;}
/* ---- stats ---- */
.mm-stats-row{display:flex;align-items:center;gap:clamp(18px,5vw,46px);flex-wrap:wrap;}
.mm-stat{min-width:92px;}
.mm-stat-label{font-size:13px;color:var(--ink-soft);margin-bottom:4px;}
.mm-stat-value{font-family:var(--serif);font-size:30px;line-height:1;}
.mm-stat-value span{font-family:var(--sans);font-size:13.5px;color:var(--ink-soft);margin-left:4px;}

/* ---- chart & record ---- */
.mm-chart{display:flex;align-items:flex-end;gap:clamp(6px,2vw,14px);height:160px;}
.mm-bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;}
.mm-bar-track{flex:1;width:100%;max-width:46px;display:flex;align-items:flex-end;
  border-bottom:1px solid rgba(255,255,255,.7);}
.mm-bar{width:100%;border-radius:10px 10px 0 0;background:rgba(255,255,255,.72);min-height:2px;
  transition:height .6s cubic-bezier(.4,0,.2,1);}
.mm-bar.is-today{background:rgba(93,156,123,.7);}
.mm-bar-min{font-size:12px;color:var(--ink-soft);height:14px;}
.mm-bar-day{font-size:12.5px;color:var(--ink-soft);}
.mm-bar-day.is-today{color:var(--ink);}
.mm-chart-note{margin-top:14px;font-size:13.5px;color:var(--ink-soft);}
.mm-history li{display:flex;align-items:baseline;gap:12px;padding:11px 0;
  border-bottom:1px solid rgba(255,255,255,.55);font-size:14.5px;}
.mm-history li:last-child{border-bottom:none;}
.mm-hist-day{width:110px;color:var(--ink-soft);font-size:13.5px;}
.mm-hist-name{flex:1;}
.mm-hist-mood{font-size:13px;color:var(--ink-soft);}
.mm-hist-min{font-family:var(--serif);}

/* ---- guide ---- */
.mm-guide{display:flex;flex-direction:column;gap:14px;margin:0;padding:0;list-style:none;
  counter-reset:none;}
.mm-guide-step{display:flex;gap:18px;align-items:flex-start;margin-bottom:0;}
.mm-guide-num{font-family:var(--serif);font-size:26px;line-height:1;color:var(--green-deep);
  opacity:.7;min-width:26px;padding-top:2px;}
.mm-guide-step h2{margin-bottom:7px;}
.mm-guide-step p{max-width:60ch;}
.mm-guide-end{margin-top:22px;text-align:center;display:flex;flex-direction:column;
  align-items:center;gap:16px;}
.mm-guide-end p{max-width:52ch;font-size:15px;line-height:1.75;color:var(--ink-soft);}

/* ---- about ---- */
.mm-about{text-align:center;display:flex;flex-direction:column;gap:16px;align-items:center;
  padding:clamp(26px,5vw,44px);}
.mm-about p{max-width:52ch;font-size:16px;line-height:1.8;}
.mm-about .mm-btn{margin-top:10px;}
.mm-contact{margin-top:26px;padding-top:22px;border-top:1px solid rgba(255,255,255,.6);
  width:100%;display:flex;flex-direction:column;align-items:center;gap:12px;}
.mm-contact-link{display:inline-flex;align-items:center;gap:9px;margin-top:0;text-decoration:none;
  font-size:14.5px;}
.mm-contact-link svg{width:18px;height:18px;color:var(--green-deep);flex:none;}

/* ---- session ---- */
.mm-session{position:relative;z-index:2;min-height:100vh;min-height:100dvh;display:flex;justify-content:center;
  align-items:center;padding:24px clamp(16px,5vw,32px) 36px;animation:mm-fade-in .8s ease both;}
.mm-session-inner{display:grid;grid-template-rows:auto 1fr auto;justify-items:center;
  align-items:center;text-align:center;width:100%;max-width:560px;gap:10px;
  min-height:min(78vh,660px);}
.mm-session-top,.mm-session-bottom{display:flex;flex-direction:column;align-items:center;width:100%;}
.mm-steps{display:flex;gap:8px;margin-bottom:20px;}
.mm-step-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.6);
  transition:background .6s ease,transform .6s ease;}
.mm-step-dot.is-past{background:rgba(93,156,123,.55);}
.mm-step-dot.is-now{background:rgba(93,156,123,.95);transform:scale(1.45);}
.mm-step-dot.is-open{background:transparent;border:1px solid rgba(93,156,123,.6);}
.mm-step-dot.is-open.is-now{background:rgba(93,156,123,.95);border-color:transparent;}
.mm-step-live{width:100%;}
.mm-step-copy{animation:mm-fade 1.4s ease both;}
.mm-step-title{font-family:var(--serif);font-weight:400;font-size:clamp(24px,4vw,32px);margin-bottom:10px;}
.mm-step-instruction{max-width:46ch;margin:0 auto;font-size:15px;line-height:1.8;color:var(--ink-soft);}
.mm-session-note{margin:14px 0 16px;font-size:13.5px;color:var(--ink-soft);min-height:20px;}
.mm-controls{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;}
@keyframes mm-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes mm-fade-in{from{opacity:0}to{opacity:1}}

/* ---- modal ---- */
.mm-modal-veil{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:22px;
  background:rgba(190,220,240,.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  animation:mm-fade .35s ease both;}
.mm-modal{background:rgba(255,255,255,.7);border:1px solid var(--edge);border-radius:24px;
  padding:30px;max-width:380px;width:100%;text-align:center;
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);}
.mm-modal h2{font-family:var(--serif);font-weight:400;font-size:23px;margin-bottom:8px;}
.mm-modal-actions{display:flex;gap:10px;justify-content:center;margin-top:22px;flex-wrap:wrap;}

/* ---- completion ---- */
.mm-complete{display:flex;flex-direction:column;min-height:0;gap:2px;}
.mm-complete .mm-lede{margin-top:12px;}
.mm-complete-meta{margin-top:20px;font-size:14px;color:var(--ink-soft);
  border:1px solid rgba(255,255,255,.7);background:rgba(255,255,255,.35);border-radius:999px;
  padding:9px 20px;}
.mm-moods{margin:32px 0 28px;}
.mm-mood-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}
.mm-mood{display:flex;flex-direction:column;align-items:center;gap:6px;width:88px;padding:14px 8px;
  border-radius:20px;border:1px solid rgba(255,255,255,.65);background:rgba(255,255,255,.32);
  font-size:13px;color:var(--ink-soft);transition:background .3s ease,transform .3s ease;}
.mm-mood:hover{background:rgba(255,255,255,.5);}
.mm-mood.is-active{background:rgba(126,186,155,.45);color:#25452f;transform:translateY(-2px);}
.mm-mood-emoji{font-size:26px;line-height:1;}

.mm-quote{margin:76px auto 66px;max-width:34ch;text-align:center;}
.mm-quote p{font-family:var(--serif);font-size:clamp(20px,3.4vw,27px);line-height:1.5;
  letter-spacing:.005em;color:var(--ink);}
.mm-quote::before{content:"";display:block;width:38px;height:1px;margin:0 auto 26px;
  background:rgba(93,156,123,.55);}

.mm-footer{text-align:center;margin-top:64px;font-size:13.5px;color:var(--ink-soft);}

/* ---- mobile ---- */
@media (max-width:720px){
  .mm-header{padding:20px 16px 6px;gap:12px;}
  .mm-nav{gap:16px;flex-wrap:wrap;}
  .mm-navlink{font-size:12.5px;letter-spacing:.14em;}
  .mm-hero{padding-top:6px;}
  .mm-stats-row{gap:22px;}
  .mm-quote{margin:56px auto 52px;}
  .mm-sound-label{min-width:0;text-align:center;width:100%;}
  .mm-sound-row{gap:8px;}
  .mm-sounds{gap:16px;margin-top:24px;}
  .mm-controls .mm-btn{min-width:132px;}
  .mm-session-inner{min-height:0;gap:6px;}
  .mm-step-instruction{font-size:14.5px;line-height:1.7;}
  .mm-hist-day{width:92px;}
  .mm-guide-step{gap:12px;}
  .mm-guide-num{font-size:22px;}
  .mm-sun{top:-6vh;}
  .mm-cloud:nth-child(2),.mm-cloud:nth-child(5),.mm-cloud:nth-child(7){display:none;}
  .mm-modal{padding:24px 20px;}
}

/* ---- reduced motion ---- */
@media (prefers-reduced-motion:reduce){
  .mm-root *,.mm-root *::before,.mm-root *::after{
    animation-duration:.001ms !important;animation-iteration-count:1 !important;
    transition-duration:.001ms !important;}
  .mm-cloud{animation:none;}
}
`}</style>
  );
}
