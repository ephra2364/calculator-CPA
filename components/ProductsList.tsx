'use client';
import { useMemo } from 'react';
import type { Store } from '@/lib/store';
import { summarize, STATUS_LABEL, STATUS_TONE } from '@/lib/view';
import { money } from '@/lib/format';
import { Button, Card, Pill } from './ui';

export function ProductsList({ store, open, newProduct }: { store: Store; open: (id: string) => void; newProduct: () => void }) {
  const { products, periods } = store.data;
  const sums = useMemo(() => products.map((p) => summarize(p, periods)), [products, periods]);
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mes produits</h1>
          <p className="text-sm text-slate-500">{products.length} produit{products.length > 1 ? 's' : ''}</p>
        </div>
        <Button variant="primary" onClick={newProduct}>+ NOUVEAU PRODUIT</Button>
      </div>
      {!products.length && <Card><p className="text-sm text-slate-500">Aucun produit pour l’instant. Crée ton premier produit pour commencer.</p></Card>}
      <div className="grid gap-3 md:grid-cols-2">
        {sums.map((s) => {
          const pr = s.analysis.profit;
          return (
            <button key={s.product.id} onClick={() => open(s.product.id)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{s.product.name || 'Sans nom'}</div>
                  <div className="text-xs text-slate-500">{[s.product.category, s.product.country].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <Pill tone={STATUS_TONE[s.dz.status]}>{STATUS_LABEL[s.dz.status]}</Pill>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><div className="text-xs text-slate-500">Bénéfice</div><div className={`font-semibold ${pr ? (pr.net >= 0 ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-400'}`}>{pr ? money(pr.net, s.product.currency) : '—'}</div></div>
                <div><div className="text-xs text-slate-500">CPA</div><div className="font-semibold">{money(s.analysis.cpa.cpaOrder, s.product.currency)}</div></div>
                <div><div className="text-xs text-slate-500">CPA max</div><div className="font-semibold">{money(s.analysis.breakEven?.perOrder, s.product.currency)}</div></div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
