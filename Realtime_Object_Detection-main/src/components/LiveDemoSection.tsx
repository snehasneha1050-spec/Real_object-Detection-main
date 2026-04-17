import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Eye, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { playClickSound } from "@/lib/settingsStore";

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const DEMO_OBJECTS = [
  { label: "Person", confidence: 0.96, x: 12, y: 15, w: 22, h: 55 },
  { label: "Laptop", confidence: 0.91, x: 40, y: 35, w: 25, h: 20 },
  { label: "Chair", confidence: 0.87, x: 68, y: 30, w: 18, h: 45 },
  { label: "Cup", confidence: 0.82, x: 55, y: 50, w: 8, h: 10 },
];

export default function LiveDemoSection() {
  const [visibleBoxes, setVisibleBoxes] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleBoxes((v) => {
        if (v >= DEMO_OBJECTS.length) {
          setTimeout(() => setVisibleBoxes(0), 2000);
          return v;
        }
        return v + 1;
      });
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="py-16 sm:py-24 relative overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div {...fadeUp} className="text-center mb-12 sm:mb-16">
          <span className="text-primary text-sm font-semibold uppercase tracking-widest">
            Live Preview
          </span>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold mt-3 mb-4">
            See AI Detection <span className="text-primary">In Action</span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto text-sm sm:text-base">
            Watch how Detectra AI identifies and labels objects with bounding boxes in real-time.
          </p>
        </motion.div>

        <motion.div {...fadeUp} className="max-w-3xl mx-auto">
          <div className="relative rounded-2xl overflow-hidden border border-border shadow-2xl bg-secondary/50 aspect-video">
            {/* Simulated scene background */}
            <div className="absolute inset-0 bg-gradient-to-br from-secondary to-muted" />
            <div className="absolute inset-0 bg-grid opacity-30" />

            {/* Scan line effect */}
            <motion.div
              className="absolute inset-x-0 h-px bg-primary/40"
              animate={{ top: ["0%", "100%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />

            {/* Bounding boxes */}
            {DEMO_OBJECTS.slice(0, visibleBoxes).map((obj, i) => (
              <motion.div
                key={obj.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="absolute border-2 border-primary rounded-sm"
                style={{
                  left: `${obj.x}%`,
                  top: `${obj.y}%`,
                  width: `${obj.w}%`,
                  height: `${obj.h}%`,
                }}
              >
                <div className="absolute -top-6 left-0 flex gap-1 items-center">
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded gradient-cyan text-primary-foreground whitespace-nowrap">
                    {obj.label}
                  </span>
                  <span className="text-xs font-mono text-primary">
                    {(obj.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                {/* Corner markers */}
                <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-primary" />
                <div className="absolute -top-px -right-px w-2 h-2 border-t-2 border-r-2 border-primary" />
                <div className="absolute -bottom-px -left-px w-2 h-2 border-b-2 border-l-2 border-primary" />
                <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-primary" />
              </motion.div>
            ))}

            {/* HUD overlay */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-mono text-primary/80">LIVE DETECTION</span>
            </div>
            <div className="absolute top-3 right-3 text-xs font-mono text-muted-foreground">
              {visibleBoxes} objects detected
            </div>
            <div className="absolute bottom-3 left-3 text-xs font-mono text-muted-foreground">
              COCO-SSD v2 • TensorFlow.js
            </div>
          </div>

          <div className="text-center mt-8">
            <Link
              to="/detection"
              onClick={playClickSound}
              className="btn-glow inline-flex items-center gap-2 px-6 py-3 rounded-xl gradient-cyan text-primary-foreground font-semibold text-sm sm:text-base"
            >
              <Eye className="w-5 h-5" />
              Try It Yourself
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
