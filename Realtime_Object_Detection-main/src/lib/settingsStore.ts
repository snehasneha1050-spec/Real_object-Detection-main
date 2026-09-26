const SETTINGS_KEY = 'detectra-settings';

export interface AppSettings {
  // Detection
  confidenceThreshold: number;
  trackingEnabled: boolean;
  countingEnabled: boolean;
  // UI
  darkMode: boolean;
  soundEnabled: boolean;
  animationsEnabled: boolean;
  // Performance
  frameRate: number; // 1-60
  performanceMode: boolean;
}

const defaults: AppSettings = {
  confidenceThreshold: 0.25,
  trackingEnabled: true,
  countingEnabled: true,
  darkMode: true,
  soundEnabled: true,
  animationsEnabled: true,
  frameRate: 30,
  performanceMode: false,
};

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function playClickSound() {
  const settings = getSettings();
  if (!settings.soundEnabled) return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.value = 0.08;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch (error) {
    console.error('Audio error:', error);
  }
}
