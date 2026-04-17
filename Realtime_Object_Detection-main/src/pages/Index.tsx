import { Link, useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { Upload, Video, Zap, Shield, BarChart3, Clock, Brain, Cpu, Eye, Target, ArrowRight, Monitor, Users, Car, Scan } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { playClickSound } from "@/lib/settingsStore";
import { useRef } from "react";
import heroImg from "@/assets/hero-detection.jpg";
import survImg from "@/assets/usecase-surveillance.jpg";
import retailImg from "@/assets/usecase-retail.jpg";
import autoImg from "@/assets/usecase-autonomous.jpg";
import NeuralBackground from "@/components/NeuralBackground";
import FloatingElements from "@/components/FloatingElements";
import TiltCard from "@/components/TiltCard";
import LiveDemoSection from "@/components/LiveDemoSection";
import PageTransition from "@/components/PageTransition";

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6 },
};

function StartDetectraButton() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const handleClick = () => {
    playClickSound();
    navigate(user ? "/dashboard" : "/login");
  };
  return (
    <button onClick={handleClick} className="btn-glow inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl gradient-cyan text-primary-foreground font-semibold transition-opacity shadow-lg text-sm sm:text-base">
      <Scan className="w-5 h-5" />
      Start Detectra
      <ArrowRight className="w-4 h-4" />
    </button>
  );
}

export default function Index() {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Hero */}
        <section ref={heroRef} className="relative min-h-screen flex items-center justify-center overflow-hidden">
          <NeuralBackground />
          <FloatingElements />
          <div className="absolute inset-0 bg-grid" />
          <div className="absolute top-1/4 left-1/4 w-64 sm:w-96 h-64 sm:h-96 bg-primary/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-52 sm:w-80 h-52 sm:h-80 bg-accent/5 rounded-full blur-[100px]" />

          <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10 container mx-auto px-4 sm:px-6 text-center pt-20">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-medium mb-6 sm:mb-8 border border-primary/20">
                <Zap className="w-4 h-4" />
                Powered by Deep Learning AI
              </span>
            </motion.div>

            <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }} className="text-3xl sm:text-5xl md:text-7xl font-black font-display leading-tight mb-4 sm:mb-6 text-3d">
              Real-Time AI Object
              <br />
              <span className="gradient-text">Detection & Tracking</span>
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25 }} className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10 px-2">
              Experience cutting-edge AI technology that identifies, tracks, and analyzes objects in images and live video streams with exceptional accuracy and speed.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }} className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <StartDetectraButton />
              <Link to="/detection" onClick={playClickSound} className="btn-glow inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl border border-border bg-card text-foreground font-semibold hover:bg-secondary transition-colors shadow-sm text-sm sm:text-base">
                <Upload className="w-5 h-5" />
                Upload Image
              </Link>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.6 }} className="mt-10 sm:mt-16 max-w-4xl mx-auto">
              <div className="rounded-2xl overflow-hidden shadow-2xl border border-border">
                <img src={heroImg} alt="Detectra AI Detection Dashboard" className="w-full" />
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* Features */}
        <section className="py-16 sm:py-24 relative">
          <div className="container mx-auto px-4 sm:px-6">
            <motion.div {...fadeUp} className="text-center mb-12 sm:mb-16">
              <span className="text-primary text-sm font-semibold uppercase tracking-widest">Features</span>
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold font-display mt-3 mb-4 text-3d">Powerful AI <span className="gradient-text">Capabilities</span></h2>
              <p className="text-muted-foreground max-w-lg mx-auto text-sm sm:text-base">Built for speed and accuracy with state-of-the-art deep learning technology.</p>
            </motion.div>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {[
                { icon: Zap, title: "Real-Time Detection", desc: "Detect objects in live video with minimal latency using optimized AI models." },
                { icon: Target, title: "AI Object Tracking", desc: "Track objects with persistent IDs across frames as they move through the scene." },
                { icon: Shield, title: "High Accuracy", desc: "Deep learning powered detection with adjustable confidence scoring." },
                { icon: BarChart3, title: "Analytics Dashboard", desc: "Track detection history and visualize statistics with interactive charts." },
                { icon: Video, title: "Webcam & Upload", desc: "Use your device camera or upload images for instant detection." },
                { icon: Clock, title: "Detection History", desc: "Review all past detections with timestamps, filters, and search." },
              ].map((f, i) => (
                <TiltCard key={f.title}>
                  <motion.div {...fadeUp} transition={{ delay: i * 0.1 }} className="hover-card rounded-xl p-5 sm:p-6 group h-full">
                    <div className="w-12 h-12 rounded-lg gradient-cyan flex items-center justify-center mb-4 group-hover:shadow-lg transition-shadow">
                      <f.icon className="w-6 h-6 text-primary-foreground icon-animated" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-foreground">{f.title}</h3>
                    <p className="text-sm text-muted-foreground">{f.desc}</p>
                  </motion.div>
                </TiltCard>
              ))}
            </div>
          </div>
        </section>

        {/* Live Demo */}
        <LiveDemoSection />

        {/* Technology */}
        <section className="py-16 sm:py-24 bg-secondary/30">
          <div className="container mx-auto px-4 sm:px-6">
            <motion.div {...fadeUp} className="text-center mb-12 sm:mb-16">
              <span className="text-primary text-sm font-semibold uppercase tracking-widest">Technology</span>
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold font-display mt-3 mb-4 text-3d">Powered by <span className="gradient-text">Advanced AI</span></h2>
            </motion.div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              {[
                { icon: Brain, title: "COCO-SSD", desc: "Pre-trained deep learning model for 80+ object categories." },
                { icon: Cpu, title: "TensorFlow.js", desc: "Browser-native ML framework for real-time inference." },
                { icon: Eye, title: "Computer Vision", desc: "Advanced image processing and object localization." },
                { icon: Shield, title: "Privacy First", desc: "All processing happens locally — your data never leaves your device." },
              ].map((t, i) => (
                <motion.div key={t.title} {...fadeUp} transition={{ delay: i * 0.1 }} className="text-center p-4 sm:p-6 group">
                  <div className="w-14 sm:w-16 h-14 sm:h-16 rounded-2xl gradient-cyan flex items-center justify-center mx-auto mb-4 group-hover:shadow-lg transition-shadow">
                    <t.icon className="w-7 sm:w-8 h-7 sm:h-8 text-primary-foreground icon-animated" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2 text-sm sm:text-base">{t.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">{t.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 sm:py-24">
          <div className="container mx-auto px-4 sm:px-6">
            <motion.div {...fadeUp} className="text-center mb-12 sm:mb-16">
              <span className="text-primary text-sm font-semibold uppercase tracking-widest">Process</span>
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold font-display mt-3 mb-4 text-3d">How It <span className="gradient-text">Works</span></h2>
            </motion.div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-6">
              {[
                { step: "01", title: "Capture", desc: "Stream live video or upload an image", icon: Video },
                { step: "02", title: "Process", desc: "AI analyzes each frame in real-time", icon: Cpu },
                { step: "03", title: "Detect", desc: "Objects identified with bounding boxes", icon: Eye },
                { step: "04", title: "Track", desc: "Persistent IDs assigned to each object", icon: Target },
                { step: "05", title: "Analyze", desc: "View statistics and detection history", icon: BarChart3 },
              ].map((s, i) => (
                <motion.div key={s.step} {...fadeUp} transition={{ delay: i * 0.1 }} className="text-center group">
                  <div className="w-12 sm:w-14 h-12 sm:h-14 rounded-full gradient-cyan flex items-center justify-center mx-auto mb-3 sm:mb-4 text-primary-foreground font-bold text-base sm:text-lg group-hover:shadow-lg transition-shadow">{s.step}</div>
                  <s.icon className="w-5 sm:w-6 h-5 sm:h-6 text-primary mx-auto mb-2 icon-animated" />
                  <h3 className="font-semibold text-foreground mb-1 text-sm sm:text-base">{s.title}</h3>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className="py-16 sm:py-24 bg-secondary/30">
          <div className="container mx-auto px-4 sm:px-6">
            <motion.div {...fadeUp} className="text-center mb-12 sm:mb-16">
              <span className="text-primary text-sm font-semibold uppercase tracking-widest">Applications</span>
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold font-display mt-3 mb-4 text-3d">Real-World <span className="gradient-text">Use Cases</span></h2>
            </motion.div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
              {[
                { img: survImg, title: "Smart Surveillance", desc: "AI-powered monitoring for security and safety applications.", icon: Monitor },
                { img: retailImg, title: "Retail Analytics", desc: "People counting, heatmaps, and customer behavior analysis.", icon: Users },
                { img: autoImg, title: "Autonomous Systems", desc: "Object detection for self-driving vehicles and robotics.", icon: Car },
              ].map((uc, i) => (
                <TiltCard key={uc.title}>
                  <motion.div {...fadeUp} transition={{ delay: i * 0.15 }} className="hover-card rounded-2xl overflow-hidden group h-full">
                    <div className="aspect-video overflow-hidden">
                      <img src={uc.img} alt={uc.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                    <div className="p-4 sm:p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <uc.icon className="w-5 h-5 text-primary icon-animated" />
                        <h3 className="font-semibold text-foreground">{uc.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">{uc.desc}</p>
                    </div>
                  </motion.div>
                </TiltCard>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-24 relative overflow-hidden">
          <NeuralBackground />
          <div className="container mx-auto px-4 sm:px-6 relative z-10">
            <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold font-display mb-4 sm:mb-6 text-3d">Ready to <span className="gradient-text">Try It?</span></h2>
              <p className="text-base sm:text-lg text-muted-foreground mb-8 sm:mb-10">Start detecting and tracking objects in real-time with our AI-powered system.</p>
              <StartDetectraButton />
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border py-8 sm:py-12">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md gradient-cyan flex items-center justify-center">
                    <Scan className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <span className="font-bold font-display text-foreground">Detectra AI</span>
                </div>
                <p className="text-sm text-muted-foreground">Real-time object detection and tracking powered by deep learning. All processing happens locally in your browser for complete privacy.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-3">Quick Links</h4>
                <div className="space-y-2">
                  {[{ to: "/dashboard", label: "Home" }, { to: "/detection", label: "Detection" }, { to: "/history", label: "History" }, { to: "/statistics", label: "Statistics" }, { to: "/profile", label: "Profile" }].map(l => (
                    <Link key={l.to} to={l.to} className="block text-sm text-muted-foreground hover:text-primary transition-colors">{l.label}</Link>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-3">Technology</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>TensorFlow.js</li>
                  <li>COCO-SSD Model</li>
                  <li>React + TypeScript</li>
                  <li>Client-side AI</li>
                </ul>
              </div>
            </div>
            <div className="border-t border-border mt-6 sm:mt-8 pt-6 sm:pt-8 text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} Detectra AI. Built with advanced deep learning technology.
            </div>
          </div>
        </footer>
      </div>
    </PageTransition>
  );
}
