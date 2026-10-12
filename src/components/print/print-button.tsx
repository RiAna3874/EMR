"use client";

import { Button } from "@/components/form";

export function PrintButton() {
  return (
    <Button className="ml-auto" onClick={() => window.print()}>
      Print
    </Button>
  );
}
