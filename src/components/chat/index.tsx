import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { MarkdownSection } from "@/components/shared/MarkdownSection";
import ChaitraLogo from "../../../assets/icons/phantomlens_logo.svg";
import SettingsPanel from "./SettingsPanel";
import HistoryPanel from "./HistoryPanel";
import ClipboardPanel from "./ClipboardPanel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings, Info, MessageSquarePlus, History, Trash2, Clipboard } from "lucide-react";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatProps {
  setView: (view: "initial" | "response" | "followup") => void;
}

export default function Chat({ setView }: ChatProps) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [transparencyMode, setTransparencyMode] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isClipboardOpen, setIsClipboardOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>(`session-${Date.now()}`);
  const [history, setHistory] = useState<any[]>([]);
  const [clipboardHistory, setClipboardHistory] = useState<any[]>([]);
  
  // Track listener registration
  const listenersRef = useRef({
    chunk: false,
    complete: false,
    error: false,
    apiKey: false,
  });
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    return () => {};
  }, []);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const storedHistory = await window.electronAPI.getStoreValue("chat-history");
        if (storedHistory && Array.isArray(storedHistory)) {
          setHistory(storedHistory);
          // Load the latest session if it exists but messages is empty
          if (storedHistory.length > 0 && messages.length === 0) {
            // Option: auto-load latest? Maybe not, keep it fresh.
          }
        }
      } catch (err) {
        console.error("Failed to load history:", err);
      }
    };
    loadHistory();

    const loadClipboard = async () => {
      try {
        const response = await window.electronAPI.getClipboardHistory?.();
        if (response?.success && response.data) {
          setClipboardHistory(response.data);
        }
      } catch (err) {
        console.error("Failed to load clipboard:", err);
      }
    };
    loadClipboard();

    const cleanupClipboard = window.electronAPI.onClipboardUpdate?.((data: any[]) => {
      setClipboardHistory(data);
    });

    return () => {
      cleanupClipboard?.();
    };
  }, []);

  // Save current session to history whenever messages change
  useEffect(() => {
    if (messages.length === 0) return;

    const saveToHistory = async () => {
      const firstMessage = messages.find(m => m.role === 'user')?.content || "Untitled Chat";
      const title = firstMessage.length > 30 ? firstMessage.substring(0, 30) + "..." : firstMessage;
      
      const sessionData = {
        id: sessionId,
        title,
        messages,
        lastUpdated: Date.now()
      };

      setHistory(prev => {
        const index = prev.findIndex(s => s.id === sessionId);
        let newHistory;
        if (index >= 0) {
          newHistory = [...prev];
          newHistory[index] = sessionData;
        } else {
          newHistory = [sessionData, ...prev];
        }
        
        // Persist to store (limit to 20 sessions for performance)
        const trimmedHistory = newHistory.slice(0, 20);
        window.electronAPI.setStoreValue("chat-history", trimmedHistory);
        return trimmedHistory;
      });
    };

    const timer = setTimeout(saveToHistory, 2000); // Debounced save
    return () => clearTimeout(timer);
  }, [messages, sessionId]);

  // Handle streaming responses
  useEffect(() => {
    const handleResponseChunk = (data: { response: string }) => {
      // console.log('🔵 [CHUNK-FIRED] Response chunk received:', { length: data.response.length, preview: data.response.substring(0, 50) });
      setMessages((prev) => {
        // console.log('🔵 [CHUNK-STATE] Current messages count:', prev.length);
        const lastMessage = prev[prev.length - 1];
        // console.log('🔵 [CHUNK-STATE] Last message:', { role: lastMessage?.role, id: lastMessage?.id });
        if (lastMessage?.role === 'assistant') {
          const updated = [
            ...prev.slice(0, -1),
            {
              ...lastMessage,
              content: data.response,
            },
          ];
          // console.log('🔵 [CHUNK-STATE] ✅ Updating assistant message with content length:', data.response.length);
          return updated;
        }
        // console.log('🔵 [CHUNK-STATE] ❌ Last message is NOT assistant, skipping update');
        return prev;
      });
      scrollToBottom();
    };

    // console.log('🟢 [LISTENER] Registering onResponseChunk listener');
    const cleanup = window.electronAPI.onResponseChunk?.(handleResponseChunk);
    listenersRef.current.chunk = true;
    // console.log('🟢 [LISTENER] onResponseChunk listener registered:', typeof cleanup);
    
    return () => {
      // console.log('🟡 [CLEANUP] Removing onResponseChunk listener');
      listenersRef.current.chunk = false;
      cleanup?.();
    };
  }, []);

  // Handle response completion
  useEffect(() => {
    // console.log('🟢 [LISTENER] Registering onResponseComplete listener');
    const cleanup = window.electronAPI.onResponseComplete?.(() => {
      // console.log('🟡 [COMPLETE-FIRED] Response complete event received - SETTING isLoading = false');
      listenersRef.current.complete = true;
      setIsLoading(false);
      setTimeout(() => scrollToBottom(), 100);
    });
    listenersRef.current.complete = true;
    // console.log('🟢 [LISTENER] onResponseComplete listener registered:', typeof cleanup);
    
    return () => {
      // console.log('🟡 [CLEANUP] Removing onResponseComplete listener');
      listenersRef.current.complete = false;
      cleanup?.();
    };
  }, []);

  // Handle errors
  useEffect(() => {
    // console.log('🟢 [LISTENER] Registering onResponseError listener');
    const cleanup = window.electronAPI.onResponseError?.((errorMsg: string) => {
      // console.error('🔴 [ERROR-FIRED] Response error received:', errorMsg);
      setError(errorMsg);
      setIsLoading(false);
      // Remove trailing empty assistant message if present
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    });
    listenersRef.current.error = true;
    
    return () => {
      // console.log('🟡 [CLEANUP] Removing onResponseError listener');
      listenersRef.current.error = false;
      cleanup?.();
    };
  }, []);

  // Handle API key missing prompt
  useEffect(() => {
    // console.log('🟢 [LISTENER] Registering onApiKeyMissing listener');
    const cleanup = window.electronAPI.onApiKeyMissing?.(() => {
      // console.log('🟡 [APIKEY-FIRED] API key missing - showing settings prompt');
      setShowApiKeyPrompt(true);
    });
    listenersRef.current.apiKey = true;
    
    return () => {
      // console.log('🟡 [CLEANUP] Removing onApiKeyMissing listener');
      listenersRef.current.apiKey = false;
      cleanup?.();
    };
  }, []);

  // Handle IPC Settings event
  useEffect(() => {
    const cleanup = window.electronAPI.onOpenSettings?.(() => {
      setIsSettingsOpen(prev => !prev);
    });
    
    // Transparency handle
    const cleanupTrans = window.electronAPI.onToggleTransparency?.(() => {
      setTransparencyMode(prev => !prev);
    });

    // Alt+Shift+V: open clipboard panel directly from any screen
    const cleanupClipboardInvoke = window.electronAPI.onInvokeClipboard?.(() => {
      setIsSettingsOpen(false);
      setIsHistoryOpen(false);
      setIsClipboardOpen(true);
    });

    return () => {
      cleanup?.();
      cleanupTrans?.();
      cleanupClipboardInvoke?.();
    };
  }, []);

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) {
      // console.log('⚠️ Send blocked - input empty or already loading');
      return;
    }

    // console.log('📤 [SEND] Starting send message flow');
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue,
      timestamp: Date.now(),
    };

    // console.log('📤 [SEND] Adding user message:', userMessage);
    setMessages((prev) => {
      const updated = [...prev, userMessage];
      // console.log('📤 [SEND] Messages count after user message:', updated.length);
      return updated;
    });
    setInputValue("");
    setIsLoading(true);
    setError(null);
    // console.log('📤 [SEND] Set isLoading = true');

    try {
      // console.log('📤 [SEND] Calling sendChatMessage:', userMessage.content);
      const result = await window.electronAPI.sendChatMessage?.(userMessage.content);
      // console.log('📤 [SEND] sendChatMessage returned:', result);
      
      if (result?.success) {
        // Add empty assistant message for streaming
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        };
        // console.log('📤 [SEND] Adding empty assistant message:', assistantMessage);
        setMessages((prev) => {
          const updated = [...prev, assistantMessage];
          // console.log('📤 [SEND] Messages count after assistant message:', updated.length);
          return updated;
        });
        // console.log('📤 [SEND] Empty assistant message added, waiting for stream...');
      } else {
        // console.error('📤 [SEND] Send failed:', result?.error);
        setError(result?.error || 'Failed to send message');
        setIsLoading(false);
      }
    } catch (err) {
      // console.error('📤 [SEND] Exception:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLoading(false);
    }
  }, [inputValue, isLoading]);

  const saveApiKey = useCallback(async () => {
    if (!apiKeyInput.trim()) {
      setError("API key cannot be empty");
      return;
    }

    try {
      const result = await window.electronAPI.setApiConfig?.({
        apiKey: apiKeyInput,
        model: "gemini-2.5-flash",
      });
      if (result?.success) {
        setApiKeyInput("");
        setShowApiKeyPrompt(false);
        setError(null);
      } else {
        setError(result?.error || 'Failed to save API key');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key');
    }
  }, [apiKeyInput]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = useCallback(() => {
    if (messages.length > 0) {
      setMessages([]);
      setSessionId(`session-${Date.now()}`);
      setError(null);
    }
  }, [messages]);

  const loadSession = useCallback((session: any) => {
    setSessionId(session.id);
    setMessages(session.messages);
    setIsHistoryOpen(false);
    setError(null);
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    setHistory(prev => {
      const newHistory = prev.filter(s => s.id !== id);
      window.electronAPI.setStoreValue("chat-history", newHistory);
      return newHistory;
    });
    // If deleted current session, start new one
    if (id === sessionId) {
      setMessages([]);
      setSessionId(`session-${Date.now()}`);
    }
  }, [sessionId]);

  const handlePinClipboardItem = async (id: string, currentlyPinned: boolean) => {
    try {
      const newHistory = clipboardHistory.map(item => 
        item.id === id ? { ...item, pinned: !currentlyPinned } : item
      );
      setClipboardHistory(newHistory);
      await window.electronAPI.setStoreValue?.("clipboard-history", newHistory);
    } catch (err) {
      console.error("Failed to pin clipboard item", err);
    }
  };

  const handleDeleteClipboardItem = async (id: string) => {
    try {
      const response = await window.electronAPI.deleteClipboardItem?.(id);
      if (response?.success) {
        setClipboardHistory(prev => prev.filter(item => item.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete clipboard item", err);
    }
  };

  return (
    <div className={`relative flex flex-col h-screen bg-transparent transition-all duration-700 ${transparencyMode ? 'opacity-30' : 'opacity-100'} overflow-hidden`}>
      {/* Compact Shortcuts Bar */}
      <div className="relative z-20 border-b border-white/5 bg-black/10 backdrop-blur-2xl px-4 py-1 pointer-events-auto">
        <div className="flex items-center gap-2">
          {/* Action Buttons */}
          <div className="flex items-center gap-0.5 group">
            <button
              onClick={startNewChat}
              className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-white/30 hover:text-emerald-400/80 transition-all"
              title="New Chat"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="p-1.5 rounded-lg hover:bg-blue-500/10 text-white/30 hover:text-blue-400/80 transition-all"
              title="Chat History"
            >
              <History className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsClipboardOpen(true)}
              className="p-1.5 rounded-lg hover:bg-purple-500/10 text-white/30 hover:text-purple-400/80 transition-all font-semibold"
              title="Neural Archive (Clipboard)"
            >
              <Clipboard className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white transition-all transform hover:rotate-90 duration-500"
              title="Settings (Ctrl + ,)"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Horizontal Scrollable Shortcuts - Hidden as requested */}
          {/* <div className="flex-1 overflow-x-auto no-scrollbar py-0.5">
            <div className="flex items-center gap-1.5">
              {[
                { keys: 'Ctrl+\\', label: 'Window' },
                { keys: 'C+S+S', label: 'Capture' },
                { keys: 'Ctrl+,', label: 'Settings' },
                { keys: 'Ctrl+R', label: 'Reset' },
                { keys: 'Alt+↑↓', label: 'Scroll' },
                { keys: 'C+Arrows', label: 'Move' },
                { keys: 'C+S+V', label: 'Glass' },
                { keys: 'C+S+[/]', label: 'Opacity' },
              ].map((s, i) => (
                <div 
                  key={i}
                  className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10"
                >
                  <span className="text-[9px] font-mono text-white/50 leading-tight">{s.keys}</span>
                  <span className="text-[10px] font-medium text-white/80 leading-tight">{s.label}</span>
                </div>
              ))}
            </div>
          </div> */}
        </div>
        
      </div>
      {/* Chat History */}
      <ScrollArea className="flex-1 px-4 py-4 min-h-0">

        
        <div className="space-y-4 pr-4">
          {messages.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-64 space-y-4"
            >
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white/90 mb-2">Welcome to Chaitra Chat</h2>
                <p className="text-sm text-white/90">Start typing to chat with the AI</p>
              </div>
            </motion.div>
          )}

          <AnimatePresence mode="popLayout">
            {messages.map((message, index) => {
              // console.log(`🎨 [RENDER] Message ${index}:`, { role: message.role, contentLength: message.content.length });
              return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-white/5 text-white/90 rounded-br-none border border-white/15'
                      : 'bg-white/5 text-white/90 rounded-bl-none border border-white/15'
                  }`}
                  style={{
                    wordBreak: 'break-word',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                  }}
                >
                  {message.role === 'assistant' ? (
                    <>
                      {message.content ? (
                        <MarkdownSection 
                          content={message.content} 
                          isLoading={isLoading && message.id === messages[messages.length - 1]?.id}
                        />
                      ) : (
                        <div className="text-sm text-white/50 animate-pulse">
                          Waiting for response...
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </motion.div>
              );
            })}
          </AnimatePresence>

          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-white/10 text-white/90 px-4 py-3 rounded-lg rounded-bl-none border border-white/20">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg text-sm"
            >
              {error}
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* API Key Missing Prompt */}
      {showApiKeyPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg m-4"
        >
          <div className="bg-slate-900 border border-white/20 rounded-lg p-6 max-w-sm space-y-4">
            <h2 className="text-lg font-semibold text-white">Gemini API Key Required</h2>
            <p className="text-sm text-white/70">
              Enter your Gemini API key to start chatting. Get one from{' '}
              <a
                href="https://makersuite.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Google AI Studio
              </a>
            </p>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveApiKey();
              }}
              className="w-full bg-white/5 border border-white/20 text-white px-3 py-2 rounded focus:outline-none focus:border-white/40 focus:bg-white/10 text-sm"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <Button
                onClick={saveApiKey}
                disabled={!apiKeyInput.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save & Continue
              </Button>
              <Button
                onClick={() => {
                  setShowApiKeyPrompt(false);
                  setApiKeyInput("");
                }}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white"
              >
                Cancel
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Input Area */}
      <div className="border-t border-white/10 bg-black/20 px-4 py-4 space-y-3">
        <div className="flex gap-3">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Shift+Enter for new line)"
            disabled={isLoading || showApiKeyPrompt}
            className="flex-1 resize-none bg-white/5 border border-white/20 text-white px-3 py-2 rounded max-h-24 focus:outline-none focus:border-white/40"
            rows={3}
            style={{
              WebkitAppearance: 'none',
              appearance: 'none',
              userSelect: 'text',
              WebkitUserSelect: 'text'
            } as React.CSSProperties}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !inputValue.trim() || showApiKeyPrompt}
            className="flex items-center justify-center px-3 py-2 text-white/60 hover:text-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Send (Enter)"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </button>
        </div>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg text-xs flex items-center justify-between gap-2"
          >
            <span>API Error: Unable to process message. Please try again.</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(error);
              }}
              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs whitespace-nowrap"
            >
              Copy Error
            </button>
          </motion.div>
        )}
      </div>

      {/* Settings Overlay */}
      <SettingsPanel 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />

      {/* History Overlay */}
      <HistoryPanel
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessions={history}
        currentSessionId={sessionId}
        onSelect={loadSession}
        onDelete={deleteSession}
      />

      {/* Clipboard Archive Overlay */}
      <ClipboardPanel
        isOpen={isClipboardOpen}
        onClose={() => setIsClipboardOpen(false)}
        items={clipboardHistory}
        onPin={handlePinClipboardItem}
        onDelete={handleDeleteClipboardItem}
      />
    </div>
  );
}
