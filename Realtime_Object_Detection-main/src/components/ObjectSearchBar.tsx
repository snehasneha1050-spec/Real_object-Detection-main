import { useState, useMemo, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getHistory } from "@/lib/detectionStore";

interface ObjectSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function ObjectSearchBar({ value, onChange, placeholder = "Search objects...", className = "" }: ObjectSearchBarProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get all known object types from history for suggestions
  const suggestions = useMemo(() => {
    const history = getHistory();
    const freq: Record<string, number> = {};
    history.forEach(h => { freq[h.objectName] = (freq[h.objectName] || 0) + 1; });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, []);

  const filteredSuggestions = useMemo(() => {
    if (!value.trim()) return suggestions.slice(0, 8);
    return suggestions.filter(s => s.name.toLowerCase().includes(value.toLowerCase())).slice(0, 8);
  }, [value, suggestions]);

  const showDropdown = focused && filteredSuggestions.length > 0;

  return (
    <div className={`relative ${className}`}>
      <div className={`relative flex items-center rounded-lg border transition-all ${focused ? "border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.15)]" : "border-border"} bg-secondary`}>
        <Search className="absolute left-3 w-4 h-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          className="w-full pl-10 pr-9 py-2.5 bg-transparent text-foreground placeholder:text-muted-foreground text-sm focus:outline-none"
        />
        {value && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(""); inputRef.current?.focus(); }}
            className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden"
          >
            <div className="p-1.5">
              <p className="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {value ? "Matching Objects" : "Detected Objects"}
              </p>
              {filteredSuggestions.map((s) => (
                <button
                  key={s.name}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChange(s.name); setFocused(false); }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-md text-sm hover:bg-secondary/80 transition-colors text-left"
                >
                  <span className="text-foreground capitalize font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{s.count} found</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
