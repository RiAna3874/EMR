import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

// Lets a phone install the phone view (/m) to its home screen. No service worker and no
// offline copy: patient data is never stored on the phone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.fullName,
    short_name: brand.shortName,
    description: "Clinic schedule, patient charts, results and secure chat on the phone",
    id: "/m",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f6f8",
    theme_color: "#12303f",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
