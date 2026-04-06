import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Chat from "@/components/chat";
import { memo } from "react";
import { useQueryClient } from "@tanstack/react-query";

const MemoizedChat = memo(Chat);

// Chat window dimensions
const CHAT_DIMENSIONS = { width: 832, height: 660 };

function useDimensionUpdates() {
  useEffect(() => {
    console.log("[Dimensions] Applying chat dimensions:", CHAT_DIMENSIONS);
    window.electronAPI?.updateContentDimensions(CHAT_DIMENSIONS);
  }, []);
}

const containerVariants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.1,
    },
  },
};

export default function Main() {
  const queryClient = useQueryClient();
  const [isTransparent, setIsTransparent] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Apply chat dimensions on mount
  useDimensionUpdates();

  // Dummy setView function for compatibility (not used in chat mode)
  const setViewWithTransition = useCallback((_newView: "initial" | "response" | "followup") => {
    // No-op for chat mode
  }, []);

  // Handle transparency toggle
  useEffect(() => {
    const cleanup = window.electronAPI?.onToggleTransparency?.(() => {
      setIsTransparent((prev) => !prev);
    });
    return () => {
      cleanup?.();
    };
  }, []);

  // Apply transparency class to body
  useEffect(() => {
    const body = document.body;
    if (isTransparent) {
      body.classList.add("transparent-mode");
    } else {
      body.classList.remove("transparent-mode");
    }
  }, [isTransparent]);

  return (
    <motion.div
      ref={containerRef}
      className="h-screen w-screen overflow-hidden relative"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <MemoizedChat setView={setViewWithTransition} />
    </motion.div>
  );
}