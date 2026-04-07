import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Pin, Copy, Keyboard, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface ClipboardItem {
  id: string;
  text: string;
  pinned: boolean;
  timestamp: number;
}

interface ClipboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
  items: ClipboardItem[];
  onPin: (id: string, currentlyPinned: boolean) => void;
  onDelete: (id: string) => void;
}

export default function ClipboardPanel({ isOpen, onClose, items, onPin, onDelete }: ClipboardPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const filteredItems = useMemo(() => {
    let result = items;
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = items.filter(item => item.text.toLowerCase().includes(lowerQuery));
    }
    // Sort pinned to top, then by timestamp desc
    return result.sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      return b.timestamp - a.timestamp;
    });
  }, [items, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  const handleType = async (text: string) => {
    try {
      if (window.electronAPI.simulateBypassType) {
        // optionally close panel or fade window here
        onClose();
        // Hide the main window to let user focus
        await window.electronAPI.toggleMainWindow?.();
        await window.electronAPI.simulateBypassType(text);
      }
    } catch (e) {
      console.error("Failed to type", e);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-40 bg-black/40 backdrop-blur-sm pointer-events-auto"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute top-0 right-0 bottom-0 w-80 bg-black/80 backdrop-blur-xl border-l border-white/10 z-50 flex flex-col pointer-events-auto"
          >
            <div className="p-4 border-b border-white/10 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white/90">Neural Archive</h2>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1.5 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Search clipboard..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-md py-1.5 pl-8 pr-3 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
            </div>

            <ScrollArea className="flex-1 py-1 px-3">
              <div className="flex flex-col gap-2 pb-4 pt-2">
                {filteredItems.length === 0 ? (
                  <div className="text-center text-white/40 text-xs py-8">
                    No matching snippets found.
                  </div>
                ) : (
                  filteredItems.map(item => {
                    const isExpanded = expandedItems.has(item.id);
                    const isLongText = item.text.length > 100 || item.text.includes('\n');
                    
                    return (
                      <div key={item.id} className="group bg-white/5 border border-white/10 hover:border-white/20 rounded-lg overflow-hidden transition-colors">
                        <div className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-[10px] text-white/30 truncate mr-2">
                              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => onPin(item.id, item.pinned)}
                                className={`p-1 rounded hover:bg-white/10 transition-colors ${item.pinned ? 'text-blue-400' : 'text-white/40 hover:text-white'}`}
                                title={item.pinned ? "Unpin" : "Pin snippet"}
                              >
                                <Pin className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={() => handleCopy(item.text)}
                                className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                title="Copy back to clipboard"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={() => handleType(item.text)}
                                className="p-1 rounded hover:bg-emerald-500/20 text-white/40 hover:text-emerald-400 transition-colors"
                                title="Type (Bypass paste protection)"
                              >
                                <Keyboard className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={() => onDelete(item.id)}
                                className="p-1 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                                title="Delete from archive"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            {/* Always show pin if pinned regardless of hover */}
                            {item.pinned && <Pin className="w-3 h-3 text-blue-400 group-hover:hidden" />}
                          </div>
                          <div className={`text-xs text-white/80 whitespace-pre-wrap ${!isExpanded && isLongText ? 'line-clamp-3' : ''}`} style={{ wordBreak: 'break-word' }}>
                            {item.text}
                          </div>
                          {isLongText && (
                            <button 
                              onClick={() => toggleExpand(item.id)}
                              className="mt-2 text-[10px] text-white/40 hover:text-white/80 flex items-center gap-1 transition-colors"
                            >
                              {isExpanded ? <><ChevronUp className="w-3 h-3"/> Show less</> : <><ChevronDown className="w-3 h-3"/> Expand</>}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
