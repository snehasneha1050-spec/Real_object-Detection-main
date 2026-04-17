import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

export interface Detection {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}

export interface TrackedDetection extends Detection {
  trackId: number;
}

export class TensorFlowDetector {
  private model: cocoSsd.ObjectDetection | null = null;
  private isLoading = false;

  /**
   * Initialize TensorFlow.js and load the COCO-SSD model
   */
  async initialize(): Promise<void> {
    if (this.model || this.isLoading) return;

    this.isLoading = true;
    try {
      // Ensure TensorFlow.js is ready
      await tf.ready();

      // Load the COCO-SSD model with lite_mobilenet_v2 for better performance
      this.model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
    } catch (error) {
      console.error("Failed to load TensorFlow.js model:", error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Check if the model is loaded and ready
   */
  isReady(): boolean {
    return this.model !== null;
  }

  /**
   * Detect objects in an image or video frame
   * @param input - HTMLImageElement, HTMLVideoElement, or ImageData
   * @param threshold - Minimum confidence score (0-1)
   * @returns Array of detections
   */
  async detect(
    input: HTMLImageElement | HTMLVideoElement | ImageData,
    threshold: number = 0.5
  ): Promise<Detection[]> {
    if (!this.model) {
      throw new Error("Model not loaded. Call initialize() first.");
    }

    try {
      const predictions = await this.model.detect(input);
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
   * Get model loading status
   */
  getStatus(): { isLoading: boolean; isReady: boolean } {
    return {
      isLoading: this.isLoading,
      isReady: this.isReady()
    };
  }

  /**
   * Dispose of the model and free memory
   */
  dispose(): void {
    if (this.model) {
      // TensorFlow.js models don't have a direct dispose method
      // Memory will be freed by garbage collection
      this.model = null;
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
  threshold: number = 0.5
) => detector.detect(input, threshold);