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
  const cleanName = text.split(",")[0].trim();
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

  const filteredDetections = useMemo(() => {
    if (!searchFilter.trim()) return detections;
    return detections.filter(d => d.class.toLowerCase().includes(searchFilter.toLowerCase()));
  }, [detections, searchFilter]);

  // Load TensorFlow.js model
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
    return () => { cancelled = true; };
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
    setFps(0);
    trackerRef.current.reset();
  }, []);

  // Detection loop
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

        const predictions = await detectObjects(video, threshold);

        const tracked = settings.trackingEnabled
          ? trackerRef.current.update(predictions)
          : predictions.map((d, i) => ({ ...d, trackId: i + 1 }));

        setDetections(tracked);
        setObjectCount(tracked.length);

        // Draw with Reticle & Target Lock
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

        // FPS
        frameCount++;
        const now = performance.now();
        if (now - lastTime >= 1000) {
          setFps(frameCount);
          frameCount = 0;
          lastTime = now;
        }

        // Periodically run high-resolution center classification for ANY small or big item (1000+ classes)
        if (now - lastClassifyRef.current > 750) {
          lastClassifyRef.current = now;
          const cropSize = Math.min(260, Math.min(video.videoWidth, video.videoHeight));
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
                if (voiceEnabledRef.current && res[0].probability > 0.35) {
                  speakObject(res[0].className);
                }
              }
            });
          }
        }

        // Save detections periodically
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

  // Image upload handler
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    playClickSound();
    const file = e.target.files?.[0];
    if (!file || !isTensorFlowReady()) return;

    stopCamera();
    setMode("image");
    setDetections([]);
    setObjectCount(0);

    const url = URL.createObjectURL(file);
    setUploadedImage(url);

    // Draw image preview without detection
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

      const predictions = await detectObjects(img, threshold);

      const tracked = predictions.map((d, i) => ({ ...d, trackId: i + 1 }));
      setDetections(tracked);
      setObjectCount(tracked.length);

      drawDetections(ctx, tracked, false, searchFilterRef.current);

      // Classify everyday items from image
      classifyObjects(img, 3).then((res) => {
        if (res && res.length > 0) {
          setDetailedItems(res);
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
          <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">Real-time object detection and tracking using AI.</p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Video feed */}
          <div className="lg:col-span-2">
            <div className="hover-card rounded-xl overflow-hidden">
              <div className="relative aspect-video bg-muted flex items-center justify-center">
                <video ref={videoRef} className="hidden" muted playsInline />
                <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full object-contain ${showCanvas ? "" : "hidden"}`} />
                {!showCanvas && (
                  <div className="text-center text-muted-foreground p-4">
                    {loading ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm">Loading AI model...</p>
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
                      <p className="text-sm text-foreground font-medium">Detecting objects...</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-3 border-t border-border">
                {!running ? (
                  <button onClick={startCamera} disabled={loading || !isTensorFlowReady()} className="btn-glow inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg gradient-cyan text-primary-foreground font-medium text-sm disabled:opacity-50 transition shadow-md">
                    <Video className="w-4 h-4" />
                    <span className="hidden sm:inline">Start Detection</span>
                    <span className="sm:hidden">Start</span>
                  </button>
                ) : (
                  <button onClick={stopCamera} className="btn-glow inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg bg-destructive text-destructive-foreground font-medium text-sm transition">
                    <VideoOff className="w-4 h-4" />
                    Stop
                  </button>
                )}

                <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
                <button onClick={() => { fileInputRef.current?.click(); playClickSound(); }} disabled={loading || !isTensorFlowReady()} className="btn-glow inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-border bg-card text-foreground font-medium text-sm disabled:opacity-40 hover:bg-secondary transition">
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Upload Image</span>
                  <span className="sm:hidden">Upload</span>
                </button>

                {mode === "image" && uploadedImage && (
                  <button onClick={detectFromImage} disabled={imageDetecting || !isTensorFlowReady()} className="btn-glow inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg gradient-cyan text-primary-foreground font-medium text-sm disabled:opacity-50 transition shadow-md">
                    <ImageIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Detect Objects</span>
                    <span className="sm:hidden">Detect</span>
                  </button>
                )}

                <button onClick={captureScreenshot} disabled={!showCanvas} className="btn-glow inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-border bg-card text-foreground font-medium text-sm disabled:opacity-40 hover:bg-secondary transition">
                  <Camera className="w-4 h-4" />
                  <span className="hidden sm:inline">Screenshot</span>
                </button>

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
                    title="Toggle Smart Reticle (Aims & locks onto ANY object)"
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
                      setThreshold((prev) => (prev <= 0.2 ? 0.35 : 0.15));
                    }}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition font-medium ${
                      threshold <= 0.2
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-secondary/70 text-muted-foreground border-border hover:text-foreground"
                    }`}
                    title="Toggle high sensitivity mode to detect small & distant objects"
                  >
                    {threshold <= 0.2 ? "🎯 Small Objects: ON" : "🔍 Small Objects"}
                  </button>

                  <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                    <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Threshold:</span>
                    <input type="range" min="0.1" max="0.9" step="0.05" value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value))} className="w-20 accent-primary" />
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
                  <p className="text-xs text-muted-foreground">Objects</p>
                </div>
              </div>
            </div>

            {/* Smart Reticle Live Target Lock (Universal Detector for Any Item) */}
            {focusedItem && focusedItem.probability > 0.25 && (
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
                  {focusedItem.className.split(",")[0]}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {focusedItem.className}
                </p>
              </motion.div>
            )}

            <div className="hover-card rounded-xl p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Search Objects</h3>
              <ObjectSearchBar value={searchFilter} onChange={setSearchFilter} placeholder="Filter detections..." />
            </div>

            {/* Detailed Everyday Item Classifier (1000+ Categories) */}
            <div className="hover-card rounded-xl p-4 sm:p-5 border border-primary/20 bg-card/60 backdrop-blur">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span>✨ 1000+ Universal Classifier</span>
                </h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-medium">ImageNet Deep CNN</span>
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
                        {item.className.split(",")[0]}
                      </span>
                      <span className="font-mono text-primary font-semibold">
                        {(item.probability * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="hover-card rounded-xl p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Live Detections</h3>
              {filteredDetections.length === 0 ? (
                <p className="text-sm text-muted-foreground">{searchFilter ? "No matching objects" : "No objects detected"}</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredDetections.map((d, i) => (
                    <motion.div key={`${d.class}-${d.trackId}-${i}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                      <span className="text-sm font-medium text-foreground capitalize">{d.class} #{d.trackId}</span>
                      <span className="text-xs font-mono text-primary">{(d.score * 100).toFixed(1)}%</span>
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
    const color = isHighlighted ? "hsl(45, 100%, 50%)" : "hsl(187, 100%, 45%)";
    const bgColor = isHighlighted ? "hsla(45, 100%, 50%, 0.9)" : "hsla(187, 100%, 45%, 0.85)";

    ctx.strokeStyle = color;
    ctx.lineWidth = isHighlighted ? 3 : 2;
    ctx.strokeRect(x, y, w, h);

    // Corner accents
    const corner = Math.min(10, w / 4, h / 4);
    ctx.strokeStyle = isHighlighted ? "#ffffff" : "#38bdf8";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y + corner); ctx.lineTo(x, y); ctx.lineTo(x + corner, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - corner, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + corner); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h - corner); ctx.lineTo(x, y + h); ctx.lineTo(x + corner, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - corner, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - corner); ctx.stroke();

    const label = showTrackId
      ? `${d.class} #${d.trackId} ${(d.score * 100).toFixed(0)}%`
      : `${d.class} ${(d.score * 100).toFixed(0)}%`;
    ctx.font = isHighlighted ? "bold 13px Inter, sans-serif" : "12px Inter, sans-serif";
    const textW = ctx.measureText(label).width;
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y - 22, textW + 12, 22);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x + 6, y - 6);
  });

  // 2. Futuristic Smart Reticle (Universal Item Scanner for Any Object in the world)
  if (showReticle) {
    const size = Math.min(220, Math.min(ctx.canvas.width, ctx.canvas.height) * 0.45);
    const cx = ctx.canvas.width / 2;
    const cy = ctx.canvas.height / 2;
    const rx = cx - size / 2;
    const ry = cy - size / 2;
    const bracket = 24;

    const hasTarget = focusedItem && focusedItem.probability > 0.25;
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
      const topName = focusedItem.className.split(",")[0];
      const targetText = `🎯 TARGET: ${topName.toUpperCase()} (${(focusedItem.probability * 100).toFixed(0)}%)`;
      ctx.font = "bold 13px Inter, sans-serif";
      const w = ctx.measureText(targetText).width;
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(cx - w / 2 - 8, ry - 28, w + 16, 24);
      ctx.strokeStyle = "rgba(34, 197, 94, 0.9)";
      ctx.strokeRect(cx - w / 2 - 8, ry - 28, w + 16, 24);
      ctx.fillStyle = "#22c55e";
      ctx.fillText(targetText, cx - w / 2, ry - 11);
    } else {
      ctx.font = "11px Inter, sans-serif";
      const hint = "AIM AT ANY OBJECT (PEN, WATCH, KEYS, ETC.)";
      const w = ctx.measureText(hint).width;
      ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
      ctx.fillRect(cx - w / 2 - 6, ry - 22, w + 12, 18);
      ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
      ctx.fillText(hint, cx - w / 2, ry - 8);
    }
    ctx.restore();
  }
}
