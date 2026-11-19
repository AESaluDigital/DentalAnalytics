"use client";

export default function PrintButton({ label = "Exportar PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
