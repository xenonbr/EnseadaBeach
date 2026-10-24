"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="h-11 rounded-lg bg-[#0047FF] px-4 font-semibold text-white">
      Imprimir
    </button>
  );
}
