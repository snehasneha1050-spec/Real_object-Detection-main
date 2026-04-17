import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Video, Upload, History, BarChart3, ArrowRight, Scan, Activity } from "lucide-react";
import { useMemo, useCallback } from "react";
import { getHistory } from "@/lib/detectionStore";
import PageTransition from "@/components/PageTransition";
import { playClickSound } from "@/lib/settingsStore";
import { useCountUp } from "@/hooks/useCountUp";
import VoiceCommandButton from "@/components/VoiceCommandButton";
import { VoiceCommandResult } from "@/hooks/useVoiceCommands";

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

function AnimatedStat({ value, suffix = "" }: { value: number | string; suffix?: string }) {
  const num = typeof value === "number" ? value : 0;
  const animated = useCountUp(num);
  if (typeof value === "string") return <span>{value}</span>;
  return <span>{animated}{suffix}</span>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const history = useMemo(() => getHistory(), []);

  const handleVoiceCommand = useCallback((result: VoiceCommandResult) => {
    if (result.action === "start_detection") {
      navigate("/detection");
    } else if (result.action === "find" || result.action === "search") {
      navigate("/detection");
    }
  }, [navigate]);
  const totalDetections = history.length;
  const objectTypes = useMemo(() => new Set(history.map(h => h.objectName)).size, [history]);
  const avgConf = totalDetections > 0 ? Math.round(history.reduce((a, h) => a + h.confidence, 0) / totalDetections * 100) : 0;
  const recent24h = history.filter(h => Date.now() - h.timestamp < 86400000).length;
  const recentDetections = history.slice(0, 5);

  const stats = [
    { label: "Total Detections", value: totalDetections, icon: Scan },
    { label: "Object Types", value: objectTypes, icon: Activity },
    { label: "Avg Confidence", value: avgConf, icon: BarChart3, suffix: "%" },
    { label: "Recent (24h)", value: recent24h, icon: History },
  ];

  return (
    <PageTransition>
      <div className="min-h-screen pt-20 pb-12">
        <div className="container mx-auto px-4 sm:px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold font-display mb-2 text-3d">
              Welcome to <span className="gradient-text">Detectra AI</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">Your AI-powered object detection dashboard.</p>
          </motion.div>

          <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8">
            {stats.map((s) => (
              <motion.div key={s.label} variants={fadeUp} className="hover-card rounded-xl p-4 sm:p-5 text-center">
                <s.icon className="w-5 h-5 text-primary mx-auto mb-2" />
                <p className="text-xl sm:text-2xl font-bold font-mono text-foreground">
                  {s.value === 0 && !s.suffix ? "—" : <AnimatedStat value={s.value} suffix={s.suffix} />}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div variants={stagger} initial="hidden" animate="visible" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
            {[
              { to: "/detection", icon: Video, title: "Live Detection", desc: "Start real-time webcam object detection" },
              { to: "/detection", icon: Upload, title: "Image Detection", desc: "Upload an image for AI analysis" },
              { to: "/history", icon: History, title: "Detection History", desc: "Review past detection events" },
            ].map((action) => (
              <motion.div key={action.title} variants={fadeUp}>
                <Link to={action.to} onClick={playClickSound} className="hover-card rounded-xl p-5 sm:p-6 flex items-start gap-4 group block">
                  <div className="w-12 h-12 rounded-lg gradient-cyan flex items-center justify-center shrink-0 group-hover:shadow-lg transition-shadow">
                    <action.icon className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground mb-1 flex items-center gap-2">
                      {action.title}
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </h3>
                    <p className="text-sm text-muted-foreground">{action.desc}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <div className="hover-card rounded-xl p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Detections</h3>
                <Link to="/history" onClick={playClickSound} className="text-xs text-primary hover:underline">View All</Link>
              </div>
              {recentDetections.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No detections yet. Start detecting objects!</p>
              ) : (
                <div className="space-y-2">
                  {recentDetections.map((d, i) => (
                    <motion.div key={d.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                      <span className="text-sm font-medium text-foreground capitalize">{d.objectName}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-primary">{(d.confidence * 100).toFixed(1)}%</span>
                        <span className="text-xs text-muted-foreground">{new Date(d.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          <VoiceCommandButton onCommand={handleVoiceCommand} />
        </div>
      </div>
    </PageTransition>
  );
}
