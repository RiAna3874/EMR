"use client";

import { useEffect } from "react";

// Opens a conversation at its newest message, and follows new ones as they arrive.
export function ScrollToBottom({ lastId }: { lastId: string }) {
  useEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight });
  }, [lastId]);
  return null;
}
