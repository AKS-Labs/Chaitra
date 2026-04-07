import { motion, AnimatePresence } from "framer-motion";
import { X, MessageSquare, Trash2, Calendar, Clock, ChevronRight } from "lucide-react";

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: any[];
  currentSessionId: string;
  onSelect: (session: any) => void;
  onDelete: (id: string) => void;
}

export default function HistoryPanel({ 
  isOpen, 
  onClose, 
  sessions, 
  currentSessionId, 
  onSelect, 
  onDelete 
}: HistoryPanelProps) {
  
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
            className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100]"
          />

          {/* History Panel (Slide from Left) */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-80 z-[101] bg-black/20 border-r border-white/10 backdrop-blur-[40px] shadow-2xl flex flex-col pointer-events-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-white/5">
              <div className="flex items-center gap-2">
                <HistoryIcon className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-white/90">Chat History</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto no-scrollbar py-4 px-3 space-y-2">
              {sessions.length === 0 ? (
                <div className="text-center py-10 opacity-30">
                  <MessageSquare className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm text-white">No history yet</p>
                </div>
              ) : (
                sessions.sort((a,b) => b.lastUpdated - a.lastUpdated).map((session) => (
                  <div
                    key={session.id}
                    className={`group relative flex flex-col p-4 rounded-2xl border transition-all cursor-pointer ${
                      session.id === currentSessionId
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
                    }`}
                    onClick={() => onSelect(session)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-medium text-white/90 truncate flex-1">
                        {session.title}
                      </h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(session.id);
                        }}
                        className="p-1 rounded-md hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                        title="Delete Session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-3 text-[10px] text-white/40">
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDate(session.lastUpdated)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-2.5 h-2.5" />
                        {session.messages.length} messages
                      </span>
                    </div>

                    {session.id === currentSessionId && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full" />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/5 bg-white/5">
              <p className="text-[10px] text-white/30 text-center">
                Last 20 sessions are saved locally.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className}
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
      <path d="M3 3v5h5"/>
      <path d="M12 7v5l4 2"/>
    </svg>
  );
}
