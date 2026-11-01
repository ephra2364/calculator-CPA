import { analyze, deadzone, diagnose, rankProduct, type Analysis, type DeadzoneResult, type Diagnosis, type Rank, type Status } from './engine';
import type { Period, Product } from './types';
import type { Tone } from '@/components/ui';

export const STATUS_TONE: Record<Status, Tone> = { vert: 'green', orange: 'orange', rouge: 'red', gris: 'gray' };
export const STATUS_LABEL: Record<Status, string> = { vert: 'Produit sain', orange: 'En observation', rouge: 'Deadzone probable', gris: 'Données insuffisantes' };
export const RANK_LABEL: Record<Rank, string> = {
  meilleurs: 'Meilleurs produits', surveiller: 'Produits à surveiller', optimiser: 'Produits à optimiser', deficitaires: 'Produits déficitaires', incomplets: 'Données incomplètes'
};
export const RANK_TONE: Record<Rank, Tone> = { meilleurs: 'green', surveiller: 'orange', optimiser: 'blue', deficitaires: 'red', incomplets: 'gray' };

export interface ProductSummary { product: Product; analysis: Analysis; dz: DeadzoneResult; diag: Diagnosis; rank: Rank }
export function summarize(p: Product, periods: Period[]): ProductSummary {
  const analysis = analyze(p, periods);
  const dz = deadzone(p, periods, 7);
  const diag = diagnose(analysis, dz);
  return { product: p, analysis, dz, diag, rank: rankProduct(analysis, dz) };
}
export function profitTone(x: number | null | undefined): Tone {
  if (x == null) return 'gray';
  return x >= 0 ? 'green' : 'red';
}
