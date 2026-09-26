import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Video, VideoOff, Camera, Activity, Settings2, Upload, ImageIcon } from "lucide-react";
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
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const lastSaveRef = useRef<number>(0);
  const lastClassifyRef = useRef<number>(0);
  const trackerRef = useRef(new SimpleTracker());
  const searchFilterRef = useRef(searchFilter);
  searchFilterRef.current = searchFilter;

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

        // Draw
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0);
        drawDetections(ctx, tracked, settings.trackingEnabled, searchFilterRef.current);

        // FPS
        frameCount++;
        const now = performance.now();
        if (now - lastTime >= 1000) {
          setFps(frameCount);
          frameCount = 0;
          lastTime = now;
        }

        // Periodically run detailed classification for 1000+ daily items (e.g. pen, watch, notebook)
        if (now - lastClassifyRef.current > 1200) {
          lastClassifyRef.current = now;
          classifyObjects(video, 3).then((res) => {
            if (res && res.length > 0) {
              setDetailedItems(res);
            }
          });
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

                <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto mt-2 sm:mt-0">
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setThreshold((prev) => (prev <= 0.2 ? 0.35 : 0.15));
                    }}
                    className={`px-2.5 py-1 text-xs rounded-md border transition font-medium ${
                      threshold <= 0.2
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-secondary/70 text-muted-foreground border-border hover:text-foreground"
                    }`}
                    title="Toggle high sensitivity mode to detect small & distant objects"
                  >
                    {threshold <= 0.2 ? "🎯 Small Objects: ON" : "🔍 Small Objects Mode"}
                  </button>
                  <Settings2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Threshold:</span>
                  <input type="range" min="0.1" max="0.9" step="0.05" value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value))} className="w-24 accent-primary" />
                  <span className="text-xs font-mono text-primary">{(threshold * 100).toFixed(0)}%</span>
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

            <div className="hover-card rounded-xl p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Search Objects</h3>
              <ObjectSearchBar value={searchFilter} onChange={setSearchFilter} placeholder="Filter detections..." />
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

            {/* Detailed Everyday Item Classifier (1000+ Categories) */}
            <div className="hover-card rounded-xl p-4 sm:p-5 border border-primary/20 bg-card/60 backdrop-blur">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span>✨ 1000+ Item Identifier</span>
                </h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-medium">ImageNet AI</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Identifies everyday small items (pens, notebooks, watches, tools, keys, devices) in real time.
              </p>
              {detailedItems.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-1">Hold object in front of camera...</p>
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
          </div>
        </div>

        <VoiceCommandButton onCommand={handleVoiceCommand} />
      </div>
    </div>
  );
}

function drawDetections(ctx: CanvasRenderingContext2D, detections: TrackedDetection[], showTrackId: boolean, highlightFilter = "") {
  detections.forEach((d) => {
    const [x, y, w, h] = d.bbox;
    const isHighlighted = highlightFilter && d.class.toLowerCase().includes(highlightFilter.toLowerCase());
    const color = isHighlighted ? "hsl(45, 100%, 50%)" : "hsl(200, 100%, 50%)";
    const bgColor = isHighlighted ? "hsla(45, 100%, 50%, 0.9)" : "hsla(200, 100%, 50%, 0.85)";

    ctx.strokeStyle = color;
    ctx.lineWidth = isHighlighted ? 3 : 2;
    ctx.strokeRect(x, y, w, h);

    const label = showTrackId
      ? `${d.class} #${d.trackId} ${(d.score * 100).toFixed(0)}%`
      : `${d.class} ${(d.score * 100).toFixed(0)}%`;
    ctx.font = isHighlighted ? "bold 14px Inter, sans-serif" : "14px Inter, sans-serif";
    const textW = ctx.measureText(label).width;
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y - 22, textW + 12, 22);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x + 6, y - 6);
  });
}
