export interface DetectionEvent {
  id: string;
  objectName: string;
  confidence: number;
  timestamp: number;
  thumbnail?: string;
}

const STORAGE_KEY = 'ai-detect-history';

export function getHistory(): DetectionEvent[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveDetection(event: DetectionEvent) {
  const history = getHistory();
  history.unshift(event);
  // Keep max 500 entries
  if (history.length > 500) history.length = 500;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function deleteDetection(id: string) {
  const history = getHistory().filter(e => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}
