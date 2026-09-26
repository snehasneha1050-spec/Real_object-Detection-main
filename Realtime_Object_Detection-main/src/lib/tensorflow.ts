import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as mobilenet from "@tensorflow-models/mobilenet";

export interface Detection {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}

export interface TrackedDetection extends Detection {
  trackId: number;
}

export interface DetailedClassification {
  className: string;
  probability: number;
}

export class TensorFlowDetector {
  private model: cocoSsd.ObjectDetection | null = null;
  private classifier: mobilenet.MobileNet | null = null;
  private isLoading = false;

  /**
   * Initialize TensorFlow.js and load models
   * Loads mobilenet_v2 base for high-resolution small and big object detection,
   * plus MobileNet for 1000+ detailed object categories.
   */
  async initialize(): Promise<void> {
    if (this.model || this.isLoading) return;

    this.isLoading = true;
    try {
      await tf.ready();

      // Load COCO-SSD with mobilenet_v2 for superior accuracy on both small and large objects
      this.model = await cocoSsd.load({ base: "mobilenet_v2" });

      // Also load MobileNet to recognize 1,000 specific everyday items (pen, watch, notebook, keys, etc.)
      try {
        this.classifier = await mobilenet.load({ version: 2, alpha: 1.0 });
      } catch (err) {
        console.warn("MobileNet classifier optional load error:", err);
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
   * Detect objects in an image or video frame.
   * Uses internal minScore of 0.15 and maxNumBoxes=100 so small objects are never cut off.
   */
  async detect(
    input: HTMLImageElement | HTMLVideoElement | ImageData,
    threshold: number = 0.25
  ): Promise<Detection[]> {
    if (!this.model) {
      throw new Error("Model not loaded. Call initialize() first.");
    }

    try {
      // Allow detection of up to 100 objects down to threshold or 0.12 min score
      const minInternalScore = Math.min(Math.max(threshold, 0.05), 0.15);
      const predictions = await this.model.detect(input, 100, minInternalScore);
      return predictions
        .filter(prediction => prediction.score >= threshold)
        .map(prediction => ({
          class: prediction.class,
          score: prediction.score,
          bbox: prediction.bbox as [number, number, number, number]
        }));
    } catch (error) {
      console.error("Detection failed:", error);
      throw error;
    }
  }

  /**
   * Classify specific objects in the frame from 1000+ ImageNet classes
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

  getStatus(): { isLoading: boolean; isReady: boolean } {
    return {
      isLoading: this.isLoading,
      isReady: this.isReady()
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

// Utility functions for common operations
export const initializeTensorFlow = () => detector.initialize();

export const isTensorFlowReady = () => detector.isReady();

export const detectObjects = (
  input: HTMLImageElement | HTMLVideoElement | ImageData,
  threshold: number = 0.25
) => detector.detect(input, threshold);

export const classifyObjects = (
  input: HTMLImageElement | HTMLVideoElement | ImageData | HTMLCanvasElement,
  topK: number = 3
) => detector.classify(input, topK);