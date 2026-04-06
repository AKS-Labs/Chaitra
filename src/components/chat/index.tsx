import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { MarkdownSection } from "@/components/shared/MarkdownSection";
import Commands from "@/components/Commands";
import ChaitraLogo from "../../../assets/icons/phantomlens_logo.svg";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const [expandedShortcuts, setExpandedShortcuts] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Handle streaming responses
  useEffect(() => {
    const handleResponseChunk = (data: { response: string }) => {
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === 'assistant') {
          return [
            ...prev.slice(0, -1),
            {
              ...lastMessage,
              content: lastMessage.content + data.response,
            },
          ];
        }
        return prev;
      });
      scrollToBottom();
    };

    const cleanup = window.electronAPI.onResponseChunk?.(handleResponseChunk);
    return cleanup;
  }, [scrollToBottom]);

  // Handle response completion
  useEffect(() => {
    const cleanup = window.electronAPI.onResponseComplete?.(() => {
      setIsLoading(false);
      scrollToBottom();
    });
    return cleanup;
  }, [scrollToBottom]);

  // Handle errors
  useEffect(() => {
    const cleanup = window.electronAPI.onResponseError?.((errorMsg: string) => {
      setError(errorMsg);
      setIsLoading(false);
    });
    return cleanup;
  }, []);

  // Handle API key missing prompt
  useEffect(() => {
    const cleanup = window.electronAPI.onApiKeyMissing?.(() => {
      setShowApiKeyPrompt(true);
      console.log("API key missing - showing settings prompt");
    });
    return cleanup;
  }, []);

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.sendChatMessage?.(userMessage.content);
      if (result?.success) {
        // Add empty assistant message for streaming
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        setError(result?.error || 'Failed to send message');
        setIsLoading(false);
      }
    } catch (err) {
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
        model: "gemini-2.0-flash",
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

  return (
    <div className="relative flex flex-col h-screen bg-transparent overflow-hidden" onClick={() => {
      window.electronAPI.setInteractiveMouseEvents?.().catch(() => {});
    }}>
      {/* Compact Shortcuts Bar with Expand Button */}
      <div className="relative z-20 border-b border-white/10 bg-black/30 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/60">
            Ctrl+\ (Toggle) • Ctrl+Shift+S (Capture) • Ctrl+, (Settings)
          </div>
          <button
            onClick={() => setExpandedShortcuts(!expandedShortcuts)}
            className="ml-2 px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded text-white transition-colors"
          >
            {expandedShortcuts ? '▼ Hide' : '▶ More'}
          </button>
        </div>
        
        {/* Expanded Commands Bar */}
        <AnimatePresence>
          {expandedShortcuts && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 pt-2 border-t border-white/10"
            >
              <Commands view="initial" isMinimal={true} />
            </motion.div>
          )}
        </AnimatePresence>
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
              <img
                src={ChaitraLogo}
                alt="Chaitra Logo"
                className="w-16 h-16 opacity-60"
              />
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white/80 mb-2">Welcome to Chaitra Chat</h2>
                <p className="text-sm text-white/50">Start typing to chat with the AI</p>
              </div>
            </motion.div>
          )}

          <AnimatePresence mode="popLayout">
            {messages.map((message, index) => (
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
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-white/10 text-white/90 rounded-bl-none border border-white/20'
                  }`}
                  style={{
                    wordBreak: 'break-word',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                  }}
                >
                  {message.role === 'assistant' ? (
                    <MarkdownSection content={message.content} />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </motion.div>
            ))}
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
            onFocus={() => window.electronAPI.setInteractiveMouseEvents?.().catch(() => {})}
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
          <Button
            onClick={sendMessage}
            disabled={isLoading || !inputValue.trim() || showApiKeyPrompt}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 h-fit"
          >
            Send
          </Button>
        </div>
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-red-400"
          >
            {error}
          </motion.p>
        )}
      </div>
    </div>
  );
}
