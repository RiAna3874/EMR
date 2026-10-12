import Link from "next/link";

export function Panel({
  title,
  action,
  href,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-line bg-panel ${className}`}>
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
          {href ? (
            <Link href={href} className="hover:text-accent">
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-ink-3">{children}</p>;
}
