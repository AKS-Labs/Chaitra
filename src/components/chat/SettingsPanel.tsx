import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Settings, Info, ExternalLink, Shield, Save, RefreshCw, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODEL_OPTIONS = [
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    description: "Advanced reasoning and capabilities (Google)",
    default: true,
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash", 
    description: "Fast and efficient Gemini model (Google)",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    description: "Native multimodal, next-gen performance",
  },
  {
    id: "gemini-2.0-pro-exp",
    name: "Gemini 2.0 Pro Experimental",
    description: "State-of-the-art experimental reasoning",
  }
];

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-1.5-flash");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    updateAvailable: boolean;
    latestVersion: string;
    releaseUrl?: string;
  } | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const response = await window.electronAPI.getApiConfig();
      if (response?.success && response.data) {
        setApiKey(response.data.apiKey || "");
        setSelectedModel(response.data.model || "gemini-1.5-flash");
      }
    } catch (err) {
      console.error("Failed to load config:", err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
      checkUpdates();
    }
  }, [isOpen, loadConfig]);

  const checkUpdates = async () => {
    try {
      const result = await window.electronAPI.checkGitHubUpdate();
      if (result?.success && result.data?.updateAvailable) {
        setUpdateInfo({
          updateAvailable: true,
          latestVersion: result.data.latestVersion,
          releaseUrl: result.data.releaseUrl
        });
      }
    } catch (err) {
      console.error("Update check failed:", err);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const result = await window.electronAPI.setApiConfig({
        apiKey: apiKey.trim(),
        model: selectedModel
      });

      if (result?.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setError(result?.error || "Failed to save configuration");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsLoading(false);
    }
  };

  const openLink = (url: string) => {
    window.electronAPI.openUpdateDownload(url);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Settings Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[101] p-1 px-4"
          >
            <div className="relative bg-black/10 border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-[40px] overflow-hidden pointer-events-auto group">
              {/* Animated glass shine effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
              
              {/* Header */}
              <div className="relative flex items-center justify-between px-8 py-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-xl">
                    <Settings className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">System Configuration</h2>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-medium">Phantom Lens v1.2.0</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl hover:bg-white/10 text-white/30 hover:text-white transition-all transform hover:rotate-90 duration-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="relative p-8 space-y-10 max-h-[70vh] overflow-y-auto no-scrollbar">
                
                {/* API Section */}
                <section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-400" />
                      <h3 className="text-[10px] font-bold text-blue-400/60 uppercase tracking-[0.2em]">Neural Connection</h3>
                    </div>
                  </div>
                  
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <label className="text-xs font-semibold text-white/50 px-1">Gemini Pro API Key</label>
                      <div className="relative">
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="••••••••••••••••"
                          className="w-full bg-white/5 border border-white/10 text-white px-5 py-3 rounded-2xl focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all text-sm placeholder:text-white/10"
                        />
                      </div>
                      <p className="text-[10px] text-white/20 px-1 leading-relaxed">
                        Securely stored locally. Never transmitted except to AI provider.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <label className="text-xs font-semibold text-white/50 px-1">Model Architecture</label>
                      <div className="relative group/select">
                        <select
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 text-white px-5 py-3 rounded-2xl focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all text-sm appearance-none cursor-pointer"
                        >
                          {MODEL_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id} className="bg-slate-900 text-white">
                              {opt.name}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-white/20">
                           <ExternalLink className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Shortcuts Section */}
                <section className="space-y-6">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-[0.2em]">Neural Links</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { key: 'Ctrl + \\', label: 'Toggle Neural Interface' },
                      { key: 'Ctrl + Shift + V', label: 'Toggle Transparency' },
                      { key: 'Ctrl + Shift + S', label: 'Capture & Process' },
                      { key: 'Ctrl + ,', label: 'System Config' },
                    ].map((s, i) => (
                      <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.06] transition-all group/item">
                        <span className="text-xs text-white/50 group-hover/item:text-white/80 transition-colors">{s.label}</span>
                        <kbd className="font-mono text-[10px] text-white/60 bg-white/10 px-2 py-1 rounded-lg border border-white/10">{s.key}</kbd>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Footer Actions */}
              <div className="relative px-8 py-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                <div className="flex-1">
                   {saveSuccess && (
                     <motion.div 
                       initial={{ opacity: 0, y: 10 }}
                       animate={{ opacity: 1, y: 0 }}
                       className="flex items-center gap-2 text-emerald-400"
                     >
                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                       <span className="text-[10px] font-bold uppercase tracking-wider">Sync Complete</span>
                     </motion.div>
                   )}
                   {error && <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">{error}</span>}
                </div>
                
                <div className="flex gap-4">
                  <button
                    onClick={onClose}
                    className="text-[11px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                  >
                    Dismiss
                  </button>
                  <Button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="bg-blue-600/80 hover:bg-blue-600 text-white rounded-2xl px-8 py-5 h-auto text-[11px] font-bold uppercase tracking-widest shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all active:scale-95"
                  >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Commit Changes"}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
