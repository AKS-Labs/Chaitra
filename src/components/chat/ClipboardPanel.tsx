import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Pin, Copy, Keyboard, ChevronDown, ChevronUp,
  Trash2, Pencil, ClipboardPaste, Settings, X, Check, RotateCcw
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ClipboardItem {
  id: string;
  text: string;
  pinned: boolean;
  timestamp: number;
}

interface ShortcutConfig {
  startTyping: string;
  pauseTyping: string;
  resumeTyping: string;
  stopTyping: string;
  invokeClipboard: string;
}

const DEFAULT_SHORTCUTS: ShortcutConfig = {
  startTyping: "Alt+V",
  pauseTyping: "Alt+S",
  resumeTyping: "Alt+R",
  stopTyping: "Alt+E",
  invokeClipboard: "Alt+Shift+V",
};

interface ClipboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
  items: ClipboardItem[];
  onPin: (id: string, currentlyPinned: boolean) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string, newText: string) => void;
}

export default function ClipboardPanel({
  isOpen, onClose, items, onPin, onDelete, onEdit
}: ClipboardPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>(() => {
    try {
      const stored = localStorage.getItem("chaitra-clipboard-shortcuts");
      return stored ? { ...DEFAULT_SHORTCUTS, ...JSON.parse(stored) } : DEFAULT_SHORTCUTS;
    } catch { return DEFAULT_SHORTCUTS; }
  });
  const [editingShortcut, setEditingShortcut] = useState<keyof ShortcutConfig | null>(null);
  const [typingSpeed, setTypingSpeed] = useState(() =>
    Number(localStorage.getItem("chaitra-typing-speed") ?? 25)
  );
  const [historyLimit, setHistoryLimit] = useState(() =>
    Number(localStorage.getItem("chaitra-history-limit") ?? 100)
  );
  const [autoHideOnPaste, setAutoHideOnPaste] = useState(() =>
    localStorage.getItem("chaitra-auto-hide-paste") !== "false"
  );

  const filteredItems = useMemo(() => {
    let result = items;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = items.filter(i => i.text.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.timestamp - a.timestamp;
    });
  }, [items, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleCopy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  /** Paste: copy to clipboard then hide window so user can Ctrl+V */
  const handlePaste = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onClose();
      await new Promise(r => setTimeout(r, 150));
      await window.electronAPI.toggleMainWindow?.();
    } catch (e) {
      console.error("Failed to paste", e);
    }
  }, [onClose]);

  /** Click on text body → hide & paste */
  const handleTextClick = useCallback(async (text: string, id: string) => {
    if (editingId === id) return; // don't paste while editing
    await handlePaste(text);
  }, [editingId, handlePaste]);

  /** Type via bypass */
  const handleType = async (text: string) => {
    try {
      onClose();
      await window.electronAPI.simulateBypassType?.(text);
    } catch (e) {
      console.error("Failed to type", e);
    }
  };

  /** Start editing an item inline */
  const startEdit = (item: ClipboardItem) => {
    setEditingId(item.id);
    setEditText(item.text);
  };

  const commitEdit = () => {
    if (editingId && editText.trim()) {
      onEdit?.(editingId, editText);
    }
    setEditingId(null);
    setEditText("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  // ── Settings helpers ──────────────────────────────────────────────────────
  const saveShortcut = (key: keyof ShortcutConfig, value: string) => {
    const updated = { ...shortcuts, [key]: value };
    setShortcuts(updated);
    localStorage.setItem("chaitra-clipboard-shortcuts", JSON.stringify(updated));
  };

  const resetShortcuts = () => {
    setShortcuts(DEFAULT_SHORTCUTS);
    localStorage.setItem("chaitra-clipboard-shortcuts", JSON.stringify(DEFAULT_SHORTCUTS));
  };

  const saveTypingSpeed = (v: number) => {
    setTypingSpeed(v);
    localStorage.setItem("chaitra-typing-speed", String(v));
  };

  const saveHistoryLimit = (v: number) => {
    setHistoryLimit(v);
    localStorage.setItem("chaitra-history-limit", String(v));
  };

  const saveAutoHide = (v: boolean) => {
    setAutoHideOnPaste(v);
    localStorage.setItem("chaitra-auto-hide-paste", String(v));
  };

  const shortcutLabels: Record<keyof ShortcutConfig, string> = {
    startTyping: "Start Typing",
    pauseTyping: "Pause Typing",
    resumeTyping: "Resume Typing",
    stopTyping: "Stop Typing",
    invokeClipboard: "Open Clipboard",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 z-40 bg-black/40 backdrop-blur-sm pointer-events-auto"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className="absolute top-0 right-0 bottom-0 w-80 bg-[#0d0d0f]/95 backdrop-blur-xl border-l border-white/10 z-50 flex flex-col pointer-events-auto"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white/90">
                  {showSettings ? "Clipboard Settings" : "Chaitra Clipboard"}
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowSettings(s => !s)}
                    className={`p-1.5 rounded-lg transition-colors ${showSettings ? "bg-purple-500/20 text-purple-400" : "hover:bg-white/10 text-white/40 hover:text-white"}`}
                    title="Settings"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                    title="Close"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {!showSettings && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <input
                    type="text"
                    placeholder="Search clipboard..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-md py-1.5 pl-8 pr-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>
              )}
            </div>

            {/* ── Settings View ── */}
            {showSettings ? (
              <ScrollArea className="flex-1 px-4 py-3">
                <div className="flex flex-col gap-5">

                  {/* Shortcuts */}
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Keyboard Shortcuts</span>
                      <button
                        onClick={resetShortcuts}
                        className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/70 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      {(Object.keys(shortcuts) as (keyof ShortcutConfig)[]).map(key => (
                        <div key={key} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                          <span className="text-xs text-white/70">{shortcutLabels[key]}</span>
                          {editingShortcut === key ? (
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                className="w-24 bg-black/40 border border-purple-500/50 rounded px-2 py-0.5 text-[11px] text-white focus:outline-none"
                                defaultValue={shortcuts[key]}
                                onKeyDown={e => {
                                  e.preventDefault();
                                  const parts: string[] = [];
                                  if (e.altKey) parts.push("Alt");
                                  if (e.ctrlKey) parts.push("Control");
                                  if (e.shiftKey) parts.push("Shift");
                                  if (e.key !== "Alt" && e.key !== "Control" && e.key !== "Shift") {
                                    parts.push(e.key.toUpperCase());
                                    saveShortcut(key, parts.join("+"));
                                    setEditingShortcut(null);
                                  }
                                }}
                                onBlur={() => setEditingShortcut(null)}
                              />
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditingShortcut(key)}
                              className="font-mono text-[11px] bg-white/10 hover:bg-white/20 border border-white/10 rounded px-2 py-0.5 text-white/80 transition-colors"
                            >
                              {shortcuts[key]}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-white/30 mt-2 leading-relaxed">
                      Note: Shortcut display only — restart app after changing keyboard shortcuts in code for them to take effect.
                    </p>
                  </section>

                  {/* Typing */}
                  <section>
                    <span className="text-xs font-semibold text-white/60 uppercase tracking-wider block mb-2">Typing Speed</span>
                    <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/60">Delay between chars</span>
                        <span className="text-xs font-mono text-purple-400">{typingSpeed}ms</span>
                      </div>
                      <input
                        type="range" min={5} max={150} value={typingSpeed}
                        onChange={e => saveTypingSpeed(Number(e.target.value))}
                        className="w-full accent-purple-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-white/30">
                        <span>Fast (5ms)</span><span>Slow (150ms)</span>
                      </div>
                    </div>
                  </section>

                  {/* History */}
                  <section>
                    <span className="text-xs font-semibold text-white/60 uppercase tracking-wider block mb-2">History Settings</span>
                    <div className="flex flex-col gap-2">
                      <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/60">Max history items</span>
                          <span className="text-xs font-mono text-purple-400">{historyLimit}</span>
                        </div>
                        <input
                          type="range" min={10} max={500} step={10} value={historyLimit}
                          onChange={e => saveHistoryLimit(Number(e.target.value))}
                          className="w-full accent-purple-500 cursor-pointer"
                        />
                      </div>
                      <label className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-colors">
                        <span className="text-xs text-white/70">Hide window on paste click</span>
                        <div
                          onClick={() => saveAutoHide(!autoHideOnPaste)}
                          className={`w-8 h-4 rounded-full transition-colors relative ${autoHideOnPaste ? "bg-purple-500" : "bg-white/20"}`}
                        >
                          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${autoHideOnPaste ? "translate-x-4" : "translate-x-0.5"}`} />
                        </div>
                      </label>
                    </div>
                  </section>

                  {/* Info */}
                  <section>
                    <span className="text-xs font-semibold text-white/60 uppercase tracking-wider block mb-2">Quick Reference</span>
                    <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-3 flex flex-col gap-1.5">
                      {[
                        ["Click text", "Paste & hide"],
                        ["Paste icon", "Copy → hide (Ctrl+V ready)"],
                        ["Type icon", "Auto-type via keyboard"],
                        ["Edit icon", "Inline text editing"],
                      ].map(([action, desc]) => (
                        <div key={action} className="flex items-start gap-2">
                          <span className="text-[11px] font-medium text-white/50 w-20 shrink-0">{action}</span>
                          <span className="text-[11px] text-white/30">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </ScrollArea>
            ) : (
              // ── Clipboard List ──
              <ScrollArea className="flex-1 py-1 px-3">
                <div className="flex flex-col gap-2 pb-4 pt-2">
                  {filteredItems.length === 0 ? (
                    <div className="text-center text-white/30 text-xs py-10">
                      {items.length === 0 ? "Nothing copied yet. Start copying!" : "No matches found."}
                    </div>
                  ) : (
                    filteredItems.map(item => {
                      const isExpanded = expandedItems.has(item.id);
                      const isLong = item.text.length > 100 || item.text.includes("\n");
                      const isEditing = editingId === item.id;

                      return (
                        <div
                          key={item.id}
                          className="group bg-white/5 border border-white/10 hover:border-white/20 rounded-lg overflow-hidden transition-all"
                        >
                          <div className="p-3">
                            {/* Top bar: timestamp + action buttons */}
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] text-white/30 shrink-0">
                                {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {/* Pin */}
                                <button
                                  onClick={() => onPin(item.id, item.pinned)}
                                  className={`p-1 rounded hover:bg-white/10 transition-colors ${item.pinned ? "text-blue-400" : "text-white/30 hover:text-blue-400"}`}
                                  title={item.pinned ? "Unpin" : "Pin"}
                                >
                                  <Pin className="w-3 h-3" />
                                </button>
                                {/* Copy */}
                                <button
                                  onClick={() => handleCopy(item.text)}
                                  className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-white transition-colors"
                                  title="Copy to clipboard"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                                {/* Paste (copy + hide) */}
                                <button
                                  onClick={() => handlePaste(item.text)}
                                  className="p-1 rounded hover:bg-emerald-500/20 text-white/30 hover:text-emerald-400 transition-colors"
                                  title="Paste (copy & hide window)"
                                >
                                  <ClipboardPaste className="w-3 h-3" />
                                </button>
                                {/* Edit */}
                                <button
                                  onClick={() => isEditing ? cancelEdit() : startEdit(item)}
                                  className={`p-1 rounded transition-colors ${isEditing ? "bg-amber-500/20 text-amber-400" : "hover:bg-amber-500/20 text-white/30 hover:text-amber-400"}`}
                                  title="Edit"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                {/* Type */}
                                <button
                                  onClick={() => handleType(item.text)}
                                  className="p-1 rounded hover:bg-purple-500/20 text-white/30 hover:text-purple-400 transition-colors"
                                  title="Auto-type"
                                >
                                  <Keyboard className="w-3 h-3" />
                                </button>
                                {/* Delete */}
                                <button
                                  onClick={() => onDelete(item.id)}
                                  className="p-1 rounded hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              {/* Always-visible pin indicator */}
                              {item.pinned && <Pin className="w-3 h-3 text-blue-400 group-hover:hidden shrink-0" />}
                            </div>

                            {/* Text body or edit textarea */}
                            {isEditing ? (
                              <div className="flex flex-col gap-2">
                                <textarea
                                  autoFocus
                                  value={editText}
                                  onChange={e => setEditText(e.target.value)}
                                  className="w-full bg-black/40 border border-amber-500/50 rounded px-2 py-2 text-xs text-white focus:outline-none resize-none min-h-[80px]"
                                  rows={4}
                                />
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={commitEdit}
                                    className="flex items-center gap-1 px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs rounded transition-colors"
                                  >
                                    <Check className="w-3 h-3" /> Save
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 text-white/50 text-xs rounded transition-colors"
                                  >
                                    <X className="w-3 h-3" /> Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={() => handleTextClick(item.text, item.id)}
                                className={`text-xs text-white/75 whitespace-pre-wrap cursor-pointer hover:text-white/95 transition-colors select-none ${!isExpanded && isLong ? "line-clamp-3" : ""}`}
                                style={{ wordBreak: "break-word" }}
                                title="Click to paste"
                              >
                                {item.text}
                              </div>
                            )}

                            {isLong && !isEditing && (
                              <button
                                onClick={() => toggleExpand(item.id)}
                                className="mt-2 text-[10px] text-white/30 hover:text-white/70 flex items-center gap-1 transition-colors"
                              >
                                {isExpanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Expand</>}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
