import type { CSSProperties } from "react";

// The product's name, logo and accent color, from the environment so a clinic can
// rebrand without a code change. Unset, it's "Meridian EMR" with the teal mark.

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const shortName = process.env.MERIDIAN_APP_NAME?.trim() || "Meridian";

export const brand = {
  // In the top bar and on the sign-in page, e.g. "Meridian".
  shortName,
  // In browser tabs, the authenticator app and printouts, e.g. "Meridian EMR".
  fullName: process.env.MERIDIAN_APP_FULL_NAME?.trim() || (process.env.MERIDIAN_APP_NAME ? shortName : "Meridian EMR"),
  // An https:// image (PNG or SVG, square works best). Also used as the browser tab icon.
  logoUrl: /^https:\/\//.test(process.env.MERIDIAN_LOGO_URL ?? "") ? process.env.MERIDIAN_LOGO_URL! : null,
  // Buttons, links and highlights. Must be a hex color such as #0f8a8a; anything else is ignored.
  accent: HEX.test(process.env.MERIDIAN_ACCENT_COLOR ?? "") ? process.env.MERIDIAN_ACCENT_COLOR! : null,
};

// CSS variables for <html style>, overriding the defaults in globals.css.
export function brandStyle(): CSSProperties | undefined {
  if (!brand.accent) return undefined;
  return { "--accent": brand.accent, "--accent-soft": `color-mix(in srgb, ${brand.accent} 12%, white)` } as CSSProperties;
}
