import { SkeletonRows } from "@/components/phone/skeleton";

// A chart section loading under the patient's name and tabs, which stay put.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <SkeletonRows rows={7} />
    </div>
  );
}
