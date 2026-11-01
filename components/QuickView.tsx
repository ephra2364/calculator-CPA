'use client';
import { useMemo, useState } from 'react';
import type { Store } from '@/lib/store';
import type { Num, Period, Product } from '@/lib/types';
import { unitCost } from '@/lib/engine';
import { emptyPeriod } from '@/lib/factory';
import { quick, evolution, finalVerdict, type Quick, type Verdict } from '@/lib/quick';
import { dateFr, money, percent, signedPct, todayIso } from '@/lib/format';
import { Banner, Button, Card, NumField, Segmented, TextField } from './ui';

const V: Record<Verdict, { label: string; cls: string; icon: string }> = {
  scaler: { label: 'Rentable — tu peux scaler', cls: 'bg-emerald-600 text-white', icon: '🟢' },
  maintenir: { label: 'Rentable — maintiens le budget', cls: 'bg-amber-500 text-white', icon: '🟠' },
  'pas-rentable': { label: 'Pas rentable', cls: 'bg-rose-600 text-white', icon: '🔴' },
  incomplet: { label: 'Données incomplètes', cls: 'bg-slate-400 text-white', icon: '⚪' }
};

export function QuickView({ store, product, openDetails }: { store: Store; product: Product; openDetails: () => void }) {
  const c = product.currency || 'FCFA';
  const entries = useMemo(() => store.data.periods.filter((p) => p.productId === product.id).sort((a, b) => a.start.localeCompare(b.start) || a.createdAt.localeCompare(b.createdAt)), [store.data.periods, product.id]);
  const uc = unitCost(product).value;
  const productReady = product.price != null && uc != null;
  const [editProduct, setEditProduct] = useState(!productReady);

  const blank = () => emptyPeriod(product.id, { start: todayIso(), end: todayIso() });
  const [draft, setDraft] = useState<Period>(blank);
  const [mode, setMode] = useState<'jour' | 'periode'>('jour');
  const isEdit = entries.some((e) => e.id === draft.id);
  const hasDraft = draft.adSpend != null || draft.orders.received != null || draft.orders.delivered != null;

  const results = useMemo(() => entries.map((e) => quick(product, e)), [entries, product]);
  const prevForDraft = (() => {
    const before = entries.filter((e) => e.id !== draft.id && e.end < draft.start);
    const last = before[before.length - 1];
    return last ? quick(product, last) : null;
  })();
  const shown: { q: Quick; prev: Quick | null; label: string } | null = hasDraft
    ? { q: quick(product, draft), prev: prevForDraft, label: 'Résultat de ta saisie (pas encore enregistrée)' }
    : results.length ? { q: results[results.length - 1], prev: results.length > 1 ? results[results.length - 2] : null, label: `Dernière saisie : ${periodLabel(entries[entries.length - 1])}` } : null;

  const set = (patch: Partial<Product>) => store.upsertProduct({ ...product, ...patch });
  const setPiece = (patch: Partial<Product>) => {
    // passage en mode simple : coût = pièce + importation
    const base = product.costMode === 'piece' ? {} : { costMode: 'piece' as const, pieceCost: uc, importPerPiece: 0 };
    set({ ...base, ...patch });
  };
  const errors: string[] = [];
  if (!draft.start || !draft.end) errors.push('Indique la date.');
  else if (draft.start > draft.end) errors.push('La date de début doit précéder la date de fin.');
  if (draft.orders.received != null && draft.orders.delivered != null && draft.orders.delivered > draft.orders.received) errors.push('Plus de livrées que de commandes : vérifie les chiffres.');
  const overlap = entries.find((x) => x.id !== draft.id && draft.start && draft.end && x.start <= draft.end && draft.start <= x.end);

  const save = () => {
    if (errors.length) return;
    store.upsertPeriod({ ...draft, end: mode === 'jour' ? draft.start : draft.end });
    setDraft(blank()); setMode('jour');
  };
  const setD = (patch: Partial<Period>) => setDraft((d) => ({ ...d, ...patch }));
  const setOrder = (k: 'received' | 'delivered') => (v: Num) => setDraft((d) => ({ ...d, orders: { ...d.orders, [k]: v } }));

  const total = results.reduce((s, q) => s + (q.profit ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* 1. Le produit */}
      {editProduct ? (
        <Card title="Mon produit" subtitle="À remplir une seule fois.">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Nom du produit" value={product.name} onChange={(v) => set({ name: v })} />
            <NumField label="Prix de vente" value={product.price} onChange={(v) => set({ price: v })} suffix={c} min={0} />
            <NumField label="Prix de la pièce (usine)" value={product.costMode === 'piece' ? product.pieceCost ?? null : uc} onChange={(v) => setPiece({ pieceCost: v })} suffix={c} min={0} />
            <NumField label="Importation par pièce" value={product.costMode === 'piece' ? product.importPerPiece ?? null : 0} onChange={(v) => setPiece({ importPerPiece: v })} suffix={c} min={0} hint="Transport, douane… ramenés à une pièce" />
            <NumField label="Livraison par colis livré" value={product.deliverySuccessCost} onChange={(v) => set({ deliverySuccessCost: v })} suffix={c} min={0} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600">Marge par pièce livrée (avant pub) : <b>{money(product.price != null && uc != null ? product.price - uc - (product.deliverySuccessCost ?? 0) : null, c)}</b></span>
            <Button variant="primary" disabled={!productReady} onClick={() => setEditProduct(false)}>Valider</Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-slate-200">
          <span>Prix <b>{money(product.price, c)}</b> · Pièce + import <b>{money(uc, c)}</b> · Livraison <b>{money(product.deliverySuccessCost ?? 0, c)}</b> → marge par pièce <b>{money((product.price ?? 0) - (uc ?? 0) - (product.deliverySuccessCost ?? 0), c)}</b></span>
          <Button small variant="ghost" onClick={() => setEditProduct(true)}>Modifier</Button>
        </div>
      )}

      {/* 2. La saisie */}
      {productReady && (
        <Card title={isEdit ? 'Modifier la saisie' : 'Mes chiffres'} subtitle="4 chiffres suffisent.">
          <div className="grid gap-3 sm:grid-cols-[auto,1fr] sm:items-end">
            <Segmented value={mode} onChange={(m) => { setMode(m); if (m === 'jour') setD({ end: draft.start }); }} options={[['jour', 'Une journée'], ['periode', 'Une période']]} />
            <div className={`grid gap-2 ${mode === 'periode' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <TextField label={mode === 'jour' ? 'Date' : 'Du'} type="date" value={draft.start} onChange={(v) => setD(mode === 'jour' ? { start: v, end: v } : { start: v })} />
              {mode === 'periode' && <TextField label="Au" type="date" value={draft.end} onChange={(v) => setD({ end: v })} />}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <NumField label="Dépenses pub Meta" value={draft.adSpend} onChange={(v) => setD({ adSpend: v })} suffix={c} min={0} />
            <NumField label="Achats Meta" value={draft.meta.metaPurchases} onChange={(v) => setDraft((d) => ({ ...d, meta: { ...d.meta, metaPurchases: v } }))} min={0} hint="Facultatif" />
            <NumField label="Commandes Shopify" value={draft.orders.received} onChange={setOrder('received')} min={0} />
            <NumField label="Total livré" value={draft.orders.delivered} onChange={setOrder('delivered')} min={0} />
          </div>
          {errors.length > 0 && hasDraft && <div className="mt-3"><Banner tone="red">{errors.join(' ')}</Banner></div>}
          {overlap && hasDraft && <div className="mt-3"><Banner tone="orange">Tu as déjà une saisie sur ces dates ({periodLabel(overlap)}) : les totaux la compteraient deux fois.</Banner></div>}
          <div className="mt-4 flex justify-end gap-2">
            {(isEdit || hasDraft) && <Button onClick={() => { setDraft(blank()); setMode('jour'); }}>Annuler</Button>}
            <Button variant="primary" disabled={!hasDraft || errors.length > 0} onClick={save}>{isEdit ? 'Enregistrer les modifications' : 'Enregistrer'}</Button>
          </div>
        </Card>
      )}

      {/* 3. Le résultat */}
      {shown && <Result q={shown.q} prev={shown.prev} label={shown.label} cur={c} />}

      {/* 4. L'historique */}
      {results.length > 0 && (
        <Card title="Mes saisies" right={<span className={`text-sm font-semibold ${total >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>Total : {money(total, c)}</span>}>
          <ul className="divide-y divide-slate-100">
            {[...entries].reverse().map((e) => {
              const q = results[entries.indexOf(e)];
              const prev = entries.indexOf(e) > 0 ? results[entries.indexOf(e) - 1] : null;
              const v = finalVerdict(q, evolution(q, prev)).verdict;
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{V[v].icon} {periodLabel(e)}</div>
                    <div className="text-xs text-slate-500">Pub {money(q.spend, c)} · {q.orders} cmd · {q.delivered} livrées · CPA {money(q.cpaOrder, c)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className={`font-semibold ${q.profit == null ? 'text-slate-400' : q.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(q.profit, c)}</span>
                    <Button small variant="ghost" onClick={() => { setDraft(e); setMode(e.start === e.end ? 'jour' : 'periode'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>✎</Button>
                    <Button small variant="ghost" onClick={() => confirm('Supprimer cette saisie ?') && store.deletePeriod(e.id)}>✕</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <button onClick={openDetails} className="w-full rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-white">
        Analyses détaillées (deadzone, simulateurs, marge, livraison…) →
      </button>
    </div>
  );
}

function Result({ q, prev, label, cur }: { q: Quick; prev: Quick | null; label: string; cur: string }) {
  const ev = evolution(q, prev);
  const fv = finalVerdict(q, ev);
  const v = V[fv.verdict];
  const box = (l: string, val: string, tone?: string, hint?: string) => (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{l}</div>
      <div className={`text-lg font-semibold ${tone ?? ''}`}>{val}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
  const pt = q.profit == null ? '' : q.profit >= 0 ? 'text-emerald-700' : 'text-rose-700';
  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      <div className={`px-4 py-4 ${v.cls}`}>
        <div className="text-xs opacity-90">{label}</div>
        <div className="mt-1 text-xl font-bold">{v.label}</div>
        <div className="mt-1 text-sm opacity-95">{fv.reason}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-4">
        {box('Bénéfice', money(q.profit, cur), pt, q.days > 1 ? `${money(q.profitPerDay, cur)} / jour` : undefined)}
        {box('Marge', percent(q.marginPct), pt, 'Bénéfice ÷ chiffre d’affaires livré')}
        {box('Taux de livraison', percent(q.deliveryRate, 0), q.deliveryRate != null && q.deliveryRate < 60 ? 'text-rose-700' : undefined, 'Livrées ÷ commandes')}
        {box('Pub max par livraison', money(q.maxCpaDelivered, cur), undefined, 'Au-delà, tu perds de l’argent')}
        {box('CPA Meta', money(q.cpaMeta, cur), undefined, 'Pub ÷ achats Meta')}
        {box('CPA commande', money(q.cpaOrder, cur), undefined, 'Pub ÷ commandes Shopify')}
        {box('CPA livré', money(q.cpaDelivered, cur), q.cpaDelivered != null && q.maxCpaDelivered != null ? (q.cpaDelivered < q.maxCpaDelivered ? 'text-emerald-700' : 'text-rose-700') : undefined, 'Pub ÷ livrées')}
        {box('Meta vs Shopify', q.metaGapPct == null ? '—' : signedPct(q.metaGapPct), undefined, q.metaGapPct == null ? 'Renseigne les achats Meta' : q.metaGapPct > 0 ? 'Meta compte plus d’achats que tes vraies commandes' : 'Meta compte moins d’achats que tes commandes')}
      </div>
      {ev && <div className={`border-t border-slate-100 px-4 py-3 text-sm ${ev.worse ? 'text-amber-800' : 'text-slate-600'}`}>{ev.worse ? '⚠️ ' : '📈 '}{ev.text}</div>}
    </section>
  );
}

function periodLabel(p: Period) { return p.start === p.end ? dateFr(p.start) : `${dateFr(p.start)} → ${dateFr(p.end)}`; }
