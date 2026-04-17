import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff } from "lucide-react";
import { useVoiceCommands, VoiceCommandResult } from "@/hooks/useVoiceCommands";
import { cn } from "@/lib/utils";

interface VoiceCommandButtonProps {
  onCommand?: (result: VoiceCommandResult) => void;
  className?: string;
}

export default function VoiceCommandButton({ onCommand, className }: VoiceCommandButtonProps) {
  const { isListening, transcript, lastCommand, supported, toggle } = useVoiceCommands({
    onCommand,
  });

  if (!supported) return null;

  return (
    <div className={cn("fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3", className)}>
      {/* Transcript overlay */}
      <AnimatePresence>
        {(isListening || lastCommand) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="bg-card border border-border rounded-xl px-4 py-3 shadow-lg max-w-xs"
          >
            {isListening && (
              <div className="flex items-center gap-2 mb-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
                </span>
                <span className="text-xs font-medium text-destructive">Listening...</span>
              </div>
            )}
            {transcript && (
              <p className="text-sm text-foreground font-medium">"{transcript}"</p>
            )}
            {lastCommand && !isListening && (
              <p className="text-xs text-muted-foreground mt-1">
                {lastCommand.action === "unknown"
                  ? "Command not recognized. Try: \"Start detection\", \"Find person\""
                  : `✓ ${lastCommand.action.replace("_", " ")}${lastCommand.param ? `: ${lastCommand.param}` : ""}`}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={toggle}
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-colors",
          isListening
            ? "bg-destructive text-destructive-foreground"
            : "gradient-cyan text-primary-foreground"
        )}
      >
        {isListening && (
          <motion.span
            className="absolute w-14 h-14 rounded-full border-2 border-destructive"
            animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
        {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
      </motion.button>
    </div>
  );
}
