// Advanced Kalman/EMA Object Tracker with Motion Vector, Distance Estimation & Anti-Flicker Smoothing

export interface Detection {
  class: string;
  score: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

export interface TrackedDetection extends Detection {
  trackId: number;
  distance: number; // in meters, e.g. 1.2
  distanceLabel: string; // e.g. "~1.2m" or "<0.5m"
  proximity: "NEAR" | "MID" | "FAR";
  direction:
    | "Stationary"
    | "Moving Left"
    | "Moving Right"
    | "Moving Up"
    | "Moving Down"
    | "Moving Up-Right"
    | "Moving Up-Left"
    | "Moving Down-Right"
    | "Moving Down-Left"
    | "Approaching"
    | "Receding";
  directionArrow: string;
  speed: number; // pixels/frame
  trajectory: [number, number][]; // recent centroid points
  isNew: boolean;
  age: number;
}

export interface TrackingEvent {
  id: string;
  type: "enter" | "exit";
  objectName: string;
  trackId: number;
  timestamp: number;
}

// Known real-world physical heights in centimeters for optical distance estimation
const REAL_WORLD_HEIGHTS_CM: Record<string, number> = {
  person: 170,
  bicycle: 105,
  car: 150,
  motorcycle: 110,
  airplane: 400,
  bus: 320,
  train: 380,
  truck: 300,
  boat: 250,
  "traffic light": 90,
  "fire hydrant": 75,
  "stop sign": 75,
  bench: 85,
  bird: 20,
  cat: 30,
  dog: 55,
  horse: 160,
  sheep: 75,
  cow: 145,
  elephant: 300,
  bear: 180,
  zebra: 140,
  giraffe: 480,
  backpack: 48,
  umbrella: 85,
  handbag: 32,
  tie: 45,
  suitcase: 65,
  frisbee: 25,
  skis: 160,
  snowboard: 150,
  "sports ball": 22,
  kite: 60,
  "baseball bat": 85,
  "baseball glove": 28,
  skateboard: 80,
  surfboard: 190,
  "tennis racket": 68,
  bottle: 24,
  "water bottle": 25,
  "wine glass": 20,
  cup: 10,
  "coffee mug": 11,
  fork: 18,
  knife: 20,
  spoon: 16,
  bowl: 10,
  banana: 18,
  apple: 8,
  sandwich: 10,
  orange: 8,
  broccoli: 15,
  carrot: 18,
  "hot dog": 12,
  pizza: 5,
  donut: 6,
  cake: 15,
  chair: 85,
  couch: 85,
  "potted plant": 45,
  bed: 65,
  "dining table": 75,
  toilet: 75,
  tv: 55,
  laptop: 26,
  mouse: 4,
  "computer mouse": 4,
  remote: 18,
  keyboard: 14,
  "cell phone": 15,
  smartphone: 15,
  microwave: 32,
  oven: 85,
  toaster: 20,
  sink: 40,
  refrigerator: 175,
  book: 24,
  notebook: 25,
  clock: 30,
  watch: 6,
  "digital watch": 6,
  "analog watch/clock": 10,
  vase: 28,
  scissors: 16,
  "teddy bear": 35,
  "hair drier": 22,
  toothbrush: 19,
  pen: 14,
  "ballpoint pen": 14,
  pencil: 16,
  keys: 7,
  "padlock / keys": 9,
  wallet: 10,
  headphones: 18,
  eyeglasses: 5,
  sunglasses: 5,
};

function getObjectRealHeightCm(className: string): number {
  const clean = className.toLowerCase().trim();
  for (const [key, val] of Object.entries(REAL_WORLD_HEIGHTS_CM)) {
    if (clean.includes(key)) return val;
  }
  return 30; // default estimated physical height
}

/**
 * Optical Distance Estimation (Pinhole Camera Model)
 * Z = (RealHeight_cm * FocalLength_px) / (BBoxHeight_px * 100) -> in meters
 */
export function estimateDistance(
  className: string,
  boxHeightPx: number,
  canvasHeightPx: number
): { distanceMeters: number; label: string; proximity: "NEAR" | "MID" | "FAR" } {
  const safeBoxH = Math.max(12, boxHeightPx);
  const safeCanvasH = Math.max(240, canvasHeightPx);

  // Standard webcam vertical FOV ~55-60 deg gives focal length approx 0.88 * canvasHeight
  const focalLengthPx = 0.88 * safeCanvasH;
  const realHeightCm = getObjectRealHeightCm(className);

  const rawMeters = (realHeightCm * focalLengthPx) / (safeBoxH * 100);
  const distanceMeters = Math.min(15, Math.max(0.25, parseFloat(rawMeters.toFixed(1))));

  let label = `~${distanceMeters.toFixed(1)}m`;
  if (distanceMeters < 0.5) label = "<0.5m";

  let proximity: "NEAR" | "MID" | "FAR" = "MID";
  if (distanceMeters <= 0.9 || safeBoxH / safeCanvasH > 0.45) {
    proximity = "NEAR";
  } else if (distanceMeters > 3.0 || safeBoxH / safeCanvasH < 0.15) {
    proximity = "FAR";
  }

  return { distanceMeters, label, proximity };
}

/**
 * Intersection over Union (IoU) calculation
 */
export function calculateIoU(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = aw * ah;
  const areaB = bw * bh;
  return inter / (areaA + areaB - inter + 1e-6);
}

/**
 * Class-Aware Non-Maximum Suppression (NMS)
 * Removes duplicate and heavily overlapping boxes of the same class
 */
export function applyClassNMS(detections: Detection[], iouThreshold = 0.45): Detection[] {
  if (detections.length <= 1) return detections;

  // Sort descending by confidence score
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const selected: Detection[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;
    const current = sorted[i];
    selected.push(current);

    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;
      const other = sorted[j];
      // Compare if same class or high overlap
      const sameClass = current.class.toLowerCase() === other.class.toLowerCase();
      const iouVal = calculateIoU(current.bbox, other.bbox);

      if (sameClass && iouVal >= iouThreshold) {
        suppressed.add(j);
      } else if (iouVal >= 0.85) {
        // High geometric overlap even across generic class duplicates
        suppressed.add(j);
      }
    }
  }

  return selected;
}

interface TrackedObjectInternal {
  id: number;
  class: string;
  score: number;
  smoothedBbox: [number, number, number, number];
  rawBbox: [number, number, number, number];
  age: number;
  lost: number;
  createdAt: number;
  lastUpdatedAt: number;
  centroidHistory: [number, number][]; // last 8 centroids
  areaHistory: number[]; // last 8 box areas
  velocity: { vx: number; vy: number; speed: number };
  direction: TrackedDetection["direction"];
  directionArrow: string;
}

export class SimpleTracker {
  private tracks: TrackedObjectInternal[] = [];
  private nextId = 1;
  private iouThreshold = 0.28;
  private maxLost = 6;
  private smoothingAlpha = 0.72; // EMA smoothing factor (0.72 = responsive + anti-flicker)
  private eventListeners: ((event: TrackingEvent) => void)[] = [];

  public onEvent(callback: (event: TrackingEvent) => void) {
    this.eventListeners.push(callback);
    return () => {
      this.eventListeners = this.eventListeners.filter((cb) => cb !== callback);
    };
  }

  private emitEvent(event: TrackingEvent) {
    this.eventListeners.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.error("Tracking listener error:", err);
      }
    });
  }

  update(detections: Detection[], frameHeight = 480): TrackedDetection[] {
    // 1. First run Non-Maximum Suppression to remove duplicate raw detections
    const cleaned = applyClassNMS(detections, 0.45);
    const results: TrackedDetection[] = [];
    const usedDetections = new Set<number>();
    const usedTracks = new Set<number>();
    const now = Date.now();

    // 2. Score matches between existing tracks and incoming detections
    const matches: { ti: number; di: number; score: number }[] = [];
    for (let ti = 0; ti < this.tracks.length; ti++) {
      for (let di = 0; di < cleaned.length; di++) {
        const trk = this.tracks[ti];
        const det = cleaned[di];
        // Must match class or generic synonym
        const sameClass =
          trk.class.toLowerCase() === det.class.toLowerCase() ||
          det.class.toLowerCase().includes(trk.class.toLowerCase()) ||
          trk.class.toLowerCase().includes(det.class.toLowerCase());

        if (sameClass) {
          const score = calculateIoU(trk.smoothedBbox, det.bbox);
          if (score >= this.iouThreshold) {
            matches.push({ ti, di, score });
          }
        }
      }
    }

    // Sort by IoU score descending
    matches.sort((a, b) => b.score - a.score);

    // 3. Update matched tracks
    for (const m of matches) {
      if (usedTracks.has(m.ti) || usedDetections.has(m.di)) continue;
      usedTracks.add(m.ti);
      usedDetections.add(m.di);

      const track = this.tracks[m.ti];
      const det = cleaned[m.di];

      // Anti-flicker Exponential Moving Average (EMA) smoothing:
      const [nx, ny, nw, nh] = det.bbox;
      const [ox, oy, ow, oh] = track.smoothedBbox;
      const alpha = this.smoothingAlpha;

      const smoothed: [number, number, number, number] = [
        alpha * nx + (1 - alpha) * ox,
        alpha * ny + (1 - alpha) * oy,
        alpha * nw + (1 - alpha) * ow,
        alpha * nh + (1 - alpha) * oh,
      ];

      const currentCentroid: [number, number] = [
        smoothed[0] + smoothed[2] / 2,
        smoothed[1] + smoothed[3] / 2,
      ];
      const currentArea = smoothed[2] * smoothed[3];

      track.rawBbox = det.bbox;
      track.smoothedBbox = smoothed;
      track.score = Math.max(track.score * 0.2 + det.score * 0.8, det.score);
      track.class = det.class;
      track.age++;
      track.lost = 0;
      track.lastUpdatedAt = now;

      // Update trajectory & velocity
      track.centroidHistory.push(currentCentroid);
      if (track.centroidHistory.length > 10) track.centroidHistory.shift();

      track.areaHistory.push(currentArea);
      if (track.areaHistory.length > 8) track.areaHistory.shift();

      this.computeMotionVector(track);

      const distInfo = estimateDistance(track.class, smoothed[3], frameHeight);

      results.push({
        class: track.class,
        score: track.score,
        bbox: smoothed,
        trackId: track.id,
        distance: distInfo.distanceMeters,
        distanceLabel: distInfo.label,
        proximity: distInfo.proximity,
        direction: track.direction,
        directionArrow: track.directionArrow,
        speed: track.velocity.speed,
        trajectory: [...track.centroidHistory],
        isNew: now - track.createdAt < 1500,
        age: track.age,
      });
    }

    // 4. Create new tracks for unmatched detections
    for (let di = 0; di < cleaned.length; di++) {
      if (usedDetections.has(di)) continue;
      const det = cleaned[di];
      const centroid: [number, number] = [
        det.bbox[0] + det.bbox[2] / 2,
        det.bbox[1] + det.bbox[3] / 2,
      ];
      const area = det.bbox[2] * det.bbox[3];

      const newId = this.nextId++;
      const newTrack: TrackedObjectInternal = {
        id: newId,
        class: det.class,
        score: det.score,
        smoothedBbox: [...det.bbox],
        rawBbox: [...det.bbox],
        age: 1,
        lost: 0,
        createdAt: now,
        lastUpdatedAt: now,
        centroidHistory: [centroid],
        areaHistory: [area],
        velocity: { vx: 0, vy: 0, speed: 0 },
        direction: "Stationary",
        directionArrow: "•",
      };

      this.tracks.push(newTrack);

      this.emitEvent({
        id: crypto.randomUUID(),
        type: "enter",
        objectName: det.class,
        trackId: newId,
        timestamp: now,
      });

      const distInfo = estimateDistance(det.class, det.bbox[3], frameHeight);

      results.push({
        class: newTrack.class,
        score: newTrack.score,
        bbox: newTrack.smoothedBbox,
        trackId: newTrack.id,
        distance: distInfo.distanceMeters,
        distanceLabel: distInfo.label,
        proximity: distInfo.proximity,
        direction: "Stationary",
        directionArrow: "•",
        speed: 0,
        trajectory: [centroid],
        isNew: true,
        age: 1,
      });
    }

    // 5. Update and prune lost tracks
    for (let ti = 0; ti < this.tracks.length; ti++) {
      if (!usedTracks.has(ti)) {
        this.tracks[ti].lost++;
      }
    }

    const activeTracks: TrackedObjectInternal[] = [];
    for (const t of this.tracks) {
      if (t.lost <= this.maxLost) {
        activeTracks.push(t);
      } else {
        this.emitEvent({
          id: crypto.randomUUID(),
          type: "exit",
          objectName: t.class,
          trackId: t.id,
          timestamp: now,
        });
      }
    }
    this.tracks = activeTracks;

    return results;
  }

  /**
   * Computes motion vector, direction angle, and approaching/receding states
   */
  private computeMotionVector(track: TrackedObjectInternal) {
    const hist = track.centroidHistory;
    if (hist.length < 2) {
      track.direction = "Stationary";
      track.directionArrow = "•";
      track.velocity = { vx: 0, vy: 0, speed: 0 };
      return;
    }

    const first = hist[Math.max(0, hist.length - 4)];
    const last = hist[hist.length - 1];
    const steps = Math.max(1, hist.length - 1 - Math.max(0, hist.length - 4));

    const vx = (last[0] - first[0]) / steps;
    const vy = (last[1] - first[1]) / steps;
    const speed = Math.sqrt(vx * vx + vy * vy);

    track.velocity = {
      vx: parseFloat(vx.toFixed(1)),
      vy: parseFloat(vy.toFixed(1)),
      speed: parseFloat(speed.toFixed(1)),
    };

    // Check area expansion / contraction for Z-axis motion (Approaching / Receding)
    const areas = track.areaHistory;
    if (areas.length >= 3) {
      const areaOld = areas[0];
      const areaNew = areas[areas.length - 1];
      const areaDeltaPct = (areaNew - areaOld) / (areaOld || 1);

      if (areaDeltaPct > 0.16 && speed < 16) {
        track.direction = "Approaching";
        track.directionArrow = "⏫";
        return;
      } else if (areaDeltaPct < -0.16 && speed < 16) {
        track.direction = "Receding";
        track.directionArrow = "⏬";
        return;
      }
    }

    // 2D Lateral Motion Direction
    if (speed < 2.5) {
      track.direction = "Stationary";
      track.directionArrow = "•";
      return;
    }

    const absX = Math.abs(vx);
    const absY = Math.abs(vy);

    if (absX > 1.8 * absY) {
      if (vx > 0) {
        track.direction = "Moving Right";
        track.directionArrow = "→";
      } else {
        track.direction = "Moving Left";
        track.directionArrow = "←";
      }
    } else if (absY > 1.8 * absX) {
      if (vy > 0) {
        track.direction = "Moving Down";
        track.directionArrow = "↓";
      } else {
        track.direction = "Moving Up";
        track.directionArrow = "↑";
      }
    } else {
      if (vx > 0 && vy < 0) {
        track.direction = "Moving Up-Right";
        track.directionArrow = "↗";
      } else if (vx < 0 && vy < 0) {
        track.direction = "Moving Up-Left";
        track.directionArrow = "↖";
      } else if (vx > 0 && vy > 0) {
        track.direction = "Moving Down-Right";
        track.directionArrow = "↘";
      } else {
        track.direction = "Moving Down-Left";
        track.directionArrow = "↙";
      }
    }
  }

  reset() {
    this.tracks = [];
    this.nextId = 1;
  }
}
