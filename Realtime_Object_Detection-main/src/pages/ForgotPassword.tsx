import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Scan, Mail, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { playClickSound } from "@/lib/settingsStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import PageTransition from "@/components/PageTransition";
import NeuralBackground from "@/components/NeuralBackground";

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    playClickSound();
    if (!email) { toast.error("Enter your email"); return; }
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (error) { toast.error(error); } else { setSent(true); }
  };

  return (
    <PageTransition>
      <div className="min-h-screen flex items-center justify-center px-4 bg-background relative overflow-hidden">
        <NeuralBackground />
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="absolute top-1/3 left-1/3 w-64 h-64 bg-primary/5 rounded-full blur-[120px]" />

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md relative z-10"
        >
          <div className="glass-card rounded-2xl p-6 sm:p-8 shadow-xl border border-primary/10">
            <div className="flex flex-col items-center mb-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
                className="w-14 h-14 rounded-xl gradient-cyan flex items-center justify-center mb-4 shadow-lg glow-cyan"
              >
                <Scan className="w-8 h-8 text-primary-foreground" />
              </motion.div>
              <h1 className="text-2xl font-bold text-foreground text-3d">Reset Password</h1>
              <p className="text-sm text-muted-foreground mt-1">We'll send you a reset link</p>
            </div>

            {sent ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
                <p className="text-sm text-foreground">Check your email for a password reset link.</p>
                <Link to="/login" className="text-primary text-sm hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="w-4 h-4" /> Back to login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 bg-secondary/50 border-border/50 focus:border-primary/50 transition-all" />
                </div>
                <Button type="submit" disabled={loading} className="w-full btn-glow gradient-cyan text-primary-foreground font-semibold h-11">
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
                <Link to="/login" className="text-primary text-sm hover:underline flex items-center gap-1 justify-center">
                  <ArrowLeft className="w-4 h-4" /> Back to login
                </Link>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
}
