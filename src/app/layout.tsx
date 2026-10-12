import type { Metadata } from "next";
import { TopBar } from "@/components/top-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian EMR",
  description: "Outpatient electronic medical record (synthetic data only)",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex h-screen flex-col antialiased">
        <TopBar />
        <div className="min-h-0 flex-1">{children}</div>
      </body>
    </html>
  );
}
