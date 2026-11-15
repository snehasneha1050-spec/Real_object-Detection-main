import fs from 'fs';
import path from 'path';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { JSDOM } from 'jsdom';

const imgPath = "C:/Users/sneha/.gemini/antigravity/brain/d4b71b68-0165-481f-9538-d0ddfc4d0eef/.user_uploaded/media_1794729078126_8ae006e6.jpg";
console.log("Image exists:", fs.existsSync(imgPath));

async function run() {
  await tf.ready();
  console.log("TensorFlow ready, backend:", tf.getBackend());
  const model = await cocoSsd.load({ base: "mobilenet_v2" });
  console.log("Model loaded!");

  // Use pure 3D tensor from decoded JPEG if available or pure pixel buffer
  // In node, we can read the image buffer and decode it with tf.node if available or test via jpeg-js
}
run().catch(console.error);
