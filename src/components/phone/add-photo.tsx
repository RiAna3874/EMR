"use client";

import { useRouter } from "next/navigation";
import { AddMedia } from "@/components/media/add-media";

// The Media tab's add panel on the phone: the camera opens straight away from "Take photo",
// and once filed the new photo opens on the phone's Media screen.
export function PhoneAddPhoto({ patientId }: { patientId: string }) {
  const router = useRouter();
  const base = `/m/patients/${patientId}/media`;
  return (
    <div className="px-2 pt-3">
      <AddMedia patientId={patientId} onClose={() => router.push(base)} savedHref={(first) => `${base}/${first}`} />
    </div>
  );
}
