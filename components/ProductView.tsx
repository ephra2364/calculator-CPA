'use client';
import { useMemo, useState } from 'react';
import type { Store } from '@/lib/store';
import type { Product } from '@/lib/types';
import { analyze, deadzone, diagnose } from '@/lib/engine';
import { addDays, todayIso } from '@/lib/format';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/view';
import { Button, Pill, Segmented, TextField } from './ui';
import { ProductForm } from './ProductForm';
import { HistoryView } from './HistoryView';
import { SummaryView, CpaView, ProfitView, DeliveryView, MarginView } from './Modules';
import { DeadzoneView } from './DeadzoneView';
import { OptimizerView, ScalingView } from './Simulators';
import { QuickView } from './QuickView';

export type Tab = 'rapide' | 'resume' | 'infos' | 'resultats' | 'cpa' | 'rentabilite' | 'livraison' | 'marge' | 'deadzone' | 'optimisation' | 'scaling';
const TABS: [Tab, string][] = [
  ['rapide', 'Rentabilité'], ['resume', 'Diagnostic'], ['infos', 'Produit & coûts'], ['resultats', 'Résultats & historique'], ['cpa', 'CPA Calculator'],
  ['rentabilite', 'Profit Analyzer'], ['livraison', 'Livraison'], ['marge', 'Marge'], ['deadzone', 'Deadzone'],
  ['optimisation', 'Optimisation'], ['scaling', 'Scaling']
];
type Range = 'all' | '30' | '7' | 'custom';

export function ProductView({ store, product, tab, setTab, back }: { store: Store; product: Product; tab: Tab; setTab: (t: Tab) => void; back: () => void }) {
  const periods = store.data.periods;
  const [range, setRange] = useState<Range>('all');
  const [cStart, setCStart] = useState(addDays(todayIso(), -29));
  const [cEnd, setCEnd] = useState(todayIso());
  const window = range === 'all' ? undefined
    : range === 'custom' ? (cStart && cEnd && cStart <= cEnd ? { start: cStart, end: cEnd } : undefined)
    : { start: addDays(todayIso(), -(Number(range) - 1)), end: todayIso() };
  const analysis = useMemo(() => analyze(product, periods, window), [product, periods, window?.start, window?.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const dz = useMemo(() => deadzone(product, periods, 7), [product, periods]);
  const diag = useMemo(() => diagnose(analysis, dz), [analysis, dz]);
  const count = periods.filter((p) => p.productId === product.id).length;
  const showRange = !['rapide', 'infos', 'resultats', 'deadzone'].includes(tab);
  const advanced = tab !== 'rapide';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={back} className="text-sm text-slate-500 hover:text-slate-800">← Mes produits</button>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight">{product.name || 'Sans nom'}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            {advanced && <Pill tone={STATUS_TONE[dz.status]}>{STATUS_LABEL[dz.status]}</Pill>}
            <span>{count} période{count > 1 ? 's' : ''} saisie{count > 1 ? 's' : ''}</span>
            {product.isExample && <Pill tone="blue">Exemple</Pill>}
          </div>
        </div>
        <Button small variant="danger" onClick={() => { if (confirm(`Supprimer « ${product.name} » et toutes ses périodes ?`)) { store.deleteProduct(product.id); back(); } }}>Supprimer</Button>
      </div>

      {advanced && <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
          {TABS.map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${tab === t ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</button>
          ))}
        </div>
      </div>}

      {showRange && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
          <div className="min-w-[260px] flex-1">
            <Segmented label="Période analysée" value={range} onChange={setRange} options={[['all', 'Tout'], ['30', '30 jours'], ['7', '7 jours'], ['custom', 'Dates']]} />
          </div>
          {range === 'custom' && (
            <div className="grid flex-1 grid-cols-2 gap-2">
              <TextField label="Du" type="date" value={cStart} onChange={setCStart} />
              <TextField label="Au" type="date" value={cEnd} onChange={setCEnd} />
            </div>
          )}
        </div>
      )}

      {tab === 'rapide' && <QuickView store={store} product={product} openDetails={() => setTab('resume')} />}
      {tab === 'resume' && <SummaryView a={analysis} dz={dz} diag={diag} setTab={setTab} />}
      {tab === 'infos' && <ProductForm product={product} onChange={store.upsertProduct} periodsCount={count} goResults={() => setTab('resultats')} />}
      {tab === 'resultats' && <HistoryView store={store} product={product} />}
      {tab === 'cpa' && <CpaView a={analysis} store={store} />}
      {tab === 'rentabilite' && <ProfitView a={analysis} />}
      {tab === 'livraison' && <DeliveryView a={analysis} />}
      {tab === 'marge' && <MarginView a={analysis} diag={diag} />}
      {tab === 'deadzone' && <DeadzoneView product={product} periods={periods} />}
      {tab === 'optimisation' && <OptimizerView a={analysis} />}
      {tab === 'scaling' && <ScalingView a={analysis} />}
    </div>
  );
}
