/** Dinheiro sempre em centavos inteiros. Nunca usa ponto flutuante para valores armazenados. */

/** Converte "12,50", "R$ 1.234,5", "10" em centavos. Retorna null se inválido. */
export function parseBRLToCents(input: string): number | null {
  const s = input.replace(/R\$|\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
  const [intPart, frac = ""] = s.replace(/\./g, "").split(",");
  const cents = Number(intPart) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}R$ ${reais},${String(abs % 100).padStart(2, "0")}`;
}

export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}
