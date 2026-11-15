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
  X,
  Printer,
  Radio,
  Play,
  Pause,
  RotateCcw,
  Film,
  Navigation,
  Eye,
  Radar,
  Info,
} from "lucide-react";
import { saveDetection, getHistory } from "@/lib/detectionStore";
import { getSettings, playClickSound } from "@/lib/settingsStore";
import {
  SimpleTracker,
  TrackedDetection,
  TrackingEvent,
  estimateDistance,
} from "@/lib/tracker";
import {
  detector,
  Detection,
  initializeTensorFlow,
  isTensorFlowReady,
  detectObjects,
  detectObjectsSAHI,
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
  if (cleanName === lastSpokenText && now - lastSpokenTime < 5000) return;
  if (now - lastSpokenTime < 2500) return;

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

  // Common high-frequency real-world objects
  if (lower.includes("cell phone") || lower.includes("cellular") || lower.includes("mobile phone") || lower.includes("smartphone"))
    return "Mobile Phone";
  if (lower.includes("laptop") || lower.includes("notebook computer")) return "Laptop";
  if (lower.includes("ballpoint") || lower.includes("ballpen") || lower.includes("biro")) return "Ballpoint Pen";
  if (lower.includes("fountain pen")) return "Fountain Pen";
  if (lower.includes("pencil sharpener")) return "Pencil Sharpener";
  if (lower.includes("pencil box") || lower.includes("pencil case")) return "Pencil Case";
  if (lower.includes("pencil")) return "Pencil";
  if (lower.includes("eraser")) return "Eraser";
  if (lower.includes("spiral notebook") || (lower.includes("notebook") && !lower.includes("computer")))
    return "Notebook";
  if (lower.includes("digital watch")) return "Digital Watch";
  if (lower.includes("analog clock") || lower.includes("timepiece")) return "Analog Watch/Clock";
  if (lower.includes("wall clock")) return "Wall Clock";
  if (lower.includes("stopwatch")) return "Stopwatch";
  if (lower.includes("sunglass") || lower.includes("shades")) return "Sunglasses";
  if (lower.includes("spectacles") || lower.includes("eyeglass")) return "Eyeglasses";
  if (lower.includes("coffee mug") || lower.includes("mug")) return "Coffee Mug";
  if (lower.includes("water bottle")) return "Water Bottle";
  if (lower.includes("pill bottle")) return "Medicine Bottle";
  if (lower.includes("wallet") || lower.includes("billfold")) return "Wallet";
  if (lower.includes("padlock") || lower.includes("combination lock")) return "Padlock / Keys";
  if (lower.includes("headphone") || lower.includes("headset") || lower.includes("earphone")) return "Headphones";
  if (lower.includes("computer mouse")) return "Computer Mouse";
  if (lower.includes("keyboard") || lower.includes("keypad")) return "Keyboard";
  if (lower.includes("ruler") || lower.includes("tape measure")) return "Ruler";
  if (lower.includes("scissors")) return "Scissors";
  if (lower.includes("lighter")) return "Lighter";
  if (lower.includes("screwdriver")) return "Screwdriver";
  if (lower.includes("remote")) return "Remote Control";
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
 * Category-based Multi-Color system for bounding boxes & labels
 */
export interface CategoryStyle {
  category: "Electronics" | "Stationery" | "Food" | "Fashion" | "Vehicles" | "General";
  color: string;
  bgColor: string;
  badgeBg: string;
  accent: string;
}

export function getCategoryStyle(className: string): CategoryStyle {
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
      bgColor: "rgba(6, 182, 212, 0.92)",
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
      bgColor: "rgba(16, 185, 129, 0.92)",
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
      bgColor: "rgba(245, 158, 11, 0.92)",
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
      bgColor: "rgba(139, 92, 246, 0.92)",
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
      bgColor: "rgba(244, 63, 94, 0.92)",
      badgeBg: "rgba(244, 63, 94, 0.15)",
      accent: "#fda4af",
    };
  }

  // 6. General Objects -> Sky Blue
  return {
    category: "General",
    color: "#38bdf8",
    bgColor: "rgba(14, 165, 233, 0.92)",
    badgeBg: "rgba(14, 165, 233, 0.15)",
    accent: "#7dd3fc",
  };
}

interface ScannedTarget {
  id: string;
  class: string;
  score: number;
  bbox: [number, number, number, number];
  timestamp: number;
}

export default function DetectionPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  // Operational states
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fps, setFps] = useState(0);
  const [inferenceLatency, setInferenceLatency] = useState(0);
  const [detections, setDetections] = useState<TrackedDetection[]>([]);
  const [threshold, setThreshold] = useState(() => getSettings().confidenceThreshold);
  const [objectCount, setObjectCount] = useState(0);
  const [mode, setMode] = useState<"webcam" | "image" | "video">("webcam");

  // Media states
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoDetecting, setVideoDetecting] = useState(false);
  const [imageDetecting, setImageDetecting] = useState(false);

  // Advanced AI toggles
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [voiceAnnounce, setVoiceAnnounce] = useState(false);
  const [showReticle, setShowReticle] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const [sahiMode, setSahiMode] = useState(true);
  const [nightVision, setNightVision] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // Live stream & interaction states
  const [searchFilter, setSearchFilter] = useState("");
  const [detailedItems, setDetailedItems] = useState<DetailedClassification[]>([]);
  const [focusedItem, setFocusedItem] = useState<DetailedClassification | null>(null);
  const [pinnedTargets, setPinnedTargets] = useState<ScannedTarget[]>([]);
  const [tapNotice, setTapNotice] = useState<string | null>(null);
  const [eventLogs, setEventLogs] = useState<{ id: string; text: string; time: string; type: "enter" | "exit" }[]>([]);

  // Video recording & Viva states
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [showVivaModal, setShowVivaModal] = useState(false);
  const [tensorStats, setTensorStats] = useState({ backend: "webgl", numTensors: 0 });

  // Refs for loop access
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
  const showTrailsRef = useRef(showTrails);
  showTrailsRef.current = showTrails;
  const sahiModeRef = useRef(sahiMode);
  sahiModeRef.current = sahiMode;
  const trackingEnabledRef = useRef(trackingEnabled);
  trackingEnabledRef.current = trackingEnabled;
  const pinnedTargetsRef = useRef(pinnedTargets);
  pinnedTargetsRef.current = pinnedTargets;
  const activeReticleTargetRef = useRef<ScannedTarget | null>(null);
  const nightVisionRef = useRef(nightVision);
  nightVisionRef.current = nightVision;

  // Filtered detections
  const filteredDetections = useMemo(() => {
    if (!searchFilter.trim()) return detections;
    return detections.filter((d) => d.class.toLowerCase().includes(searchFilter.toLowerCase()));
  }, [detections, searchFilter]);

  // Category distribution summary
  const categoryStats = useMemo(() => {
    const counts: Record<string, number> = {};
    detections.forEach((d) => {
      const cat = getCategoryStyle(d.class).category;
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [detections]);

  // Hook up Tracker Event Stream
  useEffect(() => {
    const unsub = trackerRef.current.onEvent((ev: TrackingEvent) => {
      const timeStr = new Date(ev.timestamp).toLocaleTimeString();
      const message =
        ev.type === "enter"
          ? `${cleanClassName(ev.objectName)} #${ev.trackId} entered frame`
          : `${cleanClassName(ev.objectName)} #${ev.trackId} left frame`;

      setEventLogs((prev) => [
        { id: ev.id, text: message, time: timeStr, type: ev.type },
        ...prev.slice(0, 19),
      ]);

      if (ev.type === "enter" && voiceEnabledRef.current) {
        speakObject(ev.objectName);
      }
    });
    return () => unsub();
  }, []);

  // Initialize TensorFlow
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

  // Start Camera
  const startCamera = useCallback(async () => {
    playClickSound();
    if (!isTensorFlowReady()) return;

    // Reset video file if active
    if (fileVideoRef.current) {
      fileVideoRef.current.pause();
      setIsVideoPlaying(false);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
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
      setUploadedVideoUrl(null);
    } catch (err) {
      console.error("Camera error:", err);
      alert("Unable to access camera. Please check camera permissions in your browser.");
    }
  }, [facingMode]);

  // Stop Camera
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

  // Toggle Camera Facing
  const toggleCameraFacing = useCallback(async () => {
    playClickSound();
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);

    if (running && mode === "webcam") {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: nextMode, width: { ideal: 640 }, height: { ideal: 480 } },
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
  }, [facingMode, running, mode]);

  // Video Recording Engine
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
          a.download = `Detectra-Advanced-Recording-Batch4-${Date.now()}.webm`;
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

  // Export Academic CSV Report
  const exportAcademicReport = useCallback(() => {
    playClickSound();
    const allHistory = getHistory();
    const reportDate = new Date().toLocaleString();

    const rows = [
      ["ACADEMIC PROJECT EVALUATION REPORT", "REAL TIME VISUAL OBJECT RECOGNITION USING DEEP NEURAL NETWORKS"],
      ["COURSE CODE", "20CA02801"],
      ["PROJECT BATCH", "BATCH - 4"],
      ["DETECTION ENGINE", "Single-Stage SSD MobileNet V2 + SAHI Tiled Multi-Scale Inference"],
      ["CLASSIFICATION ENGINE", "ImageNet 1000 Deep Convolutional Neural Network"],
      ["EVALUATION DATE", reportDate],
      ["ACTIVE OBJECTS IN FRAME", detections.length.toString()],
      ["RUNNING FRAME RATE (FPS)", fps.toString()],
      ["INFERENCE LATENCY (MS)", `${inferenceLatency} ms`],
      ["HARDWARE ACCELERATION", tensorStats.backend.toUpperCase()],
      ["ACTIVE GPU TENSORS", tensorStats.numTensors.toString()],
      [],
      [
        "S.No",
        "Timestamp",
        "Object Name",
        "Category",
        "Confidence (%)",
        "Track ID",
        "Distance (m)",
        "Proximity",
        "Movement Direction",
        "Speed (px/frame)",
      ],
    ];

    const exportList =
      detections.length > 0
        ? detections
        : allHistory.slice(0, 60).map((h, i) => ({
            class: h.objectName,
            score: h.confidence,
            trackId: i + 1,
            distance: 1.2,
            distanceLabel: "~1.2m",
            proximity: "MID" as const,
            direction: "Stationary" as const,
            directionArrow: "•",
            speed: 0,
            trajectory: [],
            isNew: false,
            age: 10,
            bbox: [0, 0, 100, 100] as [number, number, number, number],
          }));

    exportList.forEach((d, idx) => {
      const style = getCategoryStyle(d.class);
      rows.push([
        (idx + 1).toString(),
        new Date().toLocaleTimeString(),
        cleanClassName(d.class),
        style.category,
        (d.score * 100).toFixed(1) + "%",
        `#${d.trackId}`,
        d.distanceLabel || "~1.2m",
        d.proximity || "MID",
        `${d.direction || "Stationary"} ${d.directionArrow || ""}`,
        d.speed?.toString() || "0",
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

  // Real-time Detection Loop (Webcam and Playing Video File)
  useEffect(() => {
    const isLive = running || (mode === "video" && isVideoPlaying);
    if (!isLive || !isTensorFlowReady() || !canvasRef.current) return;

    const sourceVideo = mode === "video" ? fileVideoRef.current : videoRef.current;
    if (!sourceVideo) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    let lastTime = performance.now();
    let frameCount = 0;

    const detectFrame = async () => {
      const activeVideo = mode === "video" ? fileVideoRef.current : videoRef.current;
      if (!activeVideo || activeVideo.paused || activeVideo.ended || activeVideo.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(detectFrame);
        return;
      }

      canvas.width = activeVideo.videoWidth || 640;
      canvas.height = activeVideo.videoHeight || 480;

      const inferStart = performance.now();

      // 1. Detection via SAHI Tiled Inference or Fast Single-Pass
      let rawPredictions: Detection[] = [];
      if (sahiModeRef.current) {
        rawPredictions = await detectObjectsSAHI(activeVideo, threshold, {
          enabled: true,
          sliceGridRows: 2,
          sliceGridCols: 2,
          overlapRatio: 0.22,
          tileThreshold: Math.max(0.12, threshold * 0.75),
        });
      } else {
        rawPredictions = await detectObjects(activeVideo, threshold);
      }

      const inferEnd = performance.now();
      setInferenceLatency(Math.round(inferEnd - inferStart));

      const allPredictions: Detection[] = [...rawPredictions];

      // 2. Merge Universal Reticle Target (Center target for tiny everyday objects)
      const reticleTarget = activeReticleTargetRef.current;
      if (
        showReticleRef.current &&
        reticleTarget &&
        Date.now() - reticleTarget.timestamp < 1200 &&
        reticleTarget.score >= 0.16
      ) {
        const overlapIdx = allPredictions.findIndex((p) => {
          const [ax, ay, aw, ah] = p.bbox;
          const [bx, by, bw, bh] = reticleTarget.bbox;
          const interW = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
          const interH = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
          const iou = (interW * interH) / (aw * ah + bw * bh - interW * interH + 1e-6);
          return iou > 0.35;
        });

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

      // 3. Merge User Pinned Targets (Canvas Clicks)
      const nowMs = Date.now();
      pinnedTargetsRef.current.forEach((pt) => {
        if (nowMs - pt.timestamp < 15000) {
          const exists = allPredictions.some((p) => {
            const [ax, ay, aw, ah] = p.bbox;
            const [bx, by, bw, bh] = pt.bbox;
            const interW = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
            const interH = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
            return (interW * interH) / (aw * ah + bw * bh - interW * interH + 1e-6) > 0.4;
          });
          if (!exists) {
            allPredictions.push({
              class: pt.class,
              score: pt.score,
              bbox: pt.bbox,
            });
          }
        }
      });

      // 4. Object Tracking & Smooth Kalman/EMA Update
      const tracked = trackingEnabledRef.current
        ? trackerRef.current.update(allPredictions, canvas.height)
        : allPredictions.map((d, i) => {
            const distInfo = estimateDistance(d.class, d.bbox[3], canvas.height);
            return {
              ...d,
              trackId: i + 1,
              distance: distInfo.distanceMeters,
              distanceLabel: distInfo.label,
              proximity: distInfo.proximity,
              direction: "Stationary" as const,
              directionArrow: "•",
              speed: 0,
              trajectory: [],
              isNew: false,
              age: 1,
            };
          });

      setDetections(tracked);
      setObjectCount(tracked.length);

      // 5. Draw Video Frame + Night Vision Booster + Bounding Boxes + Trails + Reticle
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (nightVisionRef.current) {
        ctx.filter = "contrast(1.4) brightness(1.35) saturate(1.2)";
      } else {
        ctx.filter = "none";
      }
      ctx.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none"; // Reset filter for crisp vector labels

      drawDetections(
        ctx,
        tracked,
        trackingEnabledRef.current,
        searchFilterRef.current,
        focusedItemRef.current,
        showReticleRef.current,
        showTrailsRef.current,
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

      // 7. Universal 1000+ Class Deep Classifier for Center Target (Pens, Watches, Notebooks, Keys)
      if (now - lastClassifyRef.current > 380) {
        lastClassifyRef.current = now;
        const cropSize = Math.min(240, Math.min(canvas.width, canvas.height) * 0.48);
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = 224;
        cropCanvas.height = 224;
        const cropCtx = cropCanvas.getContext("2d");
        if (cropCtx) {
          const sx = (canvas.width - cropSize) / 2;
          const sy = (canvas.height - cropSize) / 2;
          cropCtx.drawImage(activeVideo, sx, sy, cropSize, cropSize, 0, 0, 224, 224);
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
              } else {
                activeReticleTargetRef.current = null;
              }
            }
          });
        }
      }

      // 8. Periodically Save Detections to Store
      if (tracked.length > 0 && now - lastSaveRef.current > 3000) {
        lastSaveRef.current = now;
        tracked.forEach((d) => {
          saveDetection({
            id: crypto.randomUUID(),
            objectName: cleanClassName(d.class),
            confidence: d.score,
            timestamp: Date.now(),
          });
        });
      }

      animFrameRef.current = requestAnimationFrame(detectFrame);
    };

    detectFrame();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [running, mode, isVideoPlaying, threshold]);

  // Tap-to-Scan on Canvas (Locks onto ANY tiny item clicked on screen)
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

    cropCtx.drawImage(canvas, sx, sy, cropSize, cropSize, 0, 0, 224, 224);

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
      };
      setPinnedTargets((prev) => [newTarget, ...prev.slice(0, 4)]);
      setFocusedItem(top);
      setDetailedItems(res);
      setTapNotice(`🎯 Pinned: ${name} (${(top.probability * 100).toFixed(0)}%)`);
      setTimeout(() => setTapNotice(null), 3000);
      if (voiceEnabledRef.current) {
        speakObject(name);
      }
    }
  };

  // Core image detection runner
  const runDetectionOnImage = useCallback(
    async (img: HTMLImageElement) => {
      if (!isTensorFlowReady() || !canvasRef.current) return;
      setImageDetecting(true);

      const canvas = canvasRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      try {
        const predictions = await detectObjectsSAHI(img, threshold, {
          enabled: true,
          sliceGridRows: 2,
          sliceGridCols: 2,
          overlapRatio: 0.22,
          tileThreshold: Math.max(0.12, threshold * 0.65),
        });

        const tracked = predictions.map((d, i) => {
          const distInfo = estimateDistance(d.class, d.bbox[3], canvas.height);
          return {
            ...d,
            trackId: i + 1,
            distance: distInfo.distanceMeters,
            distanceLabel: distInfo.label,
            proximity: distInfo.proximity,
            direction: "Stationary" as const,
            directionArrow: "•",
            speed: 0,
            trajectory: [],
            isNew: false,
            age: 1,
          };
        });

        setDetections(tracked);
        setObjectCount(tracked.length);

        drawDetections(ctx, tracked, false, searchFilterRef.current, null, false, false, false);

        // Classify image details
        classifyObjects(img, 3).then((res) => {
          if (res && res.length > 0) {
            setDetailedItems(res);
            setFocusedItem(res[0]);
            if (voiceEnabledRef.current && res[0].probability > 0.28) {
              speakObject(res[0].className);
            }
          }
        });

        // Save to store
        tracked.forEach((d) => {
          saveDetection({
            id: crypto.randomUUID(),
            objectName: cleanClassName(d.class),
            confidence: d.score,
            timestamp: Date.now(),
          });
        });
      } catch (err) {
        console.error("Image detection error:", err);
      } finally {
        setImageDetecting(false);
      }
    },
    [threshold]
  );

  // Image Upload Handler (auto-detects immediately on upload)
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
        runDetectionOnImage(img);
      };
      img.src = url;
    },
    [stopCamera, runDetectionOnImage]
  );

  // Manual re-scan trigger
  const detectFromImage = useCallback(() => {
    if (!uploadedImage) return;
    playClickSound();
    const img = new Image();
    img.onload = () => {
      runDetectionOnImage(img);
    };
    img.src = uploadedImage;
  }, [uploadedImage, runDetectionOnImage]);

  // Video File Upload Handler
  const handleVideoFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      playClickSound();
      const file = e.target.files?.[0];
      if (!file || !isTensorFlowReady()) return;

      stopCamera();
      setMode("video");
      setDetections([]);
      setObjectCount(0);
      setPinnedTargets([]);
      setIsVideoPlaying(false);

      const url = URL.createObjectURL(file);
      setUploadedVideoUrl(url);

      if (fileVideoRef.current) {
        fileVideoRef.current.src = url;
        fileVideoRef.current.load();
      }
    },
    [stopCamera]
  );

  // Toggle Video File Play/Pause
  const toggleVideoPlayback = useCallback(() => {
    playClickSound();
    const vid = fileVideoRef.current;
    if (!vid) return;

    if (vid.paused) {
      vid.play();
      setIsVideoPlaying(true);
    } else {
      vid.pause();
      setIsVideoPlaying(false);
    }
  }, []);

  const restartVideoPlayback = useCallback(() => {
    playClickSound();
    const vid = fileVideoRef.current;
    if (!vid) return;
    vid.currentTime = 0;
    vid.play();
    setIsVideoPlaying(true);
  }, []);

  const captureScreenshot = () => {
    playClickSound();
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `Detectra-Advanced-Screenshot-Batch4-${Date.now()}.png`;
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

  const showCanvas = running || (mode === "image" && uploadedImage) || (mode === "video" && uploadedVideoUrl);

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Academic Header Banner */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                  Course Code: 20CA02801
                </span>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Batch: 4
                </span>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                  Single-Stage SSD MobileNet V2 + SAHI Multi-Scale Slicing
                </span>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  ImageNet 1000 Deep CNN
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">
                Real Time Visual <span className="text-primary">Object Recognition</span>
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
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
                title="Export Academic Project Evaluation CSV Report"
              >
                <FileText className="w-4 h-4" />
                <span>Download Academic Report</span>
              </button>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Professional Real-Time Object Recognition, Multi-Object Tracking, Optical Distance Estimation, Direction Vectors, and Slicing-Aided Hyper Inference (SAHI) for Small Objects.
          </p>
        </motion.div>

        {/* Input Source Mode Selector Tabs */}
        <div className="flex items-center gap-2 mb-4 p-1.5 rounded-xl bg-card border border-border w-fit flex-wrap">
          <button
            type="button"
            onClick={() => {
              playClickSound();
              if (mode !== "webcam") {
                stopCamera();
                setMode("webcam");
              }
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 ${
              mode === "webcam" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Live Webcam</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playClickSound();
              stopCamera();
              setMode("image");
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 ${
              mode === "image" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Image Detection</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playClickSound();
              stopCamera();
              setMode("video");
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 ${
              mode === "video" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Video File Detection</span>
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Main Visual Display */}
          <div className="lg:col-span-2">
            <div className="hover-card rounded-xl overflow-hidden border border-border">
              <div className="relative aspect-video bg-muted flex items-center justify-center overflow-hidden">
                {/* Hidden Webcam Video */}
                <video ref={videoRef} className="hidden" muted playsInline />

                {/* Hidden File Video Player */}
                <video
                  ref={fileVideoRef}
                  className="hidden"
                  playsInline
                  loop
                  onEnded={() => setIsVideoPlaying(false)}
                />

                {/* Main Visual Vector Canvas */}
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  title="Click anywhere on canvas to inspect and lock any object"
                  className={`absolute inset-0 w-full h-full object-contain cursor-crosshair ${
                    showCanvas ? "" : "hidden"
                  }`}
                />

                {!showCanvas && (
                  <div className="text-center text-muted-foreground p-6 max-w-md">
                    {loading ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm font-semibold text-foreground">Initializing Deep Neural Network...</p>
                        <p className="text-xs text-muted-foreground">COCO-SSD Single-Stage + MobileNet V2 1000+ Categories</p>
                      </div>
                    ) : mode === "webcam" ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                          <Video className="w-7 h-7 text-primary" />
                        </div>
                        <p className="text-sm sm:text-base font-semibold text-foreground">Live Webcam Object Detection</p>
                        <p className="text-xs text-muted-foreground">
                          Click "Start Detection" below to stream video with real-time bounding boxes, tracking, and voice alerts.
                        </p>
                      </div>
                    ) : mode === "image" ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                          <Upload className="w-7 h-7 text-primary" />
                        </div>
                        <p className="text-sm sm:text-base font-semibold text-foreground">Upload Image for AI Recognition</p>
                        <p className="text-xs text-muted-foreground">
                          Upload high-resolution photos to run multi-scale SAHI slicing for tiny and distant objects.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                          <Film className="w-7 h-7 text-primary" />
                        </div>
                        <p className="text-sm sm:text-base font-semibold text-foreground">Upload Video File (.mp4, .webm)</p>
                        <p className="text-xs text-muted-foreground">
                          Select a video clip to run continuous real-time object detection and trajectory tracking frame-by-frame!
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Real-Time Live HUD Telemetry */}
                {showCanvas && (running || isVideoPlaying) && (
                  <>
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                      <div className="bg-background/85 backdrop-blur rounded-md px-2.5 py-1 text-xs font-mono text-primary border border-border shadow-sm flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${fps >= 25 ? "bg-emerald-500 animate-ping" : fps >= 15 ? "bg-amber-500" : "bg-rose-500"}`} />
                        <span className="font-bold">{fps} FPS</span>
                      </div>
                      <div className="bg-background/85 backdrop-blur rounded-md px-2.5 py-1 text-xs font-mono text-muted-foreground border border-border shadow-sm">
                        {inferenceLatency} ms latency
                      </div>
                      {sahiMode && (
                        <div className="bg-primary/20 backdrop-blur rounded-md px-2 py-1 text-[11px] font-mono text-primary border border-primary/30 shadow-sm hidden sm:block">
                          SAHI Slicing: ACTIVE
                        </div>
                      )}
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
                      <p className="text-sm text-foreground font-semibold">Running SAHI Multi-Scale Sliced Inference...</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive Universal Banner */}
              {showCanvas && (
                <div className="bg-secondary/40 border-t border-border px-3 py-2 text-xs flex items-center justify-between text-muted-foreground flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                    <span>
                      <strong className="text-foreground">Interactive AI Ready:</strong> Aim reticle or{" "}
                      <span className="text-primary font-medium underline underline-offset-2">tap anywhere on screen</span> to inspect and pin tiny items (pens, watches, notebooks, keys, coins).
                    </span>
                  </div>
                  {tapNotice && <span className="text-emerald-400 font-semibold animate-pulse">{tapNotice}</span>}
                </div>
              )}

              {/* Primary Controls Toolbar */}
              <div className="p-3 sm:p-4 border-t border-border bg-card/40 space-y-3">
                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                  {mode === "webcam" && (
                    <>
                      {!running ? (
                        <button
                          onClick={startCamera}
                          disabled={loading || !isTensorFlowReady()}
                          className="btn-glow inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg gradient-cyan text-primary-foreground font-medium text-sm disabled:opacity-50 transition shadow-md"
                        >
                          <Video className="w-4 h-4" />
                          <span>Start Detection</span>
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

                      <button
                        type="button"
                        onClick={toggleCameraFacing}
                        disabled={loading || !isTensorFlowReady()}
                        className="btn-glow inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-secondary transition"
                        title="Switch between front and back camera"
                      >
                        <SwitchCamera className="w-3.5 h-3.5 text-primary" />
                        <span className="hidden sm:inline">Flip Camera ({facingMode === "environment" ? "Back" : "Front"})</span>
                        <span className="sm:hidden">Flip</span>
                      </button>
                    </>
                  )}

                  {mode === "image" && (
                    <>
                      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
                      <button
                        onClick={() => {
                          fileInputRef.current?.click();
                          playClickSound();
                        }}
                        disabled={loading || !isTensorFlowReady()}
                        className="btn-glow inline-flex items-center gap-1.5 px-3 py-2 rounded-lg gradient-cyan text-primary-foreground font-medium text-xs shadow"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Image</span>
                      </button>

                      {uploadedImage && (
                        <button
                          onClick={detectFromImage}
                          disabled={imageDetecting || !isTensorFlowReady()}
                          className="btn-glow inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-secondary transition"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-primary" />
                          <span>Run SAHI Sliced Scan</span>
                        </button>
                      )}
                    </>
                  )}

                  {mode === "video" && (
                    <>
                      <input type="file" ref={videoFileInputRef} accept="video/*" className="hidden" onChange={handleVideoFileUpload} />
                      <button
                        onClick={() => {
                          videoFileInputRef.current?.click();
                          playClickSound();
                        }}
                        disabled={loading || !isTensorFlowReady()}
                        className="btn-glow inline-flex items-center gap-1.5 px-3 py-2 rounded-lg gradient-cyan text-primary-foreground font-medium text-xs shadow"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Video (.mp4 / .webm)</span>
                      </button>

                      {uploadedVideoUrl && (
                        <>
                          <button
                            onClick={toggleVideoPlayback}
                            className="btn-glow inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-secondary transition"
                          >
                            {isVideoPlaying ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
                            <span>{isVideoPlaying ? "Pause Video" : "Play & Detect"}</span>
                          </button>

                          <button
                            onClick={restartVideoPlayback}
                            className="btn-glow inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-secondary transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restart</span>
                          </button>
                        </>
                      )}
                    </>
                  )}

                  {/* Video Recording */}
                  <button
                    type="button"
                    onClick={toggleVideoRecording}
                    disabled={!showCanvas}
                    className={`btn-glow inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                      isRecording ? "bg-rose-500 text-white animate-pulse" : "border border-border bg-card text-foreground hover:bg-secondary"
                    }`}
                    title="Record video clip of detections with bounding boxes"
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

                  {pinnedTargets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        playClickSound();
                        setPinnedTargets([]);
                      }}
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-300 font-medium hover:bg-amber-500/30 transition inline-flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Pins ({pinnedTargets.length})</span>
                    </button>
                  )}
                </div>

                {/* Secondary Feature Toggles */}
                <div className="flex items-center gap-2 pt-2 border-t border-border/60 flex-wrap">
                  {/* SAHI Sliced Inference Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setSahiMode(!sahiMode);
                    }}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition font-medium inline-flex items-center gap-1.5 ${
                      sahiMode ? "bg-primary/20 border-primary text-primary" : "bg-secondary/70 text-muted-foreground border-border"
                    }`}
                    title="Slicing Aided Hyper Inference (SAHI) tiles the frame to catch small, distant objects"
                  >
                    <Radar className="w-3.5 h-3.5" />
                    <span>SAHI Slicing: {sahiMode ? "ON" : "OFF"}</span>
                  </button>

                  {/* Tracking Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setTrackingEnabled(!trackingEnabled);
                    }}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition font-medium inline-flex items-center gap-1.5 ${
                      trackingEnabled ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-secondary/70 text-muted-foreground border-border"
                    }`}
                    title="Enable Kalman/EMA smooth object tracking across frames"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Tracking: {trackingEnabled ? "ON" : "OFF"}</span>
                  </button>

                  {/* Motion Trails Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setShowTrails(!showTrails);
                    }}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition font-medium inline-flex items-center gap-1.5 ${
                      showTrails ? "bg-violet-500/20 border-violet-500 text-violet-300" : "bg-secondary/70 text-muted-foreground border-border"
                    }`}
                    title="Draw glowing motion trajectory trails for tracked objects"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Trails: {showTrails ? "ON" : "OFF"}</span>
                  </button>

                  {/* Night Vision Booster Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setNightVision(!nightVision);
                    }}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition font-medium inline-flex items-center gap-1.5 ${
                      nightVision ? "bg-amber-500/20 border-amber-500 text-amber-300" : "bg-secondary/70 text-muted-foreground border-border"
                    }`}
                    title="Boost contrast and brightness for dark / low-light conditions"
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
                      showReticle ? "bg-cyan-500/20 border-cyan-500 text-cyan-400" : "bg-secondary/70 text-muted-foreground border-border"
                    }`}
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
                      voiceAnnounce ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-secondary/70 text-muted-foreground border-border"
                    }`}
                  >
                    {voiceAnnounce ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5" />}
                    <span>Voice: {voiceAnnounce ? "ON" : "OFF"}</span>
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

            {/* Category Multi-Color Legend */}
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
                <span className="inline-flex items-center gap-1 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#f43f5e]" />
                  <span>Vehicles & Outdoors</span>
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
                <span>
                  Backend: <strong className="text-primary uppercase">{tensorStats.backend} (GPU)</strong>
                </span>
                <span>
                  Latency: <strong className="text-foreground">{inferenceLatency} ms</strong>
                </span>
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

            {/* Category Breakdown Badges */}
            {Object.keys(categoryStats).length > 0 && (
              <div className="hover-card rounded-xl p-3.5 border border-border">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                  Distribution Breakdown
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(categoryStats).map(([cat, count]) => (
                    <span
                      key={cat}
                      className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-secondary/80 text-foreground border border-border/80"
                    >
                      {cat}: <strong className="text-primary">{count}</strong>
                    </span>
                  ))}
                </div>
              </div>
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
                  {searchFilter ? "No matching objects" : "No objects currently in frame. Start camera or upload media."}
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {filteredDetections.map((d, i) => {
                    const style = getCategoryStyle(d.class);
                    return (
                      <motion.div
                        key={`${d.class}-${d.trackId}-${i}`}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="p-2 rounded-lg bg-secondary/50 border border-border/50 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 truncate">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: style.color }} />
                            <span className="font-semibold text-foreground capitalize truncate">
                              {cleanClassName(d.class)} #{d.trackId}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-foreground shrink-0">
                            {(d.score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
                          <span>
                            {style.category} • {d.distanceLabel}
                          </span>
                          <span className="text-primary font-mono font-medium">
                            {d.direction} {d.directionArrow}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Real-time Event Stream Log */}
            <div className="hover-card rounded-xl p-4 border border-border">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Radar className="w-3.5 h-3.5 text-primary" />
                Live Event Stream
              </h3>
              {eventLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No movement events logged yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto text-[11px]">
                  {eventLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span className="truncate flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${log.type === "enter" ? "bg-emerald-400" : "bg-rose-400"}`} />
                        <span className="text-foreground">{log.text}</span>
                      </span>
                      <span className="font-mono text-[10px] shrink-0">{log.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <VoiceCommandButton onCommand={handleVoiceCommand} />

        {/* Academic Architecture & Viva Modal */}
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
                  {/* Single-Stage vs Two-Stage & YOLO Comparison */}
                  <div className="p-4 rounded-xl bg-secondary/40 border border-border">
                    <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-primary" />
                      Model Architecture Comparative Analysis (Viva Evaluation)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="py-2">Metric</th>
                            <th className="py-2 text-primary font-bold">SSD MobileNet V2 (Our Project)</th>
                            <th className="py-2 text-emerald-400 font-bold">YOLOv8 / YOLO11</th>
                            <th className="py-2 text-muted-foreground">Faster R-CNN (Two-Stage)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          <tr>
                            <td className="py-2 font-medium">Pipeline Stage</td>
                            <td className="py-2 text-primary font-semibold">Single-Stage Direct Bounding Box</td>
                            <td className="py-2 text-emerald-400 font-semibold">Single-Stage Anchor-Free</td>
                            <td className="py-2 text-muted-foreground">Two-Stage (RPN + RoI Head)</td>
                          </tr>
                          <tr>
                            <td className="py-2 font-medium">Frame Rate (FPS)</td>
                            <td className="py-2 text-primary font-semibold">30 - 60 FPS (Zero Latency)</td>
                            <td className="py-2 text-emerald-400 font-semibold">30 - 50 FPS (ONNX/WASM)</td>
                            <td className="py-2 text-muted-foreground">5 - 8 FPS (High Latency)</td>
                          </tr>
                          <tr>
                            <td className="py-2 font-medium">Browser Client Support</td>
                            <td className="py-2 text-primary font-semibold">Native WebGL GPU Hardware Shaders</td>
                            <td className="py-2 text-emerald-400">ONNX Runtime Web</td>
                            <td className="py-2 text-muted-foreground">Requires Heavy Server GPU</td>
                          </tr>
                          <tr>
                            <td className="py-2 font-medium">Small Object Slicing</td>
                            <td className="py-2 text-primary font-semibold">SAHI Multi-Scale Hyper Inference</td>
                            <td className="py-2">P2 Small Feature Map</td>
                            <td className="py-2 text-muted-foreground">RoI Pooling Feature Loss</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mathematical Core Derivations */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-xl bg-secondary/30 border border-border">
                      <h4 className="font-semibold text-xs text-primary uppercase mb-1">
                        SAHI (Slicing Aided Hyper Inference)
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Solves the small-object resolution loss problem by extracting overlapping high-resolution tiles, performing localized detection, and projecting coordinates back using Class-Aware Non-Maximum Suppression (IoU = 0.40).
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-secondary/30 border border-border">
                      <h4 className="font-semibold text-xs text-emerald-400 uppercase mb-1">
                        Pinhole Optical Distance Model
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Calculates real-world distance via geometric projection:{" "}
                        <code className="text-xs font-mono text-foreground font-bold">Z = (H_real × f) / h_bbox</code>, where standard webcam vertical focal length is calibrated to 0.88 × frame height.
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
                      <span className="text-muted-foreground block text-[10px]">ACTIVE GPU TENSORS</span>
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
                    <span>Download Academic CSV Report</span>
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
 * Enhanced Vector Drawing Engine:
 * - Anti-flicker Bounding Box Rendering
 * - Category Multi-Color Coding
 * - Labels with Format: "Person – 98%" & Subtitle "#1 • ~1.2m • Moving Right →"
 * - Glowing Motion Trajectory Trails
 * - Distance & Proximity Warning Glowing Borders
 * - Night Vision Overlay
 */
function drawDetections(
  ctx: CanvasRenderingContext2D,
  detections: TrackedDetection[],
  showTrackId: boolean,
  highlightFilter = "",
  focusedItem: DetailedClassification | null = null,
  showReticle = true,
  showTrails = true,
  isNightVision = false
) {
  // 1. Draw Glowing Motion Trajectory Trails
  if (showTrails) {
    detections.forEach((d) => {
      if (d.trajectory && d.trajectory.length >= 2) {
        const style = getCategoryStyle(d.class);
        ctx.save();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = style.color;
        ctx.shadowBlur = 8;

        ctx.beginPath();
        d.trajectory.forEach(([tx, ty], idx) => {
          if (idx === 0) ctx.moveTo(tx, ty);
          else ctx.lineTo(tx, ty);
        });
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  // 2. Draw Bounding Boxes with Category Color Coding
  detections.forEach((d) => {
    const [x, y, w, h] = d.bbox;
    const isHighlighted = highlightFilter && d.class.toLowerCase().includes(highlightFilter.toLowerCase());
    const style = getCategoryStyle(d.class);
    const isClose = d.proximity === "NEAR";

    const boxColor = isHighlighted ? "hsl(45, 100%, 50%)" : isClose ? "#ef4444" : style.color;
    const bgColor = isHighlighted ? "hsla(45, 100%, 50%, 0.95)" : isClose ? "rgba(239, 68, 68, 0.95)" : style.bgColor;

    ctx.save();
    ctx.strokeStyle = boxColor;
    ctx.lineWidth = isHighlighted || isClose ? 3.5 : 2.5;
    ctx.strokeRect(x, y, w, h);

    // Corner brackets for high-tech aesthetic
    const corner = Math.min(14, w / 4, h / 4);
    ctx.strokeStyle = isHighlighted ? "#ffffff" : isClose ? "#fca5a5" : style.accent;
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(x, y + corner); ctx.lineTo(x, y); ctx.lineTo(x + corner, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - corner, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + corner); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h - corner); ctx.lineTo(x, y + h); ctx.lineTo(x + corner, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - corner, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - corner); ctx.stroke();

    // Primary Label Format required: "Person – 98%"
    const displayName = cleanClassName(d.class);
    const primaryLabel = `${displayName} – ${(d.score * 100).toFixed(0)}%`;

    // Subtitle on box: "#1 • ~1.2m • Moving Right →"
    const trackStr = showTrackId ? `#${d.trackId} • ` : "";
    const distStr = d.distanceLabel ? `${d.distanceLabel} • ` : "";
    const dirStr = d.direction !== "Stationary" ? `${d.direction} ${d.directionArrow}` : "Stationary •";
    const subLabel = `${trackStr}${distStr}${dirStr}${isClose ? " • ⚠️ CLOSE" : ""}`;

    ctx.font = "bold 13px Inter, sans-serif";
    const primaryW = ctx.measureText(primaryLabel).width;
    ctx.font = "10px Inter, sans-serif";
    const subW = ctx.measureText(subLabel).width;
    const tagWidth = Math.max(primaryW, subW) + 16;
    const tagHeight = 34;

    const tagY = y >= tagHeight + 6 ? y - tagHeight : y;

    // Dark backdrop for ultra-sharp readability
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, tagY, tagWidth, tagHeight);

    // Subtle border on label box
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, tagY, tagWidth, tagHeight);

    // Draw primary text
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Inter, sans-serif";
    ctx.fillText(primaryLabel, x + 8, tagY + 14);

    // Draw secondary text
    ctx.font = "10px Inter, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText(subLabel, x + 8, tagY + 28);

    ctx.restore();
  });

  // 3. Night Vision Tactical HUD Overlay
  if (isNightVision) {
    ctx.save();
    ctx.fillStyle = "rgba(16, 185, 129, 0.95)";
    ctx.font = "bold 11px monospace";
    ctx.fillText("🌙 NIGHT VISION ACTIVE [ENHANCED HIGH-CONTRAST BOOST]", 12, ctx.canvas.height - 14);
    ctx.restore();
  }

  // 4. Futuristic Smart Reticle (Universal Item Scanner)
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
