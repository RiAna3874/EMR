import Link from "next/link";
import { DISCLAIMER } from "@/lib/chat/chat";

export default function MessagesHome() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-[15px] font-medium">Pick a conversation, or start a new one.</p>
      <Link href="/messages/new" className="rounded border border-accent bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent/90">
        New message
      </Link>
      <p className="max-w-md text-[12px] text-ink-3">{DISCLAIMER}</p>
    </div>
  );
}
