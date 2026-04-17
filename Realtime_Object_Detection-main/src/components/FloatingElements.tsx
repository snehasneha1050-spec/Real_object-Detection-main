import { motion } from "framer-motion";

const shapes = [
  { size: 60, x: "10%", y: "20%", delay: 0, duration: 8, rotate: 45 },
  { size: 40, x: "80%", y: "15%", delay: 1, duration: 10, rotate: -30 },
  { size: 50, x: "70%", y: "60%", delay: 2, duration: 7, rotate: 60 },
  { size: 30, x: "20%", y: "70%", delay: 0.5, duration: 9, rotate: -45 },
  { size: 35, x: "50%", y: "30%", delay: 1.5, duration: 11, rotate: 20 },
  { size: 25, x: "85%", y: "80%", delay: 3, duration: 8, rotate: -60 },
];

export default function FloatingElements() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {shapes.map((s, i) => (
        <motion.div
          key={i}
          className="absolute border border-primary/20 rounded-lg"
          style={{
            width: s.size,
            height: s.size,
            left: s.x,
            top: s.y,
            rotate: `${s.rotate}deg`,
          }}
          animate={{
            y: [0, -20, 0],
            rotate: [s.rotate, s.rotate + 15, s.rotate],
            opacity: [0.15, 0.3, 0.15],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
      {/* Glowing dots */}
      {[
        { x: "15%", y: "40%", delay: 0 },
        { x: "60%", y: "20%", delay: 1.2 },
        { x: "40%", y: "75%", delay: 2.5 },
        { x: "90%", y: "45%", delay: 0.8 },
      ].map((d, i) => (
        <motion.div
          key={`dot-${i}`}
          className="absolute w-2 h-2 rounded-full bg-primary/30"
          style={{ left: d.x, top: d.y }}
          animate={{ scale: [1, 1.8, 1], opacity: [0.2, 0.6, 0.2] }}
          transition={{ duration: 4, delay: d.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
