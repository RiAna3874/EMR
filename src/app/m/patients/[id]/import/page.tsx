import { requirePhonePermission } from "@/lib/phone-session";
import { logChartView } from "@/lib/audit/server";
import { UploadForm } from "@/components/import/upload-form";

export const metadata = { title: "Import report" };

// Photograph a lab report or outside letter at the bedside. Claude reads it in the background;
// someone verifies it on a computer before anything is filed, as on the full site.
export default async function PhoneImport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePhonePermission("importReports");
  await logChartView(id, "Import (phone)");
  return (
    <div className="px-4 pt-3">
      <h2 className="text-[17px] font-semibold">Import a report</h2>
      <p className="mb-3 text-[13px] text-ink-3">Tap the box to take a photo of each page, or pick photos or a PDF. Verify it on a computer from Imports to verify.</p>
      <UploadForm patientId={id} phone />
    </div>
  );
}
