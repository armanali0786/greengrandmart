/**
 * All money is stored and computed as integer paise (₹1 = 100 paise) — see
 * AGENTS.md §4 "Money: always integers in paise." These helpers are the only
 * place a rupee/paise conversion or ₹ display format happens; nothing else
 * should call `.toFixed()`, `parseFloat()`, or divide by 100 inline.
 */

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function toRupeeDisplay(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}
