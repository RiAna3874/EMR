// The phone view (/m), like Epic Haiku: shared by the middleware, the root layout and the /m pages.

// Set by the middleware on /m requests so the root layout leaves out the desktop top bar.
export const PHONE_VIEW_HEADER = "x-meridian-phone";
// "desktop" when someone on a phone chose the full site (/view/full-site); /view/phone clears it.
export const VIEW_COOKIE = "meridian_view";

export const isPhonePath = (p: string) => p === "/m" || p.startsWith("/m/");

// Phones, not tablets: an iPad or Android tablet gets the full site.
export const isPhone = (userAgent: string) => /iPhone|iPod|Android.*Mobile|Mobile.*Firefox|Windows Phone|Opera Mini/i.test(userAgent);
