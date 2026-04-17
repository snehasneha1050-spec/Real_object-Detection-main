import { useState } from "react";
import { motion } from "framer-motion";
import { User, Lock, Eye, Palette, Gauge, ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getSettings, saveSettings, playClickSound, AppSettings } from "@/lib/settingsStore";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PageTransition from "@/components/PageTransition";

type Category = "profile" | "password" | "detection" | "ui";

const categories: { id: Category; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile Settings", icon: User },
  { id: "password", label: "Password Settings", icon: Lock },
  { id: "detection", label: "Detection Settings", icon: Eye },
  { id: "ui", label: "UI Settings", icon: Palette },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(getSettings);
  const [active, setActive] = useState<Category>("profile");
  const [fullName, setFullName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (partial: Partial<AppSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveSettings(next);
    window.dispatchEvent(new Event("settings-changed"));
    playClickSound();
  };

  const handleUpdateProfile = async () => {
    if (!user || !fullName.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) toast.error("Failed to update profile");
    else toast.success("Profile updated!");
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <PageTransition>
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
            <span className="text-primary">Settings</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-10">Manage your account and preferences.</p>
        </motion.div>

        <div className="grid md:grid-cols-[260px_1fr] gap-4 sm:gap-6">
          {/* Left Panel - Categories */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="hover-card rounded-xl p-3 sm:p-4 h-fit">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">Categories</h3>
            <nav className="space-y-1">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { setActive(cat.id); playClickSound(); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    active === cat.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <cat.icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{cat.label}</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ${active === cat.id ? "rotate-90" : ""}`} />
                </button>
              ))}
            </nav>
          </motion.div>

          {/* Right Panel - Settings Content */}
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="hover-card rounded-xl p-5 sm:p-6"
          >
            {active === "profile" && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg gradient-cyan flex items-center justify-center">
                    <User className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Profile Settings</h2>
                    <p className="text-xs text-muted-foreground">Update your personal information</p>
                  </div>
                </div>
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name</label>
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
                    <Input value={user?.email || ""} disabled className="opacity-60" />
                    <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
                  </div>
                  <Button onClick={handleUpdateProfile} disabled={saving} className="btn-glow gradient-cyan text-primary-foreground">
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            )}

            {active === "password" && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg gradient-cyan flex items-center justify-center">
                    <Lock className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Password Settings</h2>
                    <p className="text-xs text-muted-foreground">Update your password</p>
                  </div>
                </div>
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">New Password</label>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Confirm Password</label>
                    <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
                  </div>
                  <Button onClick={handleUpdatePassword} disabled={saving} className="btn-glow gradient-cyan text-primary-foreground">
                    {saving ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </div>
            )}

            {active === "detection" && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg gradient-cyan flex items-center justify-center">
                    <Eye className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Detection Settings</h2>
                    <p className="text-xs text-muted-foreground">Configure detection behavior</p>
                  </div>
                </div>
                <div className="space-y-5 max-w-md">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">Confidence Threshold</span>
                      <span className="text-sm font-mono text-primary">{(settings.confidenceThreshold * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range" min="0.1" max="0.95" step="0.05"
                      value={settings.confidenceThreshold}
                      onChange={(e) => update({ confidenceThreshold: parseFloat(e.target.value) })}
                      className="w-full accent-primary"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Object Tracking</p>
                      <p className="text-xs text-muted-foreground">Maintain consistent IDs across frames</p>
                    </div>
                    <Switch checked={settings.trackingEnabled} onCheckedChange={(v) => update({ trackingEnabled: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Object Counting</p>
                      <p className="text-xs text-muted-foreground">Count detected objects in real-time</p>
                    </div>
                    <Switch checked={settings.countingEnabled} onCheckedChange={(v) => update({ countingEnabled: v })} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">Frame Rate</span>
                      <span className="text-sm font-mono text-primary">{settings.frameRate} FPS</span>
                    </div>
                    <input
                      type="range" min="5" max="60" step="5"
                      value={settings.frameRate}
                      onChange={(e) => update({ frameRate: parseInt(e.target.value) })}
                      className="w-full accent-primary"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Performance Mode</p>
                      <p className="text-xs text-muted-foreground">Reduce visual quality for faster processing</p>
                    </div>
                    <Switch checked={settings.performanceMode} onCheckedChange={(v) => update({ performanceMode: v })} />
                  </div>
                </div>
              </div>
            )}

            {active === "ui" && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg gradient-cyan flex items-center justify-center">
                    <Palette className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">UI Settings</h2>
                    <p className="text-xs text-muted-foreground">Customize the interface</p>
                  </div>
                </div>
                <div className="space-y-5 max-w-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Dark Mode</p>
                      <p className="text-xs text-muted-foreground">Toggle dark/light theme</p>
                    </div>
                    <Switch checked={settings.darkMode} onCheckedChange={(v) => update({ darkMode: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Sound Effects</p>
                      <p className="text-xs text-muted-foreground">Play click sounds on interactions</p>
                    </div>
                    <Switch checked={settings.soundEnabled} onCheckedChange={(v) => update({ soundEnabled: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Animations</p>
                      <p className="text-xs text-muted-foreground">Enable UI animations and transitions</p>
                    </div>
                    <Switch checked={settings.animationsEnabled} onCheckedChange={(v) => update({ animationsEnabled: v })} />
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
    </PageTransition>
  );
}
