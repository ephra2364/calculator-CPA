const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export function money(x: number | null | undefined, cur = 'FCFA'): string {
  if (x == null || !isFinite(x)) return '—';
  return `${nf0.format(Math.round(x))} ${cur}`;
}
export function num(x: number | null | undefined, digits = 0): string {
  if (x == null || !isFinite(x)) return '—';
  return (digits === 0 ? nf0 : digits === 1 ? nf1 : nf2).format(x);
}
export function percent(x: number | null | undefined, digits = 1): string {
  if (x == null || !isFinite(x)) return '—';
  return `${(digits === 0 ? nf0 : nf1).format(x)} %`;
}
export function signedPct(x: number | null | undefined): string {
  if (x == null || !isFinite(x)) return '—';
  const r = Math.round(x * 10) / 10;
  return `${r > 0 ? '+' : ''}${nf1.format(r)} %`;
}
export function dateFr(s: string): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
/** Lit un nombre saisi (espaces, virgule décimale) ; vide → null. */
export function parseNum(s: string): number | null {
  const t = s.replace(/[\s  ]/g, '').replace(',', '.');
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return t.toISOString().slice(0, 10);
}
