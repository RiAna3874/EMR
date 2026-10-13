"use client";

import { useEffect } from "react";
import { markRead } from "@/app/messages/actions";

// Moves the user's read marker up to the newest message while the conversation
// is actually on screen, so "Read by" means someone saw it.
export function MarkRead({ conversationId, upTo, unread }: { conversationId: string; upTo: string; unread: boolean }) {
  useEffect(() => {
    if (!unread) return;
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      // The action revalidates, which refreshes the list and the top-bar badge.
      void markRead(conversationId, upTo);
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [conversationId, upTo, unread]);
  return null;
}
