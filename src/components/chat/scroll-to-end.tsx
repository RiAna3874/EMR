"use client";

import { useEffect, useRef } from "react";

// A message pane that opens at the newest message and follows new ones,
// unless the user has scrolled up to read history.
export function ScrollToEnd({ lastId, children }: { lastId: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);
  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-3"
    >
      {children}
    </div>
  );
}
