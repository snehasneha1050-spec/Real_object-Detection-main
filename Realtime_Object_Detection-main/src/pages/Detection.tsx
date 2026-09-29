import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Trash2,
  SwitchCamera,
  Download,
  FileText,
  Moon,
  Sun,
  Cpu,
  Layers,
  ShieldAlert,
  X,
  Printer,
  Radio,
  CheckCircle2,
} from "lucide-react";
import { saveDetection, getHistory } from "@/lib/detectionStore";
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
  getTensorFlowStats,
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

  const first = raw.split(",")[0].trim();
  return first
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Category-based Multi-Color system for bounding boxes
 */
export interface CategoryStyle {
  category: "Electronics" | "Stationery" | "Food" | "Fashion" | "Vehicles" | "General";
  color: string;
  bgColor: string;
  badgeBg: string;
  accent: string;
}

function getCategoryStyle(className: string): CategoryStyle {
  const lower = className.toLowerCase();

  // 1. Electronics & Gadgets -> Neon Cyan
  if (
    lower.includes("phone") ||
    lower.includes("laptop") ||
    lower.includes("computer") ||
    lower.includes("keyboard") ||
    lower.includes("mouse") ||
    lower.includes("tv") ||
    lower.includes("screen") ||
    lower.includes("monitor") ||
    lower.includes("remote") ||
    lower.includes("headphone") ||
    lower.includes("speaker") ||
    lower.includes("hard disk")
  ) {
    return {
      category: "Electronics",
      color: "#06b6d4",
      bgColor: "rgba(6, 182, 212, 0.9)",
      badgeBg: "rgba(6, 182, 212, 0.15)",
      accent: "#67e8f9",
    };
  }

  // 2. Stationery, Tools & Wearables -> Emerald Green
  if (
    lower.includes("pen") ||
    lower.includes("pencil") ||
    lower.includes("eraser") ||
    lower.includes("notebook") ||
    lower.includes("watch") ||
    lower.includes("clock") ||
    lower.includes("scissors") ||
    lower.includes("ruler") ||
    lower.includes("stapler") ||
    lower.includes("keys") ||
    lower.includes("padlock") ||
    lower.includes("book") ||
    lower.includes("binder")
  ) {
    return {
      category: "Stationery",
      color: "#10b981",
      bgColor: "rgba(16, 185, 129, 0.9)",
      badgeBg: "rgba(16, 185, 129, 0.15)",
      accent: "#6ee7b7",
    };
  }

  // 3. Food, Drinks & Dining -> Golden Amber
  if (
    lower.includes("cup") ||
    lower.includes("mug") ||
    lower.includes("bottle") ||
    lower.includes("apple") ||
    lower.includes("banana") ||
    lower.includes("orange") ||
    lower.includes("sandwich") ||
    lower.includes("pizza") ||
    lower.includes("donut") ||
    lower.includes("bowl") ||
    lower.includes("fork") ||
    lower.includes("knife") ||
    lower.includes("spoon") ||
    lower.includes("wine")
  ) {
    return {
      category: "Food",
      color: "#f59e0b",
      bgColor: "rgba(245, 158, 11, 0.9)",
      badgeBg: "rgba(245, 158, 11, 0.15)",
      accent: "#fcd34d",
    };
  }

  // 4. People & Fashion / Wearables -> Purple / Violet
  if (
    lower.includes("person") ||
    lower.includes("sunglass") ||
    lower.includes("eyeglass") ||
    lower.includes("backpack") ||
    lower.includes("handbag") ||
    lower.includes("umbrella") ||
    lower.includes("tie") ||
    lower.includes("wallet") ||
    lower.includes("suitcase") ||
    lower.includes("shoe")
  ) {
    return {
      category: "Fashion",
      color: "#8b5cf6",
      bgColor: "rgba(139, 92, 246, 0.9)",
      badgeBg: "rgba(139, 92, 246, 0.15)",
      accent: "#c4b5fd",
    };
  }

  // 5. Vehicles & Outdoors -> Rose / Coral
  if (
    lower.includes("car") ||
    lower.includes("bicycle") ||
    lower.includes("motorcycle") ||
    lower.includes("bus") ||
    lower.includes("truck") ||
    lower.includes("airplane") ||
    lower.includes("dog") ||
    lower.includes("cat") ||
    lower.includes("bird")
  ) {
    return {
      category: "Vehicles",
      color: "#f43f5e",
      bgColor: "rgba(244, 63, 94, 0.9)",
      badgeBg: "rgba(244, 63, 94, 0.15)",
      accent: "#fda4af",
    };
  }

  // 6. General Objects -> Sky Blue
  return {
    category: "General",
    color: "#38bdf8",
    bgColor: "rgba(14, 165, 233, 0.9)",
    badgeBg: "rgba(14, 165, 233, 0.15)",
    accent: "#7dd3fc",
  };
}

/**
 * Distance / Proximity estimation based on bounding box height relative to frame
 */
function getProximity(boxH: number, canvasH: number): { label: "NEAR" | "MID" | "FAR"; isClose: boolean; tag: string } {
  const ratio = boxH / (canvasH || 1);
  if (ratio > 0.48) {
    return { label: "NEAR", isClose: true, tag: "⚠️ CLOSE" };
  } else if (ratio > 0.22) {
    return { label: "MID", isClose: false, tag: "MID" };
  } else {
    return { label: "FAR", isClose: false, tag: "FAR" };
  }
}

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

  // Core state
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fps, setFps] = useState(0);
  const [inferenceLatency, setInferenceLatency] = useState(0);
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

  // Advanced features state
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [nightVision, setNightVision] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [showVivaModal, setShowVivaModal] = useState(false);
  const [tensorStats, setTensorStats] = useState({ backend: "webgl", numTensors: 0 });

  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const lastSaveRef = useRef<number>(0);
  const lastClassifyRef = useRef<number>(0);
  const trackerRef = useRef(new SimpleTracker());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<any>(null);

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
  const nightVisionRef = useRef(nightVision);
  nightVisionRef.current = nightVision;

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
        if (!cancelled) {
          setLoading(false);
          const stats = getTensorFlowStats();
          setTensorStats({ backend: stats.backend, numTensors: stats.numTensors });
        }
      } catch (error) {
        console.error("Failed to initialize TensorFlow:", error);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live Camera Start with Facing Mode
  const startCamera = useCallback(async () => {
    playClickSound();
    if (!isTensorFlowReady()) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: 640, height: 480 },
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
  }, [facingMode]);

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
    setInferenceLatency(0);
    trackerRef.current.reset();
  }, []);

  // Switch / Flip Camera (Front ⇄ Back)
  const toggleCameraFacing = useCallback(async () => {
    playClickSound();
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);

    if (running) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: nextMode, width: 640, height: 480 },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error("Camera switch error:", err);
      }
    }
  }, [facingMode, running]);

  // Video Recording Engine (Records video with bounding boxes & audio-ready)
  const toggleVideoRecording = useCallback(() => {
    playClickSound();
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!isRecording) {
      try {
        const stream = canvas.captureStream(30);
        const mimeTypes = [
          "video/webm;codecs=vp9",
          "video/webm;codecs=vp8",
          "video/webm",
          "video/mp4",
        ];
        const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

        recordedChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType || "video/webm" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `Detectra-Batch4-Video-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        };

        recorder.start(500);
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordSeconds(0);

        recordTimerRef.current = setInterval(() => {
          setRecordSeconds((s) => s + 1);
        }, 1000);
      } catch (err) {
        console.error("Recording error:", err);
      }
    } else {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      clearInterval(recordTimerRef.current);
    }
  }, [isRecording]);

  // Export Academic Evaluation Report (CSV with Course & Batch Metadata)
  const exportAcademicReport = useCallback(() => {
    playClickSound();
    const allHistory = getHistory();
    const reportDate = new Date().toLocaleString();

    const rows = [
      ["PROJECT EVALUATION REPORT", "REAL TIME VISUAL OBJECT RECOGNITION USING DEEP NEURAL NETWORKS"],
      ["COURSE CODE", "20CA02801"],
      ["PROJECT BATCH", "BATCH - 4"],
      ["DETECTOR ARCHITECTURE", "Single-Stage SSD MobileNet_v2 + ImageNet 1000 Deep CNN"],
      ["EVALUATION DATE", reportDate],
      ["CURRENT ACTIVE OBJECTS", detections.length.toString()],
      ["RUNNING FRAME RATE (FPS)", fps.toString()],
      ["INFERENCE LATENCY", `${inferenceLatency} ms`],
      ["HARDWARE ACCELERATION", tensorStats.backend.toUpperCase()],
      [],
      ["S.No", "Timestamp", "Object Name", "Category", "Confidence (%)", "Track ID", "Proximity"],
    ];

    const exportList =
      detections.length > 0
        ? detections
        : allHistory.slice(0, 50).map((h, i) => ({
            class: h.objectName,
            score: h.confidence,
            trackId: i + 1,
            bbox: [0, 0, 100, 100] as [number, number, number, number],
          }));

    exportList.forEach((d, idx) => {
      const style = getCategoryStyle(d.class);
      const prox = getProximity(d.bbox[3], canvasRef.current?.height || 480);
      rows.push([
        (idx + 1).toString(),
        new Date().toLocaleTimeString(),
        d.class,
        style.category,
        (d.score * 100).toFixed(1) + "%",
        `#${d.trackId}`,
        prox.label,
      ]);
    });

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows.map((e) => e.map((item) => `"${item}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Academic_Project_Report_Batch4_20CA02801_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [detections, fps, inferenceLatency, tensorStats]);

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

        const inferStart = performance.now();

        // 1. Run COCO-SSD single-stage detection
        const cocoPredictions = await detectObjects(video, threshold);
        const allPredictions: Detection[] = [...cocoPredictions];

        const inferEnd = performance.now();
        setInferenceLatency(Math.round(inferEnd - inferStart));

        // 2. Merge Universal Reticle Target
        const reticleTarget = activeReticleTargetRef.current;
        if (
          showReticleRef.current &&
          reticleTarget &&
          Date.now() - reticleTarget.timestamp < 1200 &&
          reticleTarget.score >= 0.16
        ) {
          const overlapIdx = allPredictions.findIndex(
            (p) => computeIoU(p.bbox, reticleTarget.bbox) > 0.35
          );
          if (overlapIdx >= 0) {
            const genericClasses = ["book", "cell phone", "bottle", "cup", "clock", "remote", "vase", "bowl"];
            if (genericClasses.includes(allPredictions[overlapIdx].class.toLowerCase())) {
              allPredictions[overlapIdx] = {
                ...allPredictions[overlapIdx],
                class: reticleTarget.class,
                score: Math.max(allPredictions[overlapIdx].score, reticleTarget.score),
              };
            }
          } else {
            allPredictions.push({
              class: reticleTarget.class,
              score: reticleTarget.score,
              bbox: reticleTarget.bbox,
            });
          }
        }

        // 3. Merge Pinned Targets (15s lifespan)
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

        // 4. Multi-object tracker
        const tracked = settings.trackingEnabled
          ? trackerRef.current.update(allPredictions)
          : allPredictions.map((d, i) => ({ ...d, trackId: i + 1 }));

        setDetections(tracked);
        setObjectCount(tracked.length);

        // 5. Draw video + Night Vision Filter + Bounding Boxes + Reticle
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (nightVisionRef.current) {
          ctx.filter = "contrast(1.4) brightness(1.35) saturate(1.2)";
        } else {
          ctx.filter = "none";
        }
        ctx.drawImage(video, 0, 0);
        ctx.filter = "none"; // reset filter for overlays

        drawDetections(
          ctx,
          tracked,
          settings.trackingEnabled,
          searchFilterRef.current,
          focusedItemRef.current,
          showReticleRef.current,
          nightVisionRef.current
        );

        // 6. FPS Calculation
        frameCount++;
        const now = performance.now();
        if (now - lastTime >= 1000) {
          setFps(frameCount);
          frameCount = 0;
          lastTime = now;
          const stats = getTensorFlowStats();
          setTensorStats({ backend: stats.backend, numTensors: stats.numTensors });
        }

        // 7. Universal 1000+ Class Classifier for Any Small or Large Item (every 400ms)
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

        // 8. Save Detections periodically
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

  // Tap-to-Scan on Canvas
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

    const source = mode === "image" && canvas ? canvas : videoRef.current || canvas;
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
  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [stopCamera]
  );

  // Multi-Zone Image Detection
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

      const cocoPredictions = await detectObjects(img, threshold);
      const allPredictions: Detection[] = [...cocoPredictions];

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

      drawDetections(ctx, tracked, false, searchFilterRef.current, null, false, false);

      classifyObjects(img, 3).then((res) => {
        if (res && res.length > 0) {
          setDetailedItems(res);
          setFocusedItem(res[0]);
          if (voiceEnabledRef.current && res[0].probability > 0.28) {
            speakObject(cleanClassName(res[0].className));
          }
        }
      });

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
    link.download = `Detectra-Screenshot-Batch4-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  const handleVoiceCommand = useCallback(
    (result: VoiceCommandResult) => {
      if (result.action === "start_detection" && !running && isTensorFlowReady()) {
        startCamera();
      } else if (result.action === "stop_detection" && running) {
        stopCamera();
      } else if ((result.action === "find" || result.action === "search") && result.param) {
        setSearchFilter(result.param);
      }
    },
    [running, startCamera, stopCamera]
  );

  const showCanvas = running || (mode === "image" && uploadedImage);

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Academic Header Banner */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                  Course Code: 20CA02801
                </span>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Batch: 4
                </span>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                  Single-Stage SSD + Deep CNN
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">
                Real Time Visual <span className="text-primary">Object Recognition</span>
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  setShowVivaModal(true);
                }}
                className="btn-glow inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-card border border-border hover:bg-secondary text-foreground transition shadow-sm"
              >
                <Cpu className="w-4 h-4 text-primary" />
                <span>Architecture & Viva Mode</span>
              </button>

              <button
                type="button"
                onClick={exportAcademicReport}
                className="btn-glow inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary transition shadow-sm"
                title="Export Academic Project CSV Report"
              >
                <FileText className="w-4 h-4" />
                <span>Download Report</span>
              </button>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            End-to-End Deep Neural Network Object Detection & Tracking with Category Multi-Color Coding, Proximity Warning, and Universal Everyday Item Recognition.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Main Visual Display */}
          <div className="lg:col-span-2">
            <div className="hover-card rounded-xl overflow-hidden border border-border">
              <div className="relative aspect-video bg-muted flex items-center justify-center overflow-hidden">
                <video ref={videoRef} className="hidden" muted playsInline />
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  title="Click anywhere on video to scan and lock any object"
                  className={`absolute inset-0 w-full h-full object-contain cursor-crosshair ${
                    showCanvas ? "" : "hidden"
                  }`}
                />

                {!showCanvas && (
                  <div className="text-center text-muted-foreground p-4">
                    {loading ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm font-medium">Loading Deep Neural Network Models...</p>
                        <p className="text-xs text-muted-foreground">COCO-SSD Single-Stage + MobileNet v2 1000+ Categories</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <Video className="w-12 h-12 text-primary/50" />
                        <p className="text-sm sm:text-base font-medium">Start Camera or Upload an Image to begin recognition</p>
                        <p className="text-xs text-muted-foreground">Supports pens, watches, notebooks, keys, phones, laptops, and 1000+ items</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Live HUD Badges */}
                {running && (
                  <>
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                      <div className="bg-background/85 backdrop-blur rounded-md px-2.5 py-1 text-xs font-mono text-primary border border-border shadow-sm flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        <span>{fps} FPS</span>
                      </div>
                      <div className="bg-background/85 backdrop-blur rounded-md px-2.5 py-1 text-xs font-mono text-muted-foreground border border-border shadow-sm">
                        {inferenceLatency} ms latency
                      </div>
                    </div>

                    {isRecording && (
                      <div className="absolute top-3 right-3 bg-rose-500/90 text-white backdrop-blur rounded-md px-3 py-1 text-xs font-mono font-bold flex items-center gap-2 shadow-lg animate-pulse">
                        <span className="w-2.5 h-2.5 rounded-full bg-white" />
                        <span>REC {Math.floor(recordSeconds / 60)}:{(recordSeconds % 60).toString().padStart(2, "0")}</span>
                      </div>
                    )}
                  </>
                )}

                {imageDetecting && (
                  <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-foreground font-medium">Scanning all objects in image with Deep Neural Network...</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Universal & Proximity Interactive Banner */}
              {showCanvas && (
                <div className="bg-secondary/40 border-t border-border px-3 py-2 text-xs flex items-center justify-between text-muted-foreground flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                    <span>
                      <strong className="text-foreground">Interactive Recognition:</strong> Aim reticle or{" "}
                      <span className="text-primary font-medium underline underline-offset-2">tap anywhere on video</span> to lock any object (pens, watches, notebooks, keys, coins, glasses).
                    </span>
                  </div>
                  {tapNotice && <span className="text-emerald-400 font-semibold animate-pulse">{tapNotice}</span>}
                </div>
              )}

              {/* Primary Controls Toolbar */}
              <div className="p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-2.5 border-t border-border bg-card/40">
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
                    <span>Stop</span>
                  </button>
                )}

                {/* Flip Camera Button */}
                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  disabled={loading || !isTensorFlowReady()}
                  className="btn-glow inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-secondary transition"
                  title="Switch between front and back cameras"
                >
                  <SwitchCamera className="w-3.5 h-3.5 text-primary" />
                  <span className="hidden sm:inline">Flip Camera ({facingMode === "environment" ? "Back" : "Front"})</span>
                  <span className="sm:hidden">Flip</span>
                </button>

                {/* Live Video Recording Button */}
                <button
                  type="button"
                  onClick={toggleVideoRecording}
                  disabled={!showCanvas}
                  className={`btn-glow inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                    isRecording
                      ? "bg-rose-500 text-white animate-pulse"
                      : "border border-border bg-card text-foreground hover:bg-secondary"
                  }`}
                  title="Record video clip of detections and download"
                >
                  <Radio className={`w-3.5 h-3.5 ${isRecording ? "text-white" : "text-rose-500"}`} />
                  <span>{isRecording ? "Stop & Save Video" : "Record Video"}</span>
                </button>

                {/* Screenshot */}
                <button
                  onClick={captureScreenshot}
                  disabled={!showCanvas}
                  className="btn-glow inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-secondary transition"
                  title="Capture snapshot of detections"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Screenshot</span>
                </button>

                {/* Upload Image */}
                <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    playClickSound();
                  }}
                  disabled={loading || !isTensorFlowReady()}
                  className="btn-glow inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-secondary transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload</span>
                </button>

                {mode === "image" && uploadedImage && (
                  <button
                    onClick={detectFromImage}
                    disabled={imageDetecting || !isTensorFlowReady()}
                    className="btn-glow inline-flex items-center gap-1.5 px-3 py-2 rounded-lg gradient-cyan text-primary-foreground font-medium text-xs disabled:opacity-50 transition shadow-md"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Scan Image</span>
                  </button>
                )}

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

                {/* Secondary Toggles Row */}
                <div className="flex items-center gap-2 w-full mt-2 pt-2 border-t border-border/60 flex-wrap">
                  {/* Night Vision Booster Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setNightVision(!nightVision);
                    }}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition font-medium inline-flex items-center gap-1.5 ${
                      nightVision
                        ? "bg-amber-500/20 border-amber-500 text-amber-300"
                        : "bg-secondary/70 text-muted-foreground border-border hover:text-foreground"
                    }`}
                    title="Boost contrast and brightness for dark / low-light rooms"
                  >
                    {nightVision ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
                    <span>Night Vision: {nightVision ? "ON" : "OFF"}</span>
                  </button>

                  {/* Reticle Toggle */}
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
                    title="Toggle Universal Smart Reticle"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Reticle: {showReticle ? "ON" : "OFF"}</span>
                  </button>

                  {/* Voice Toggle */}
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

                  {/* Small Objects Mode Toggle */}
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

                  <div className="flex items-center gap-1.5 ml-auto">
                    <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Confidence:</span>
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

            {/* Category Color Legend */}
            <div className="mt-3 p-2.5 rounded-lg bg-card border border-border text-xs flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                Category Color Code:
              </span>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#06b6d4]" />
                  <span>Electronics / Gadgets</span>
                </span>
                <span className="inline-flex items-center gap-1 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]" />
                  <span>Stationery & Tools</span>
                </span>
                <span className="inline-flex items-center gap-1 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
                  <span>Food & Dining</span>
                </span>
                <span className="inline-flex items-center gap-1 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]" />
                  <span>People & Fashion</span>
                </span>
              </div>
            </div>
          </div>

          {/* Sidebar Telemetry & Object List */}
          <div className="space-y-4 sm:space-y-6">
            {/* Live Performance & Hardware Stats */}
            <div className="hover-card rounded-xl p-4 sm:p-5 border border-border">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Model Telemetry & GPU Status
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-2 rounded-lg bg-secondary/50">
                  <Activity className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="text-xl font-bold font-mono text-foreground">{fps}</p>
                  <p className="text-[10px] text-muted-foreground">FPS</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-secondary/50">
                  <Cpu className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <p className="text-xl font-bold font-mono text-emerald-400">{objectCount}</p>
                  <p className="text-[10px] text-muted-foreground">Detected</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-secondary/50">
                  <Layers className="w-4 h-4 text-violet-400 mx-auto mb-1" />
                  <p className="text-xl font-bold font-mono text-violet-400">{tensorStats.numTensors}</p>
                  <p className="text-[10px] text-muted-foreground">Tensors</p>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                <span>Backend: <strong className="text-primary uppercase">{tensorStats.backend}</strong></span>
                <span>Latency: <strong className="text-foreground">{inferenceLatency} ms</strong></span>
              </div>
            </div>

            {/* Target Locked Reticle Card */}
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

            {/* Search Filter */}
            <div className="hover-card rounded-xl p-4 sm:p-5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Search Objects</h3>
              <ObjectSearchBar
                value={searchFilter}
                onChange={setSearchFilter}
                placeholder="Filter detections (e.g. pen, watch, laptop)..."
              />
            </div>

            {/* Live Tracked Detections List */}
            <div className="hover-card rounded-xl p-4 sm:p-5 border border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Live Detections ({filteredDetections.length})
                </h3>
                <button
                  type="button"
                  onClick={exportAcademicReport}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> Export CSV
                </button>
              </div>

              {filteredDetections.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  {searchFilter ? "No matching objects" : "No objects currently in frame. Aim camera or tap video to scan."}
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {filteredDetections.map((d, i) => {
                    const style = getCategoryStyle(d.class);
                    const prox = getProximity(d.bbox[3], canvasRef.current?.height || 480);
                    return (
                      <motion.div
                        key={`${d.class}-${d.trackId}-${i}`}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-2 rounded-lg bg-secondary/50 border border-border/50 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: style.color }} />
                          <div className="truncate">
                            <span className="font-semibold text-foreground capitalize truncate block">
                              {d.class} #{d.trackId}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {style.category} • {prox.tag}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-foreground shrink-0">
                          {(d.score * 100).toFixed(1)}%
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <VoiceCommandButton onCommand={handleVoiceCommand} />

        {/* Academic Evaluation & Viva Modal */}
        <AnimatePresence>
          {showVivaModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-card border border-border rounded-2xl max-w-3xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
              >
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <div>
                    <span className="text-xs font-mono text-primary font-semibold uppercase">Academic Project Portfolio</span>
                    <h2 className="text-xl font-bold text-foreground">
                      Real Time Visual Object Recognition Using Deep Neural Networks
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Course Code: <strong>20CA02801</strong> | Project Batch: <strong>Batch - 4</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => setShowVivaModal(false)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-5 space-y-5 text-sm">
                  {/* Single Stage vs Two Stage Comparison */}
                  <div className="p-4 rounded-xl bg-secondary/40 border border-border">
                    <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-primary" />
                      Single-Stage Detector (SSD) vs. Two-Stage Detector (Faster R-CNN)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="py-2">Metric / Feature</th>
                            <th className="py-2 text-primary font-bold">Single-Stage (SSD / Our Project)</th>
                            <th className="py-2 text-muted-foreground">Two-Stage (Faster R-CNN)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          <tr>
                            <td className="py-2 font-medium">Forward Pass</td>
                            <td className="py-2 text-emerald-400 font-semibold">1-Shot End-to-End Prediction</td>
                            <td className="py-2">2 Steps (RPN Proposals + Classifier)</td>
                          </tr>
                          <tr>
                            <td className="py-2 font-medium">Frame Rate (FPS)</td>
                            <td className="py-2 text-emerald-400 font-semibold">30 - 60 FPS (True Real-Time)</td>
                            <td className="py-2">5 - 8 FPS (High Latency)</td>
                          </tr>
                          <tr>
                            <td className="py-2 font-medium">Backbone Network</td>
                            <td className="py-2">MobileNet v2 (Depthwise Separable Conv)</td>
                            <td className="py-2">ResNet-101 / VGG-16</td>
                          </tr>
                          <tr>
                            <td className="py-2 font-medium">Mobile / Edge Deploy</td>
                            <td className="py-2 text-emerald-400 font-semibold">Lightweight & WebGL Accelerated</td>
                            <td className="py-2">Heavy memory footprint</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mathematical & Architectural Highlights */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-xl bg-secondary/30 border border-border">
                      <h4 className="font-semibold text-xs text-primary uppercase mb-1">Depthwise Separable Convolutions</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Reduces computational cost by 8-9x compared to standard standard spatial 3D convolutions by factorizing convolution into depthwise and pointwise operations.
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-secondary/30 border border-border">
                      <h4 className="font-semibold text-xs text-emerald-400 uppercase mb-1">Universal 1,000+ Class Hierarchy</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Hybrid architecture coupling COCO-SSD multi-box localization with an ImageNet deep classifier, enabling detection of everyday items (pens, watches, notebooks, keys).
                      </p>
                    </div>
                  </div>

                  {/* Live System Diagnostics */}
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">CURRENT BACKEND</span>
                      <strong className="text-primary">{tensorStats.backend.toUpperCase()} (GPU Accelerated)</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">TENSOR FLOW TENSORS</span>
                      <strong className="text-foreground">{tensorStats.numTensors} Active Tensors</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">INFERENCE LATENCY</span>
                      <strong className="text-emerald-400">{inferenceLatency} ms / frame</strong>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border flex items-center justify-between flex-wrap gap-2">
                  <button
                    onClick={() => window.print()}
                    className="btn-glow inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-secondary text-foreground hover:bg-secondary/80 border border-border"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Architecture Sheet</span>
                  </button>

                  <button
                    onClick={exportAcademicReport}
                    className="btn-glow inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg gradient-cyan text-primary-foreground shadow"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Project Report (CSV)</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Enhanced Draw function with Category Multi-Color Coding, Corner Accents & Proximity Tags
 */
function drawDetections(
  ctx: CanvasRenderingContext2D,
  detections: TrackedDetection[],
  showTrackId: boolean,
  highlightFilter = "",
  focusedItem: DetailedClassification | null = null,
  showReticle = true,
  isNightVision = false
) {
  // 1. Draw Bounding Boxes with Category Color Coding
  detections.forEach((d) => {
    const [x, y, w, h] = d.bbox;
    const isHighlighted = highlightFilter && d.class.toLowerCase().includes(highlightFilter.toLowerCase());
    const style = getCategoryStyle(d.class);
    const prox = getProximity(h, ctx.canvas.height);

    const boxColor = isHighlighted ? "hsl(45, 100%, 50%)" : style.color;
    const bgColor = isHighlighted ? "hsla(45, 100%, 50%, 0.9)" : style.bgColor;

    ctx.strokeStyle = boxColor;
    ctx.lineWidth = isHighlighted || prox.isClose ? 3.5 : 2.5;
    ctx.strokeRect(x, y, w, h);

    // Corner brackets
    const corner = Math.min(12, w / 4, h / 4);
    ctx.strokeStyle = isHighlighted ? "#ffffff" : style.accent;
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(x, y + corner); ctx.lineTo(x, y); ctx.lineTo(x + corner, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - corner, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + corner); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h - corner); ctx.lineTo(x, y + h); ctx.lineTo(x + corner, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - corner, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - corner); ctx.stroke();

    // Label with Track ID, Confidence, Category, and Proximity Alert
    const trackStr = showTrackId ? ` #${d.trackId}` : "";
    const label = `${d.class}${trackStr} ${(d.score * 100).toFixed(0)}% • ${prox.tag}`;
    ctx.font = isHighlighted || prox.isClose ? "bold 13px Inter, sans-serif" : "bold 12px Inter, sans-serif";
    const textW = ctx.measureText(label).width;

    // Dark high-contrast label backdrop
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y - 24, textW + 14, 24);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x + 7, y - 7);
  });

  // 2. Night Vision Tactical HUD Overlay
  if (isNightVision) {
    ctx.save();
    ctx.fillStyle = "rgba(16, 185, 129, 0.95)";
    ctx.font = "bold 11px monospace";
    ctx.fillText("🌙 NIGHT VISION ACTIVE [ENHANCED CONTRAST]", 12, ctx.canvas.height - 14);
    ctx.restore();
  }

  // 3. Futuristic Smart Reticle (Universal Item Scanner)
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

    // Center crosshairs
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
