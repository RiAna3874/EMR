"use client";

import type { ChatStatus } from "@prisma/client";
import { useRef } from "react";
import { setChatStatus } from "@/app/messages/actions";
import { inputCls } from "@/components/form";
import { statusDot, statusLabel } from "@/lib/chat/chat";

// The signed-in user's chat status, shown to colleagues next to their name.
export function StatusPicker({ status, note }: { status: ChatStatus; note: string | null }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={setChatStatus} className="flex items-center gap-1.5 text-[12px]">
      <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot[status]}`} aria-hidden />
      <select name="status" defaultValue={status} aria-label="My status" onChange={() => form.current?.requestSubmit()} className={`${inputCls} py-0.5 text-[12px]`}>
        {(Object.keys(statusLabel) as ChatStatus[]).map((s) => (
          <option key={s} value={s}>
            {statusLabel[s]}
          </option>
        ))}
      </select>
      {status !== "available" && (
        <input
          name="note"
          defaultValue={note ?? ""}
          placeholder="Note, e.g. in procedure"
          aria-label="Status note"
          maxLength={60}
          onBlur={(e) => e.target.value !== (note ?? "") && form.current?.requestSubmit()}
          className={`${inputCls} min-w-0 flex-1 py-0.5 text-[12px]`}
        />
      )}
    </form>
  );
}
