import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AILoaderProps {
  text?: string;
  className?: string;
  variant?: "scanner" | "neural" | "pulse";
}

export default function AILoader({ text = "Processing...", className, variant = "neural" }: AILoaderProps) {
  if (variant === "scanner") {
    return (
      <div className={cn("flex flex-col items-center gap-4", className)}>
        <div className="relative w-20 h-20 rounded-xl border border-primary/30 overflow-hidden">
          <motion.div
            className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent"
            animate={{ top: ["0%", "100%", "0%"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-0 bg-primary/5" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">{text}</p>
      </div>
    );
  }

  if (variant === "pulse") {
    return (
      <div className={cn("flex flex-col items-center gap-4", className)}>
        <div className="relative">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0 w-12 h-12 rounded-full border border-primary/40"
              animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
              transition={{ duration: 2, delay: i * 0.6, repeat: Infinity }}
            />
          ))}
          <div className="w-12 h-12 rounded-full gradient-cyan flex items-center justify-center">
            <div className="w-3 h-3 bg-primary-foreground rounded-full" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground font-medium mt-8">{text}</p>
      </div>
    );
  }

  // Neural variant
  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="w-2 rounded-full bg-primary"
            animate={{ height: [12, 28, 12] }}
            transition={{ duration: 0.8, delay: i * 0.12, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground font-medium">{text}</p>
    </div>
  );
}
