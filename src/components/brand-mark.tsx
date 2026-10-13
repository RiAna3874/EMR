// The product logo and name, as shown on the dark chrome. Props come from src/lib/brand.ts
// on the server, so this works in client components too.
export function BrandMark({ name, logoUrl, size = 20 }: { name: string; logoUrl: string | null; size?: number }) {
  return (
    <>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" width={size} height={size} className="shrink-0 rounded-sm object-contain" style={{ width: size, height: size }} />
      ) : (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden className="shrink-0">
          <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
          <path d="M10 1.5v17" stroke="#5eead4" strokeWidth="2" />
          <path d="M4 10h3l1.5-3 2.5 6 1.5-3H16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )}
      <span>{name}</span>
    </>
  );
}
