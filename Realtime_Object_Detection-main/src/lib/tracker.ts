// Simple IoU-based object tracker
interface TrackedObject {
  id: number;
  class: string;
  bbox: [number, number, number, number];
  score: number;
  age: number;
  lost: number;
}

interface Detection {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}

export interface TrackedDetection extends Detection {
  trackId: number;
}

function iou(a: [number, number, number, number], b: [number, number, number, number]): number {
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

export class SimpleTracker {
  private tracks: TrackedObject[] = [];
  private nextId = 1;
  private iouThreshold = 0.3;
  private maxLost = 5;

  update(detections: Detection[]): TrackedDetection[] {
    const results: TrackedDetection[] = [];
    const usedDetections = new Set<number>();
    const usedTracks = new Set<number>();

    // Match existing tracks to detections
    const matches: { ti: number; di: number; score: number }[] = [];
    for (let ti = 0; ti < this.tracks.length; ti++) {
      for (let di = 0; di < detections.length; di++) {
        if (this.tracks[ti].class === detections[di].class) {
          const score = iou(this.tracks[ti].bbox, detections[di].bbox);
          if (score >= this.iouThreshold) {
            matches.push({ ti, di, score });
          }
        }
      }
    }
    matches.sort((a, b) => b.score - a.score);

    for (const m of matches) {
      if (usedTracks.has(m.ti) || usedDetections.has(m.di)) continue;
      usedTracks.add(m.ti);
      usedDetections.add(m.di);
      const track = this.tracks[m.ti];
      const det = detections[m.di];
      track.bbox = det.bbox;
      track.score = det.score;
      track.age++;
      track.lost = 0;
      results.push({ ...det, trackId: track.id });
    }

    // New tracks for unmatched detections
    for (let di = 0; di < detections.length; di++) {
      if (usedDetections.has(di)) continue;
      const det = detections[di];
      const track: TrackedObject = {
        id: this.nextId++,
        class: det.class,
        bbox: det.bbox,
        score: det.score,
        age: 1,
        lost: 0,
      };
      this.tracks.push(track);
      results.push({ ...det, trackId: track.id });
    }

    // Update lost tracks
    for (let ti = 0; ti < this.tracks.length; ti++) {
      if (!usedTracks.has(ti)) {
        this.tracks[ti].lost++;
      }
    }
    this.tracks = this.tracks.filter(t => t.lost <= this.maxLost);

    return results;
  }

  reset() {
    this.tracks = [];
    this.nextId = 1;
  }
}
