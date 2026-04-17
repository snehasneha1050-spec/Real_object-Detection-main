import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Scan, Menu, X } from "lucide-react";
import { useState } from "react";
import { playClickSound } from "@/lib/settingsStore";
import { useAuth } from "@/contexts/AuthContext";

const links = [
  { to: "/dashboard", label: "Home" },
  { to: "/detection", label: "Detection" },
  { to: "/history", label: "History" },
  { to: "/statistics", label: "Statistics" },
  { to: "/profile", label: "Profile" },
];

export default function Navbar() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2.5" onClick={playClickSound}>
          <div className="w-8 h-8 rounded-lg gradient-cyan flex items-center justify-center">
            <Scan className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">Detectra AI</span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={playClickSound}
              className="relative px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
              {location.pathname === l.to && (
                <motion.div
                  layoutId="nav-underline"
                  className="absolute bottom-0 left-4 right-4 h-0.5 gradient-cyan rounded-full"
                />
              )}
            </Link>
          ))}
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden text-foreground" onClick={() => { setOpen(!open); playClickSound(); }}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-background border-b border-border"
        >
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => { setOpen(false); playClickSound(); }}
              className={`block px-6 py-3 text-sm font-medium transition-colors ${
                location.pathname === l.to ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </motion.div>
      )}
    </nav>
  );
}
