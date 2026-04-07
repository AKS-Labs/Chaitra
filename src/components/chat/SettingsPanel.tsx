import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Settings, ExternalLink, Shield, RefreshCw, Heart } from "lucide-react";
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
            <div className="bg-[#121214]/90 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden pointer-events-auto">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-blue-400" />
                  <h2 className="text-lg font-semibold text-white/90">Settings</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto no-scrollbar">
                
                {/* API Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-blue-400/80" />
                    <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest">AI Engine</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white/70">Gemini API Key</label>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Paste your key here..."
                        className="w-full bg-white/5 border border-white/10 text-white px-4 py-2.5 rounded-xl focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all text-sm"
                      />
                      <p className="text-[10px] text-white/40 leading-relaxed italic">
                        Get your API key for free at 
                        <button 
                          onClick={() => openLink('https://aistudio.google.com/app/apikey')}
                          className="ml-1 text-blue-400 hover:underline inline-flex items-center gap-0.5"
                        >
                          Google AI Studio <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white/70">Preferred Model</label>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 text-white px-4 py-2.5 rounded-xl focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all text-sm appearance-none cursor-pointer"
                      >
                        {MODEL_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id} className="bg-[#121214] text-white">
                            {opt.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-white/50">{MODEL_OPTIONS.find(m => m.id === selectedModel)?.description}</p>
                    </div>
                  </div>
                </section>

                {/* Shortcuts Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="w-4 h-4 text-emerald-400/80" />
                    <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest">Shortcuts</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {[
                      { key: 'Ctrl + \\', label: 'Toggle Window' },
                      { key: 'Ctrl + ,', label: 'Settings' },
                      { key: 'Ctrl + R', label: 'Reset / Cancel' },
                      { key: 'C+S+S', label: 'Capture & Ask' },
                      { key: 'Alt + ↑↓', label: 'History Nav' },
                    ].map((s, i) => (
                      <div key={i} className="flex flex-col gap-1.5 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/[0.07] transition-colors">
                        <span className="text-white/40 text-[10px]">{s.label}</span>
                        <kbd className="font-mono text-blue-300/80 bg-blue-500/10 px-1.5 py-0.5 rounded-md inline-block self-start">{s.key}</kbd>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Updates & Support */}
                <section className="pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {updateInfo?.updateAvailable ? (
                        <button
                          onClick={() => openLink(updateInfo.releaseUrl || 'https://ph.inulute.com/dl')}
                          className="text-xs px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30 hover:bg-blue-500/30 transition-all flex items-center gap-1.5"
                        >
                          Update to {updateInfo.latestVersion} Available
                        </button>
                      ) : (
                        <span className="text-[10px] text-white/30 font-medium">Version v1.2.0 (Stable)</span>
                      )}
                    </div>
                    
                    <button 
                      onClick={() => openLink('https://support.inulute.com')}
                      className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
                    >
                      <Heart className="w-3.5 h-3.5 text-red-400/70" />
                      Support Project
                    </button>
                  </div>
                </section>
              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 bg-white/5 border-t border-white/5 flex items-center justify-between">
                <div>
                   {saveSuccess && (
                     <motion.span 
                       initial={{ opacity: 0, x: -10 }}
                       animate={{ opacity: 1, x: 0 }}
                       className="text-xs text-emerald-400/90 font-medium"
                     >
                       Settings saved!
                     </motion.span>
                   )}
                   {error && <span className="text-xs text-red-400/90">{error}</span>}
                </div>
                
                <div className="flex gap-2">
                  <Button
                    onClick={onClose}
                    variant="ghost"
                    className="text-white/60 hover:text-white hover:bg-white/10 rounded-xl px-6"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-8 shadow-lg shadow-blue-600/20"
                  >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Save Changes"}
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
