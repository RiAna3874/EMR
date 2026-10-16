import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";

const SIZES = new Set([180, 192, 512]);

// The home-screen icon: the product's first letter on its accent color, full bleed so phones
// can round or mask it. Public, like the manifest (no patient data).
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const letter = brand.shortName.trim().charAt(0).toUpperCase() || "M";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: brand.accent ?? "#0f8a8a",
          color: "white",
          fontSize: size * 0.5,
          fontWeight: 700,
        }}
      >
        {letter}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
