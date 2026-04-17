import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, Mail, Calendar, BarChart3, Settings2, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { playClickSound } from "@/lib/settingsStore";
import { toast } from "sonner";
import PageTransition from "@/components/PageTransition";

interface ProfileData {
  full_name: string | null;
  avatar_url: string | null;
  total_detections: number;
  created_at: string;
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, avatar_url, total_detections, created_at")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [user]);

  const handleLogout = async () => {
    playClickSound();
    await signOut();
    toast.success("Logged out");
    navigate("/login");
  };

  if (!user || !profile) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <PageTransition>
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4 sm:px-6 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="hover-card rounded-2xl p-6 sm:p-8">
          {/* Avatar */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full gradient-cyan flex items-center justify-center mb-4 shadow-lg">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
              ) : (
                <User className="w-8 h-8 sm:w-10 sm:h-10 text-primary-foreground" />
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{profile.full_name || "User"}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8">
            <div className="hover-card rounded-xl p-3 sm:p-4 text-center">
              <BarChart3 className="w-5 h-5 text-primary mx-auto mb-2" />
              <p className="text-xl sm:text-2xl font-bold font-mono text-foreground">{profile.total_detections}</p>
              <p className="text-xs text-muted-foreground">Total Detections</p>
            </div>
            <div className="hover-card rounded-xl p-3 sm:p-4 text-center">
              <Calendar className="w-5 h-5 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">
                {new Date(profile.created_at).toLocaleDateString()}
              </p>
              <p className="text-xs text-muted-foreground">Joined</p>
            </div>
          </div>

          {/* Info */}
          <div className="space-y-3 sm:space-y-4 mb-8">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
              <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm text-foreground truncate">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
              <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm text-foreground">{profile.full_name || "Not set"}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => { playClickSound(); navigate("/settings"); }}
              variant="outline"
              className="w-full justify-start gap-2 btn-glow"
            >
              <Settings2 className="w-4 h-4" /> Settings
            </Button>
            <Button
              onClick={handleLogout}
              variant="destructive"
              className="w-full justify-start gap-2 btn-glow"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
    </PageTransition>
  );
}
