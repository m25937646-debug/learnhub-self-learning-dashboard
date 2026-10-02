export type ActiveRing = {
  id: string;
  label: string;
  tone: string;
  startedAt: number;
};

import { notifyDevice } from "./device-notifications";

const RINGING_STORAGE_KEY = "self-learning-active-rings-v1";
let audioContext: AudioContext | null = null;
let ringLoopTimer: number | null = null;
let toneLoopActive = false;
let activeOscillators = new Set<OscillatorNode>();

const tonePhrases: Record<string, { frequency: number; offset: number }[]> = {
  loud: [
    { frequency: 1260, offset: 0 },
    { frequency: 1580, offset: 0.22 },
    { frequency: 1260, offset: 0.49 },
    { frequency: 1580, offset: 0.71 },
  ],
  classic: [
    { frequency: 1080, offset: 0 },
    { frequency: 1390, offset: 0.3 },
    { frequency: 1080, offset: 0.66 },
    { frequency: 1390, offset: 0.96 },
  ],
  soft: [
    { frequency: 980, offset: 0 },
    { frequency: 1220, offset: 0.25 },
    { frequency: 1490, offset: 0.5 },
  ],
  pulse: [
    { frequency: 1170, offset: 0 },
    { frequency: 1600, offset: 0.18 },
    { frequency: 1170, offset: 0.41 },
    { frequency: 1600, offset: 0.59 },
  ],
};

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  const ContextConstructor = window.AudioContext || audioWindow.webkitAudioContext;
  if (!ContextConstructor) return null;
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new ContextConstructor();
  }
  return audioContext;
}

function emitTonePhrase(tone: string): void {
  const context = getAudioContext();
  if (!context || context.state !== "running") return;
  const entries = tonePhrases[tone] || tonePhrases.loud;
  const now = context.currentTime + 0.025;
  const type: OscillatorType = "square";
  // Keep ample headroom below digital clipping while using a piercing alarm level.
  const volume = 0.92;

  for (const entry of entries) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + entry.offset;
    oscillator.type = type;
    oscillator.frequency.value = entry.frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
    oscillator.connect(gain).connect(context.destination);
    activeOscillators.add(oscillator);
    oscillator.onended = () => {
      activeOscillators.delete(oscillator);
      try {
        oscillator.disconnect();
        gain.disconnect();
      } catch {
        // Nodes may already have been disconnected by the stop control.
      }
    };
    oscillator.start(start);
    oscillator.stop(start + 0.22);
  }
}

export function readRingingAlarms(): ActiveRing[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RINGING_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ActiveRing =>
        Boolean(item) &&
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        typeof item.tone === "string",
    );
  } catch {
    return [];
  }
}

export function primeAlarmAudio(): void {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
}

export function startAlarmTone(tone = "loud"): void {
  if (toneLoopActive) return;
  toneLoopActive = true;
  const tick = async () => {
    if (!toneLoopActive) return;
    const context = getAudioContext();
    if (!context) {
      toneLoopActive = false;
      return;
    }
    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        // The alert stays visible; browsers can require a user gesture to enable sound.
      }
    }
    if (!toneLoopActive) return;
    emitTonePhrase(tone);
    ringLoopTimer = window.setTimeout(tick, 1400);
  };
  void tick();
}

export function playAlarmPreview(tone = "loud"): void {
  if (toneLoopActive) return;
  const context = getAudioContext();
  if (!context) return;
  const play = () => emitTonePhrase(tone);
  if (context.state === "suspended") {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}

export function ringAlarm(label: string, tone = "loud", id = `alarm-${Date.now()}`): void {
  if (typeof window === "undefined") return;
  const current = readRingingAlarms();
  const event: ActiveRing = { id, label, tone, startedAt: Date.now() };
  const next = [...current.filter(item => item.id !== id), event];
  try {
    window.localStorage.setItem(RINGING_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The in-page alert and audio still run if browser storage is unavailable.
  }
  startAlarmTone(tone);
  void notifyDevice(label, {
    body: "افتح LearnHub لإيقاف التنبيه ومتابعة خطوتك الحالية.",
    tag: id,
    url: "/?notification=alarm",
  });
  window.dispatchEvent(new CustomEvent("app-alarm-ringing", { detail: next }));
}

export function stopAlarmTone(): void {
  toneLoopActive = false;
  if (typeof window !== "undefined" && ringLoopTimer !== null) {
    window.clearTimeout(ringLoopTimer);
  }
  ringLoopTimer = null;
  activeOscillators.forEach(oscillator => {
    try {
      oscillator.stop();
    } catch {
      // The oscillator may already have stopped naturally.
    }
    try {
      oscillator.disconnect();
    } catch {
      // It may already be disconnected.
    }
  });
  activeOscillators.clear();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(RINGING_STORAGE_KEY);
    } catch {
      // The app still clears its in-memory ring state below.
    }
    window.dispatchEvent(new CustomEvent("app-alarm-stopped"));
  }
}
