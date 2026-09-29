import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Video,
  VideoOff,
  Camera,
  Activity,
  Settings2,
  Upload,
  ImageIcon,
  Crosshair,
  Volume2,
  VolumeX,
  Sparkles,
  Pin,
  Trash2,
} from "lucide-react";
import { saveDetection } from "@/lib/detectionStore";
import { getSettings } from "@/lib/settingsStore";
import { playClickSound } from "@/lib/settingsStore";
import { SimpleTracker, TrackedDetection } from "@/lib/tracker";
import {
  detector,
  Detection,
  initializeTensorFlow,
  isTensorFlowReady,
  detectObjects,
  classifyObjects,
  DetailedClassification,
} from "@/lib/tensorflow";
import ObjectSearchBar from "@/components/ObjectSearchBar";
import VoiceCommandButton from "@/components/VoiceCommandButton";
import { VoiceCommandResult } from "@/hooks/useVoiceCommands";

let lastSpokenText = "";
let lastSpokenTime = 0;

function speakObject(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const cleanName = cleanClassName(text);
  const now = Date.now();
  if (cleanName === lastSpokenText && now - lastSpokenTime < 6000) return;
  if (now - lastSpokenTime < 3000) return;

  lastSpokenText = cleanName;
  lastSpokenTime = now;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`${cleanName} detected`);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.volume = 0.9;
    window.speechSynthesis.speak(utterance);
  } catch {
    // ignore
  }
}

/**
 * Normalizes ImageNet & COCO classes into clean, professional titles
 * Handles pens, pencils, notebooks, watches, coins, keys, glasses, etc.
 */
function cleanClassName(raw: string): string {
  if (!raw) return "Object";
  const lower = raw.toLowerCase().trim();

  // High-frequency real-world objects
  if (lower.includes("ballpoint") || lower.includes("ballpen") || lower.includes("biro")) return "Ballpoint Pen";
  if (lower.includes("fountain pen")) return "Fountain Pen";
  if (lower.includes("pencil sharpener")) return "Pencil Sharpener";
  if (lower.includes("pencil box") || lower.includes("pencil case")) return "Pencil Case";
  if (lower.includes("eraser")) return "Eraser";
  if (lower.includes("notebook computer")) return "Laptop";
  if (lower.includes("notebook") || lower.includes("spiral notebook")) return "Notebook";
  if (lower.includes("digital watch")) return "Digital Watch";
  if (lower.includes("analog clock")) return "Analog Watch/Clock";
  if (lower.includes("wall clock")) return "Wall Clock";
  if (lower.includes("stopwatch")) return "Stopwatch";
  if (lower.includes("cellular") || lower.includes("cellphone") || lower.includes("mobile phone")) return "Smartphone";
  if (lower.includes("sunglass") || lower.includes("shades")) return "Sunglasses";
  if (lower.includes("spectacles") || lower.includes("eyeglass")) return "Eyeglasses";
  if (lower.includes("coffee mug")) return "Coffee Mug";
  if (lower.includes("water bottle")) return "Water Bottle";
  if (lower.includes("pill bottle")) return "Medicine Bottle";
  if (lower.includes("wallet") || lower.includes("billfold")) return "Wallet";
  if (lower.includes("padlock") || lower.includes("combination lock")) return "Padlock / Keys";
  if (lower.includes("headphone") || lower.includes("headset") || lower.includes("earphone")) return "Headphones";
  if (lower.includes("computer mouse")) return "Computer Mouse";
  if (lower.includes("keyboard") || lower.includes("keypad")) return "Keyboard";
  if (lower.includes("ruler") || lower.includes("tape measure")) return "Ruler";
  if (lower.includes("lighter")) return "Lighter";
  if (lower.includes("screwdriver")) return "Screwdriver";
  if (lower.includes("scissors")) return "Scissors";
  if (lower.includes("binder")) return "Binder / Notebook";
  if (lower.includes("paper towel") || lower.includes("tissue")) return "Tissue / Paper";
  if (lower.includes("cup") || lower.includes("teacup")) return "Cup";

  // General clean-up: take the first synonym and title-case
  const first = raw.split(",")[0].trim();
  return first
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Calculates Intersection over Union between two bounding boxes [x, y, w, h]
 */
function computeIoU(a: [number, number, number, number], b: [number, number, number, number]): number {
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

interface ScannedTarget {
  id: string;
  class: string;
  score: number;
  bbox: [number, number, number, number];
  timestamp: number;
  isPinned?: boolean;
}

export default function DetectionPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fps, setFps] = useState(0);
  const [detections, setDetections] = useState<TrackedDetection[]>([]);
  const [threshold, setThreshold] = useState(() => getSettings().confidenceThreshold);
  const [objectCount, setObjectCount] = useState(0);
  const [mode, setMode] = useState<"webcam" | "image">("webcam");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageDetecting, setImageDetecting] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [detailedItems, setDetailedItems] = useState<DetailedClassification[]>([]);
  const [focusedItem, setFocusedItem] = useState<DetailedClassification | null>(null);
  const [showReticle, setShowReticle] = useState(true);
  const [voiceAnnounce, setVoiceAnnounce] = useState(false);
  const [pinnedTargets, setPinnedTargets] = useState<ScannedTarget[]>([]);
  const [tapNotice, setTapNotice] = useState<string | null>(null);

  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const lastSaveRef = useRef<number>(0);
  const lastClassifyRef = useRef<number>(0);
  const trackerRef = useRef(new SimpleTracker());

  const searchFilterRef = useRef(searchFilter);
  searchFilterRef.current = searchFilter;
  const voiceEnabledRef = useRef(voiceAnnounce);
  voiceEnabledRef.current = voiceAnnounce;
  const focusedItemRef = useRef(focusedItem);
  focusedItemRef.current = focusedItem;
  const showReticleRef = useRef(showReticle);
  showReticleRef.current = showReticle;
  const pinnedTargetsRef = useRef(pinnedTargets);
  pinnedTargetsRef.current = pinnedTargets;
  const activeReticleTargetRef = useRef<ScannedTarget | null>(null);

  const filteredDetections = useMemo(() => {
    if (!searchFilter.trim()) return detections;
    return detections.filter((d) => d.class.toLowerCase().includes(searchFilter.toLowerCase()));
  }, [detections, searchFilter]);

  // Load TensorFlow.js models
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await initializeTensorFlow();
        if (!cancelled) setLoading(false);
      } catch (error) {
        console.error("Failed to initialize TensorFlow:", error);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startCamera = useCallback(async () => {
    playClickSound();
    if (!isTensorFlowReady()) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 640, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      trackerRef.current.reset();
      setRunning(true);
      setMode("webcam");
      setUploadedImage(null);
    } catch (err) {
      console.error("Camera error:", err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    playClickSound();
    setRunning(false);
    cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setDetections([]);
    setDetailedItems([]);
    setFocusedItem(null);
    setPinnedTargets([]);
    activeReticleTargetRef.current = null;
    setFps(0);
    trackerRef.current.reset();
  }, []);

  // Real-time Detection Loop
  useEffect(() => {
    if (!running || !isTensorFlowReady() || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    let lastTime = performance.now();
    let frameCount = 0;
    const settings = getSettings();

    const detect = async () => {
      if (!running) return;

      if (video.readyState === 4) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // 1. Run COCO-SSD detection
        const cocoPredictions = await detectObjects(video, threshold);
        const allPredictions: Detection[] = [...cocoPredictions];

        // 2. Merge Universal Reticle Target if active & fresh (<1200ms)
        const reticleTarget = activeReticleTargetRef.current;
        if (showReticleRef.current && reticleTarget && Date.now() - reticleTarget.timestamp < 1200 && reticleTarget.score >= 0.16) {
          const overlapIdx = allPredictions.findIndex((p) => computeIoU(p.bbox, reticleTarget.bbox) > 0.35);
          if (overlapIdx >= 0) {
            // Refine generic COCO classes with specific MobileNet label (e.g. book -> notebook, clock -> watch)
            const genericClasses = ["book", "cell phone", "bottle", "cup", "clock", "remote", "vase", "bowl"];
            if (genericClasses.includes(allPredictions[overlapIdx].class.toLowerCase())) {
              allPredictions[overlapIdx] = {
                ...allPredictions[overlapIdx],
                class: reticleTarget.class,
                score: Math.max(allPredictions[overlapIdx].score, reticleTarget.score),
              };
            }
          } else {
            // COCO missed this object (e.g. pen, watch, keys, coin, glasses, headphones, scissors)
            // Add universal detection box!
            allPredictions.push({
              class: reticleTarget.class,
              score: reticleTarget.score,
              bbox: reticleTarget.bbox,
            });
          }
        }

        // 3. Merge user pinned targets (active for 15s)
        const nowMs = Date.now();
        pinnedTargetsRef.current.forEach((pt) => {
          if (nowMs - pt.timestamp < 15000) {
            const exists = allPredictions.some((p) => computeIoU(p.bbox, pt.bbox) > 0.4);
            if (!exists) {
              allPredictions.push({
                class: pt.class,
                score: pt.score,
                bbox: pt.bbox,
              });
            }
          }
        });

        // 4. Update multi-object tracker
        const tracked = settings.trackingEnabled
          ? trackerRef.current.update(allPredictions)
          : allPredictions.map((d, i) => ({ ...d, trackId: i + 1 }));

        setDetections(tracked);
        setObjectCount(tracked.length);

        // 5. Draw video + bounding boxes + smart reticle
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0);
        drawDetections(
          ctx,
          tracked,
          settings.trackingEnabled,
          searchFilterRef.current,
          focusedItemRef.current,
          showReticleRef.current
        );

        // 6. FPS Calculation
        frameCount++;
        const now = performance.now();
        if (now - lastTime >= 1000) {
          setFps(frameCount);
          frameCount = 0;
          lastTime = now;
        }

        // 7. Universal 1000+ Class Classifier for ANY small or large object (every 400ms)
        if (now - lastClassifyRef.current > 400) {
          lastClassifyRef.current = now;
          const cropSize = Math.min(240, Math.min(video.videoWidth, video.videoHeight) * 0.48);
          const cropCanvas = document.createElement("canvas");
          cropCanvas.width = 224;
          cropCanvas.height = 224;
          const cropCtx = cropCanvas.getContext("2d");
          if (cropCtx) {
            const sx = (video.videoWidth - cropSize) / 2;
            const sy = (video.videoHeight - cropSize) / 2;
            cropCtx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, 224, 224);
            classifyObjects(cropCanvas, 3).then((res) => {
              if (res && res.length > 0) {
                setDetailedItems(res);
                setFocusedItem(res[0]);
                if (res[0].probability >= 0.16) {
                  const formatted = cleanClassName(res[0].className);
                  activeReticleTargetRef.current = {
                    id: "reticle-center",
                    class: formatted,
                    score: res[0].probability,
                    bbox: [sx, sy, cropSize, cropSize],
                    timestamp: Date.now(),
                  };
                  if (voiceEnabledRef.current && res[0].probability > 0.28) {
                    speakObject(formatted);
                  }
                } else {
                  activeReticleTargetRef.current = null;
                }
              }
            });
          }
        }

        // 8. Save detections periodically to history
        if (tracked.length > 0 && now - lastSaveRef.current > 3000) {
          lastSaveRef.current = now;
          tracked.forEach((d) => {
            saveDetection({
              id: crypto.randomUUID(),
              objectName: d.class,
              confidence: d.score,
              timestamp: Date.now(),
            });
          });
        }
      }

      animFrameRef.current = requestAnimationFrame(detect);
    };

    detect();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [running, threshold]);

  // Interactive Tap/Click-to-Scan on Canvas (Pinpoints ANY object on screen)
  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !isTensorFlowReady()) return;
    playClickSound();

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const cropSize = Math.min(220, Math.min(canvas.width, canvas.height) * 0.45);
    const sx = Math.max(0, Math.min(canvas.width - cropSize, clickX - cropSize / 2));
    const sy = Math.max(0, Math.min(canvas.height - cropSize, clickY - cropSize / 2));

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = 224;
    cropCanvas.height = 224;
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) return;

    // Use current video or image as source
    const source = (mode === "image" && canvas) ? canvas : (videoRef.current || canvas);
    cropCtx.drawImage(source, sx, sy, cropSize, cropSize, 0, 0, 224, 224);

    const res = await classifyObjects(cropCanvas, 3);
    if (res && res.length > 0 && res[0].probability >= 0.14) {
      const top = res[0];
      const name = cleanClassName(top.className);
      const newTarget: ScannedTarget = {
        id: `pin-${Date.now()}`,
        class: name,
        score: top.probability,
        bbox: [sx, sy, cropSize, cropSize],
        timestamp: Date.now(),
        isPinned: true,
      };
      setPinnedTargets((prev) => [newTarget, ...prev.filter((p) => computeIoU(p.bbox, newTarget.bbox) < 0.5)].slice(0, 5));
      setFocusedItem(top);
      setDetailedItems(res);
      setTapNotice(`🎯 Pinned: ${name} (${(top.probability * 100).toFixed(0)}%)`);
      setTimeout(() => setTapNotice(null), 3000);
      if (voiceEnabledRef.current) {
        speakObject(name);
      }
    }
  };

  // Image upload handler
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    playClickSound();
    const file = e.target.files?.[0];
    if (!file || !isTensorFlowReady()) return;

    stopCamera();
    setMode("image");
    setDetections([]);
    setObjectCount(0);
    setPinnedTargets([]);

    const url = URL.createObjectURL(file);
    setUploadedImage(url);

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
    };
    img.src = url;
  }, [stopCamera]);

  // Detect from Image with Multi-Zone Scan
  const detectFromImage = useCallback(async () => {
    if (!isTensorFlowReady() || !canvasRef.current || !uploadedImage) return;
    playClickSound();
    setImageDetecting(true);

    const img = new Image();
    img.onload = async () => {
      const canvas = canvasRef.current!;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      // 1. Full COCO-SSD Detection
      const cocoPredictions = await detectObjects(img, threshold);
      const allPredictions: Detection[] = [...cocoPredictions];

      // 2. Multi-Zone Universal MobileNet Scan (Center + 4 Quadrants)
      const zones = [
        { x: img.width * 0.25, y: img.height * 0.25, w: img.width * 0.5, h: img.height * 0.5 },
        { x: 0, y: 0, w: img.width * 0.5, h: img.height * 0.5 },
        { x: img.width * 0.5, y: 0, w: img.width * 0.5, h: img.height * 0.5 },
        { x: 0, y: img.height * 0.5, w: img.width * 0.5, h: img.height * 0.5 },
        { x: img.width * 0.5, y: img.height * 0.5, w: img.width * 0.5, h: img.height * 0.5 },
      ];

      for (const zone of zones) {
        const zCanvas = document.createElement("canvas");
        zCanvas.width = 224;
        zCanvas.height = 224;
        const zCtx = zCanvas.getContext("2d");
        if (zCtx) {
          zCtx.drawImage(img, zone.x, zone.y, zone.w, zone.h, 0, 0, 224, 224);
          const zRes = await classifyObjects(zCanvas, 2);
          if (zRes && zRes.length > 0 && zRes[0].probability >= 0.18) {
            const top = zRes[0];
            const name = cleanClassName(top.className);
            const zoneBbox: [number, number, number, number] = [zone.x, zone.y, zone.w, zone.h];
            const exists = allPredictions.some((p) => computeIoU(p.bbox, zoneBbox) > 0.35);
            if (!exists) {
              allPredictions.push({
                class: name,
                score: top.probability,
                bbox: zoneBbox,
              });
            }
          }
        }
      }

      const tracked = allPredictions.map((d, i) => ({ ...d, trackId: i + 1 }));
      setDetections(tracked);
      setObjectCount(tracked.length);

      drawDetections(ctx, tracked, false, searchFilterRef.current, null, false);

      // Classify full image
      classifyObjects(img, 3).then((res) => {
        if (res && res.length > 0) {
          setDetailedItems(res);
          setFocusedItem(res[0]);
          if (voiceEnabledRef.current && res[0].probability > 0.28) {
            speakObject(cleanClassName(res[0].className));
          }
        }
      });

      // Save
      tracked.forEach((d) => {
        saveDetection({
          id: crypto.randomUUID(),
          objectName: d.class,
          confidence: d.score,
          timestamp: Date.now(),
        });
      });

      setImageDetecting(false);
    };
    img.src = uploadedImage;
  }, [threshold, uploadedImage]);

  const captureScreenshot = () => {
    playClickSound();
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `detectra-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  const handleVoiceCommand = useCallback((result: VoiceCommandResult) => {
    if (result.action === "start_detection" && !running && isTensorFlowReady()) {
      startCamera();
    } else if (result.action === "stop_detection" && running) {
      stopCamera();
    } else if ((result.action === "find" || result.action === "search") && result.param) {
      setSearchFilter(result.param);
    }
  }, [running, startCamera, stopCamera]);

  const showCanvas = running || (mode === "image" && uploadedImage);

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
            Live <span className="text-primary">Detection</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">
            Universal Real-Time Object Recognition with Deep Neural Networks — Detects both common and everyday objects (pens, watches, notebooks, keys, phones, etc.)
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Video feed */}
          <div className="lg:col-span-2">
            <div className="hover-card rounded-xl overflow-hidden">
              <div className="relative aspect-video bg-muted flex items-center justify-center">
                <video ref={videoRef} className="hidden" muted playsInline />
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  title="Click anywhere to scan and lock any object"
                  className={`absolute inset-0 w-full h-full object-contain cursor-crosshair ${showCanvas ? "" : "hidden"}`}
                />
                {!showCanvas && (
                  <div className="text-center text-muted-foreground p-4">
                    {loading ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm">Loading AI models (COCO-SSD + MobileNet 1000+)...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <Video className="w-12 h-12 text-primary/50" />
                        <p className="text-sm sm:text-base">Start webcam or upload an image to begin</p>
                      </div>
                    )}
                  </div>
                )}

                {running && (
                  <div className="absolute top-3 left-3 bg-background/80 backdrop-blur rounded-md px-3 py-1 text-xs font-mono text-primary border border-border">
                    {fps} FPS
                  </div>
                )}

                {imageDetecting && (
                  <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-foreground font-medium">Scanning all objects in image...</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive Universal Mode Banner */}
              {showCanvas && (
                <div className="bg-secondary/40 border-t border-border px-3 py-2 text-xs flex items-center justify-between text-muted-foreground flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                    <span>
                      <strong className="text-foreground">Universal Scanner Active:</strong> Aim reticle or{" "}
                      <span className="text-primary font-medium underline underline-offset-2">tap anywhere on video</span> to lock ANY object (pens, watches, notebooks, keys, coins, etc.)
                    </span>
                  </div>
                  {tapNotice && (
                    <span className="text-emerald-400 font-semibold animate-pulse">{tapNotice}</span>
                  )}
                </div>
              )}

              {/* Controls */}
              <div className="p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-3 border-t border-border">
                {!running ? (
                  <button
                    onClick={startCamera}
                    disabled={loading || !isTensorFlowReady()}
                    className="btn-glow inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg gradient-cyan text-primary-foreground font-medium text-sm disabled:opacity-50 transition shadow-md"
                  >
                    <Video className="w-4 h-4" />
                    <span className="hidden sm:inline">Start Detection</span>
                    <span className="sm:hidden">Start</span>
                  </button>
                ) : (
                  <button
                    onClick={stopCamera}
                    className="btn-glow inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg bg-destructive text-destructive-foreground font-medium text-sm transition"
                  >
                    <VideoOff className="w-4 h-4" />
                    Stop
                  </button>
                )}

                <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    playClickSound();
                  }}
                  disabled={loading || !isTensorFlowReady()}
                  className="btn-glow inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-border bg-card text-foreground font-medium text-sm disabled:opacity-40 hover:bg-secondary transition"
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Upload Image</span>
                  <span className="sm:hidden">Upload</span>
                </button>

                {mode === "image" && uploadedImage && (
                  <button
                    onClick={detectFromImage}
                    disabled={imageDetecting || !isTensorFlowReady()}
                    className="btn-glow inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg gradient-cyan text-primary-foreground font-medium text-sm disabled:opacity-50 transition shadow-md"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Detect Objects</span>
                    <span className="sm:hidden">Detect</span>
                  </button>
                )}

                <button
                  onClick={captureScreenshot}
                  disabled={!showCanvas}
                  className="btn-glow inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-border bg-card text-foreground font-medium text-sm disabled:opacity-40 hover:bg-secondary transition"
                >
                  <Camera className="w-4 h-4" />
                  <span className="hidden sm:inline">Screenshot</span>
                </button>

                {pinnedTargets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setPinnedTargets([]);
                    }}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-300 font-medium hover:bg-amber-500/30 transition inline-flex items-center gap-1.5"
                    title="Clear pinned object targets"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Pins ({pinnedTargets.length})</span>
                  </button>
                )}

                <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto mt-2 sm:mt-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setShowReticle(!showReticle);
                    }}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition font-medium inline-flex items-center gap-1.5 ${
                      showReticle
                        ? "bg-primary/20 border-primary text-primary"
                        : "bg-secondary/70 text-muted-foreground border-border hover:text-foreground"
                    }`}
                    title="Toggle Smart Reticle (Aims & locks onto ANY object in the room)"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Reticle: {showReticle ? "ON" : "OFF"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      const next = !voiceAnnounce;
                      setVoiceAnnounce(next);
                      if (next) speakObject("Voice detection active");
                    }}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition font-medium inline-flex items-center gap-1.5 ${
                      voiceAnnounce
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                        : "bg-secondary/70 text-muted-foreground border-border hover:text-foreground"
                    }`}
                    title="Voice announce detected objects using AI speech synthesis"
                  >
                    {voiceAnnounce ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5" />}
                    <span>Voice: {voiceAnnounce ? "ON" : "OFF"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setThreshold((prev) => (prev <= 0.18 ? 0.30 : 0.15));
                    }}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition font-medium ${
                      threshold <= 0.18
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-secondary/70 text-muted-foreground border-border hover:text-foreground"
                    }`}
                    title="Toggle high sensitivity mode to detect small & distant objects"
                  >
                    {threshold <= 0.18 ? "🎯 Small Objects: ON" : "🔍 Small Objects"}
                  </button>

                  <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                    <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Sensitivity:</span>
                    <input
                      type="range"
                      min="0.1"
                      max="0.8"
                      step="0.05"
                      value={threshold}
                      onChange={(e) => setThreshold(parseFloat(e.target.value))}
                      className="w-20 accent-primary"
                    />
                    <span className="text-xs font-mono text-primary font-semibold">{(threshold * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 sm:space-y-6">
            <div className="hover-card rounded-xl p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Performance</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <Activity className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-2xl font-bold font-mono text-foreground">{fps}</p>
                  <p className="text-xs text-muted-foreground">FPS</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold font-mono text-primary">{objectCount}</p>
                  <p className="text-xs text-muted-foreground">Active Objects</p>
                </div>
              </div>
            </div>

            {/* Smart Reticle Live Target Lock (Universal Detector for Any Item) */}
            {focusedItem && focusedItem.probability >= 0.16 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="hover-card rounded-xl p-4 border border-emerald-500/40 bg-emerald-500/10 shadow-lg backdrop-blur"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    Target Locked
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                    {(focusedItem.probability * 100).toFixed(0)}% Confidence
                  </span>
                </div>
                <p className="text-lg font-bold text-foreground capitalize truncate">
                  {cleanClassName(focusedItem.className)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  Category: {focusedItem.className}
                </p>
              </motion.div>
            )}

            <div className="hover-card rounded-xl p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Search Objects</h3>
              <ObjectSearchBar value={searchFilter} onChange={setSearchFilter} placeholder="Filter detections (e.g. pen, watch, laptop)..." />
            </div>

            {/* Detailed Everyday Item Classifier (1000+ Categories) */}
            <div className="hover-card rounded-xl p-4 sm:p-5 border border-primary/20 bg-card/60 backdrop-blur">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span>✨ 1000+ Universal Classifier</span>
                </h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-medium">
                  ImageNet Deep CNN
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Aim reticle at any object (pen, watch, notebook, keys, glasses, tools) in front of the lens.
              </p>
              {detailedItems.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-1">Aim camera at an object to inspect details...</p>
              ) : (
                <div className="space-y-1.5">
                  {detailedItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50 text-xs">
                      <span className="font-medium text-foreground capitalize truncate max-w-[170px]" title={item.className}>
                        {cleanClassName(item.className)}
                      </span>
                      <span className="font-mono text-primary font-semibold">
                        {(item.probability * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Tracked Detections List */}
            <div className="hover-card rounded-xl p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Live Detections</h3>
                <span className="text-xs font-mono text-primary font-semibold">{filteredDetections.length} Total</span>
              </div>
              {filteredDetections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {searchFilter ? "No matching objects" : "No objects currently detected. Aim camera or tap video to scan."}
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredDetections.map((d, i) => (
                    <motion.div
                      key={`${d.class}-${d.trackId}-${i}`}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between p-2 rounded-lg bg-secondary/50 border border-border/50"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2 h-2 rounded-full bg-primary" />
                        <span className="text-sm font-medium text-foreground capitalize truncate">{d.class} #{d.trackId}</span>
                      </div>
                      <span className="text-xs font-mono text-primary font-semibold">{(d.score * 100).toFixed(1)}%</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <VoiceCommandButton onCommand={handleVoiceCommand} />
      </div>
    </div>
  );
}

function drawDetections(
  ctx: CanvasRenderingContext2D,
  detections: TrackedDetection[],
  showTrackId: boolean,
  highlightFilter = "",
  focusedItem: DetailedClassification | null = null,
  showReticle = true
) {
  // 1. Draw bounding boxes
  detections.forEach((d) => {
    const [x, y, w, h] = d.bbox;
    const isHighlighted = highlightFilter && d.class.toLowerCase().includes(highlightFilter.toLowerCase());
    const isUniversal = !["person", "car", "chair", "tv", "bottle"].includes(d.class.toLowerCase());
    
    // Distinct vibrant color palette
    const color = isHighlighted
      ? "hsl(45, 100%, 50%)"
      : isUniversal
      ? "#10b981"
      : "hsl(187, 100%, 45%)";
    const bgColor = isHighlighted
      ? "hsla(45, 100%, 50%, 0.9)"
      : isUniversal
      ? "rgba(16, 185, 129, 0.9)"
      : "hsla(187, 100%, 45%, 0.85)";

    ctx.strokeStyle = color;
    ctx.lineWidth = isHighlighted ? 3 : 2;
    ctx.strokeRect(x, y, w, h);

    // Corner brackets
    const corner = Math.min(12, w / 4, h / 4);
    ctx.strokeStyle = isHighlighted ? "#ffffff" : isUniversal ? "#34d399" : "#38bdf8";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y + corner); ctx.lineTo(x, y); ctx.lineTo(x + corner, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - corner, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + corner); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h - corner); ctx.lineTo(x, y + h); ctx.lineTo(x + corner, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - corner, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - corner); ctx.stroke();

    const label = showTrackId
      ? `${d.class} #${d.trackId} ${(d.score * 100).toFixed(0)}%`
      : `${d.class} ${(d.score * 100).toFixed(0)}%`;
    ctx.font = isHighlighted ? "bold 13px Inter, sans-serif" : "bold 12px Inter, sans-serif";
    const textW = ctx.measureText(label).width;

    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y - 24, textW + 12, 24);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x + 6, y - 7);
  });

  // 2. Futuristic Smart Reticle (Universal Item Scanner for Any Object in the room)
  if (showReticle) {
    const size = Math.min(220, Math.min(ctx.canvas.width, ctx.canvas.height) * 0.46);
    const cx = ctx.canvas.width / 2;
    const cy = ctx.canvas.height / 2;
    const rx = cx - size / 2;
    const ry = cy - size / 2;
    const bracket = 24;

    const hasTarget = focusedItem && focusedItem.probability >= 0.16;
    const reticleColor = hasTarget ? "rgba(34, 197, 94, 0.9)" : "rgba(56, 189, 248, 0.65)";

    ctx.save();
    ctx.strokeStyle = reticleColor;
    ctx.lineWidth = 2.5;

    // Corner brackets
    ctx.beginPath(); ctx.moveTo(rx, ry + bracket); ctx.lineTo(rx, ry); ctx.lineTo(rx + bracket, ry); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx + size - bracket, ry); ctx.lineTo(rx + size, ry); ctx.lineTo(rx + size, ry + bracket); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx, ry + size - bracket); ctx.lineTo(rx, ry + size); ctx.lineTo(rx + bracket, ry + size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx + size - bracket, ry + size); ctx.lineTo(rx + size, ry + size); ctx.lineTo(rx + size, ry + size - bracket); ctx.stroke();

    // Center crosshair
    ctx.strokeStyle = hasTarget ? "rgba(34, 197, 94, 0.7)" : "rgba(56, 189, 248, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();

    // Reticle Label
    if (hasTarget) {
      const topName = cleanClassName(focusedItem.className);
      const targetText = `🎯 TARGET: ${topName.toUpperCase()} (${(focusedItem.probability * 100).toFixed(0)}%)`;
      ctx.font = "bold 13px Inter, sans-serif";
      const w = ctx.measureText(targetText).width;
      ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
      ctx.fillRect(cx - w / 2 - 8, ry - 28, w + 16, 24);
      ctx.strokeStyle = "rgba(34, 197, 94, 0.9)";
      ctx.strokeRect(cx - w / 2 - 8, ry - 28, w + 16, 24);
      ctx.fillStyle = "#22c55e";
      ctx.fillText(targetText, cx - w / 2, ry - 11);
    } else {
      ctx.font = "11px Inter, sans-serif";
      const hint = "AIM AT ANY OBJECT (PEN, WATCH, KEYS, ETC.)";
      const w = ctx.measureText(hint).width;
      ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
      ctx.fillRect(cx - w / 2 - 6, ry - 22, w + 12, 18);
      ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
      ctx.fillText(hint, cx - w / 2, ry - 8);
    }
    ctx.restore();
  }
}
