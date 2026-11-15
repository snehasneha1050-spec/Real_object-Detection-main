import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as mobilenet from "@tensorflow-models/mobilenet";
import { applyClassNMS, Detection } from "./tracker";

export type { Detection };

export interface DetailedClassification {
  className: string;
  probability: number;
}

export interface SAHIOptions {
  enabled: boolean;
  sliceGridRows?: number; // e.g. 2
  sliceGridCols?: number; // e.g. 2
  overlapRatio?: number; // e.g. 0.20
  tileThreshold?: number; // sensitivity threshold on tiles
}

export class TensorFlowDetector {
  private model: cocoSsd.ObjectDetection | null = null;
  private classifier: mobilenet.MobileNet | null = null;
  private isLoading = false;
  private currentBase: "mobilenet_v2" | "lite_mobilenet_v2" = "mobilenet_v2";

  /**
   * Initialize TensorFlow.js with WebGL hardware acceleration
   * Loads Single-Stage SSD MobileNet V2 Backbone + ImageNet 1000 Deep Classifier
   */
  async initialize(base: "mobilenet_v2" | "lite_mobilenet_v2" = "mobilenet_v2"): Promise<void> {
    if (this.model && this.currentBase === base && !this.isLoading) return;

    this.isLoading = true;
    this.currentBase = base;
    try {
      await tf.ready();

      // Ensure WebGL backend is used for GPU hardware shader acceleration
      if (tf.getBackend() !== "webgl") {
        try {
          await tf.setBackend("webgl");
        } catch {
          // Fallback to cpu if webgl is not available
        }
      }

      // Load Single-Stage COCO-SSD Detector
      this.model = await cocoSsd.load({ base });

      // Load 1000+ Class Deep Classifier for fine-grained small everyday objects
      if (!this.classifier) {
        try {
          this.classifier = await mobilenet.load({ version: 2, alpha: 1.0 });
        } catch (err) {
          console.warn("MobileNet classifier optional load warning:", err);
        }
      }
    } catch (error) {
      console.error("Failed to load TensorFlow.js model:", error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  isReady(): boolean {
    return this.model !== null;
  }

  /**
   * Standard single-pass object detection
   */
  async detect(
    input: HTMLImageElement | HTMLVideoElement | ImageData | HTMLCanvasElement,
    threshold: number = 0.20
  ): Promise<Detection[]> {
    if (!this.model) {
      throw new Error("Model not loaded. Call initialize() first.");
    }

    try {
      // minScore allows extracting weak candidate signals for small items and partially occluded people
      const minInternalScore = Math.min(Math.max(threshold, 0.05), 0.10);
      const predictions = await this.model.detect(input, 100, minInternalScore);
      const filtered = predictions
        .filter((prediction) =>
          prediction.class.toLowerCase() === "person"
            ? prediction.score >= Math.max(0.14, threshold * 0.70)
            : prediction.score >= threshold
        )
        .map((prediction) => ({
          class: prediction.class,
          score: prediction.score,
          bbox: prediction.bbox as [number, number, number, number],
        }));

      return applyClassNMS(filtered, 0.58);
    } catch (error) {
      console.error("Detection failed:", error);
      throw error;
    }
  }

  /**
   * SAHI (Slicing Aided Hyper Inference) Engine for Small & Distant Object Detection
   * Performs full-frame inference + sliced tile inference across overlapping patches,
   * projecting localized coordinates back to the global image coordinate system.
   */
  async detectSAHI(
    sourceCanvas: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
    threshold: number = 0.20,
    options: SAHIOptions = { enabled: true, sliceGridRows: 2, sliceGridCols: 2, overlapRatio: 0.2 }
  ): Promise<Detection[]> {
    if (!this.model) {
      throw new Error("Model not loaded. Call initialize() first.");
    }

    // 1. Full-frame base inference (captures large and medium context)
    const globalPredictions = await this.detect(sourceCanvas, threshold);

    if (!options.enabled) {
      return globalPredictions;
    }

    // 2. Determine input dimensions
    let srcW = 640;
    let srcH = 480;
    if ("videoWidth" in sourceCanvas && sourceCanvas.videoWidth > 0) {
      srcW = sourceCanvas.videoWidth;
      srcH = sourceCanvas.videoHeight;
    } else if ("naturalWidth" in sourceCanvas && sourceCanvas.naturalWidth > 0) {
      srcW = sourceCanvas.naturalWidth;
      srcH = sourceCanvas.naturalHeight;
    } else if ("width" in sourceCanvas && sourceCanvas.width > 0) {
      srcW = sourceCanvas.width;
      srcH = sourceCanvas.height;
    }

    const rows = options.sliceGridRows || 2;
    const cols = options.sliceGridCols || 2;
    const overlap = options.overlapRatio || 0.22;
    const tileThreshold = options.tileThreshold || Math.max(0.12, threshold * 0.65);

    // Calculate tile dimensions with overlap
    const tileW = Math.round(srcW / (cols - (cols - 1) * overlap));
    const tileH = Math.round(srcH / (rows - (rows - 1) * overlap));
    const stepX = Math.round(tileW * (1 - overlap));
    const stepY = Math.round(tileH * (1 - overlap));

    // Multi-Scale Multi-Aspect Slices:
    // Slices specifically handle side-by-side persons (e.g. 2 kids on a bicycle), sitting/crouching humans, as well as tiny objects
    const slices: { sx: number; sy: number; sw: number; sh: number }[] = [
      // Left vertical half (isolates passenger / left-seated person)
      { sx: 0, sy: 0, sw: Math.round(srcW * 0.65), sh: srcH },
      // Right vertical half (isolates right-seated person / front rider)
      { sx: Math.round(srcW * 0.35), sy: 0, sw: Math.round(srcW * 0.65), sh: srcH },
      // Upper-Left Human Torso & Head Cascade (isolates sitting/occluded child or person)
      { sx: 0, sy: 0, sw: Math.round(srcW * 0.60), sh: Math.round(srcH * 0.72) },
      // Upper-Right Human Torso & Head Cascade
      { sx: Math.round(srcW * 0.40), sy: 0, sw: Math.round(srcW * 0.60), sh: Math.round(srcH * 0.72) },
      // Center focal zone
      {
        sx: Math.round(srcW * 0.18),
        sy: Math.round(srcH * 0.12),
        sw: Math.round(srcW * 0.64),
        sh: Math.round(srcH * 0.76),
      },
    ];

    // Add quadrant grid tiles for tiny items
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sx = Math.min(srcW - tileW, c * stepX);
        const sy = Math.min(srcH - tileH, r * stepY);
        slices.push({ sx, sy, sw: tileW, sh: tileH });
      }
    }

    const tileCanvas = document.createElement("canvas");
    const tileCtx = tileCanvas.getContext("2d", { willReadFrequently: true });
    if (!tileCtx) return globalPredictions;

    const allDetections: Detection[] = [...globalPredictions];

    // 3. Infer over each slice
    for (const slice of slices) {
      tileCanvas.width = slice.sw;
      tileCanvas.height = slice.sh;
      tileCtx.clearRect(0, 0, slice.sw, slice.sh);
      tileCtx.drawImage(
        sourceCanvas,
        slice.sx,
        slice.sy,
        slice.sw,
        slice.sh,
        0,
        0,
        slice.sw,
        slice.sh
      );

      try {
        const tilePredictions = await this.model.detect(tileCanvas, 30, tileThreshold);
        for (const pred of tilePredictions) {
          // If person, be slightly more permissive for occluded sitting postures
          const minRequired =
            pred.class.toLowerCase() === "person"
              ? Math.max(0.12, tileThreshold * 0.85)
              : tileThreshold;

          if (pred.score >= minRequired) {
            const [bx, by, bw, bh] = pred.bbox;
            // Project back into global coordinates
            allDetections.push({
              class: pred.class,
              score: pred.score,
              bbox: [slice.sx + bx, slice.sy + by, bw, bh],
            });
          }
        }
      } catch {
        // Continue on slice failure
      }
    }

    // 4. Merge global + multi-scale tile detections with Intelligent Class-Aware NMS
    return applyClassNMS(allDetections, 0.58);
  }

  /**
   * Classify specific objects in the frame from 1000+ ImageNet classes
   * Used for fine-grained everyday objects: pens, watches, notebooks, keys, tools
   */
  async classify(
    input: HTMLImageElement | HTMLVideoElement | ImageData | HTMLCanvasElement,
    topK: number = 3
  ): Promise<DetailedClassification[]> {
    if (!this.classifier) return [];
    try {
      return await this.classifier.classify(input, topK);
    } catch (err) {
      console.warn("Classification failed:", err);
      return [];
    }
  }

  getStatus(): { isLoading: boolean; isReady: boolean; base: string } {
    return {
      isLoading: this.isLoading,
      isReady: this.isReady(),
      base: this.currentBase,
    };
  }

  dispose(): void {
    if (this.model) {
      this.model = null;
    }
    if (this.classifier) {
      this.classifier = null;
    }
  }
}

// Singleton instance for the application
export const detector = new TensorFlowDetector();

export const initializeTensorFlow = (base?: "mobilenet_v2" | "lite_mobilenet_v2") =>
  detector.initialize(base);

export const isTensorFlowReady = () => detector.isReady();

export const detectObjects = (
  input: HTMLImageElement | HTMLVideoElement | ImageData | HTMLCanvasElement,
  threshold: number = 0.20
) => detector.detect(input, threshold);

export const detectObjectsSAHI = (
  sourceCanvas: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  threshold: number = 0.20,
  options?: SAHIOptions
) => detector.detectSAHI(sourceCanvas, threshold, options);

export const classifyObjects = (
  input: HTMLImageElement | HTMLVideoElement | ImageData | HTMLCanvasElement,
  topK: number = 3
) => detector.classify(input, topK);

export { tf };

export function getTensorFlowStats() {
  try {
    const mem = tf.memory();
    const backend = tf.getBackend();
    return {
      backend: backend || "webgl",
      numTensors: mem.numTensors || 0,
      numBytes: mem.numBytes || 0,
    };
  } catch {
    return {
      backend: "webgl",
      numTensors: 0,
      numBytes: 0,
    };
  }
}
