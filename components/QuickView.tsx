'use client';
import { useMemo, useState, type ReactNode } from 'react';
import type { Store } from '@/lib/store';
import type { Num, Period, Product } from '@/lib/types';
import { unitCost } from '@/lib/engine';
import { emptyPeriod } from '@/lib/factory';
import { quick, evolution, finalVerdict, monthPlan, type Quick, type Verdict } from '@/lib/quick';
import { dateFr, money, num, percent, signedPct, todayIso } from '@/lib/format';
import { Banner, Button, Card, NumField, Segmented, TextField } from './ui';

const V: Record<Verdict, { label: string; cls: string; icon: string }> = {
  scaler: { label: 'Rentable — tu peux augmenter le budget', cls: 'bg-emerald-600 text-white', icon: '🟢' },
  maintenir: { label: 'Rentable — garde le même budget', cls: 'bg-amber-500 text-white', icon: '🟠' },
  'pas-rentable': { label: 'Tu perds de l’argent', cls: 'bg-rose-600 text-white', icon: '🔴' },
  incomplet: { label: 'Il manque des chiffres', cls: 'bg-slate-400 text-white', icon: '⚪' }
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
  const plan = useMemo(() => monthPlan(product, entries, todayIso()), [product, entries]);

  const set = (patch: Partial<Product>) => store.upsertProduct({ ...product, ...patch });
  const setPiece = (patch: Partial<Product>) => {
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
  const marginBefore = product.price != null && uc != null ? product.price - uc - (product.deliverySuccessCost ?? 0) : null;

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
          <h3 className="mt-5 text-sm font-semibold text-slate-700">Mes objectifs <span className="font-normal text-slate-500">(facultatif)</span></h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <NumField label="Marge nette visée" value={product.targetMarginPct ?? null} onChange={(v) => set({ targetMarginPct: v })} suffix="%" min={0} hint="Ce qu’il doit te rester sur le prix de vente, après tout (pub comprise). Ex. 25 %" />
            <NumField label="Bénéfice visé ce mois-ci" value={product.monthlyProfitTarget ?? null} onChange={(v) => set({ monthlyProfitTarget: v })} suffix={c} min={0} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-slate-600">Ce qu’il te reste par pièce livrée <b>avant la pub</b> : <b>{money(marginBefore, c)}</b></span>
            <Button variant="primary" disabled={!productReady} onClick={() => setEditProduct(false)}>Valider</Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-slate-200">
          <span>Prix <b>{money(product.price, c)}</b> · Pièce + import <b>{money(uc, c)}</b> · Livraison <b>{money(product.deliverySuccessCost ?? 0, c)}</b>
            {product.targetMarginPct != null && <> · Marge visée <b>{product.targetMarginPct} %</b></>}
            {product.monthlyProfitTarget != null && <> · Objectif du mois <b>{money(product.monthlyProfitTarget, c)}</b></>}</span>
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

      {/* 4. L'objectif du mois */}
      {productReady && <MonthCard plan={plan} cur={c} setTarget={(v) => set({ monthlyProfitTarget: v })} />}

      {/* 5. L'historique */}
      {results.length > 0 && (
        <Card title="Mes saisies" right={<span className={`text-sm font-semibold ${total >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>Total : {money(total, c)}</span>}>
          <ul className="divide-y divide-slate-100">
            {[...entries].reverse().map((e) => {
              const i = entries.indexOf(e);
              const q = results[i];
              const v = finalVerdict(q, evolution(q, i > 0 ? results[i - 1] : null)).verdict;
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{V[v].icon} {periodLabel(e)}</div>
                    <div className="text-xs text-slate-500">Pub {money(q.spend, c)} · {num(q.orders)} cmd · {num(q.delivered)} livrées · {money(q.profitPerPiece, c)} net / pièce</div>
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

      <Glossary />
      <button onClick={openDetails} className="w-full rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-white">
        Analyses détaillées (deadzone, simulateurs, marge, livraison…) →
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ Résultat d'une saisie
function Result({ q, prev, label, cur }: { q: Quick; prev: Quick | null; label: string; cur: string }) {
  const ev = evolution(q, prev);
  const fv = finalVerdict(q, ev);
  const v = V[fv.verdict];
  const pt = q.profit == null ? 'text-slate-400' : q.profit >= 0 ? 'text-emerald-700' : 'text-rose-700';
  const day = q.days === 1;
  const targetOk = q.targetMarginPct != null && q.marginPct != null ? q.marginPct >= q.targetMarginPct : null;
  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      <div className={`px-4 py-4 ${v.cls}`}>
        <div className="text-xs opacity-90">{label}</div>
        <div className="mt-1 text-xl font-bold">{v.icon} {v.label}</div>
        <div className="mt-1 text-sm opacity-95">{fv.reason}</div>
      </div>

      {q.profit != null && (
        <div className="space-y-4 p-4">
          <p className="text-base leading-relaxed text-slate-800">
            {day ? 'Ce jour-là' : `Sur ces ${q.days} jours`}, tu as {q.profit >= 0 ? 'gagné' : 'perdu'} <b className={pt}>{money(Math.abs(q.profit), cur)}</b> net{!day && <> (soit <b className={pt}>{money(q.profitPerDay, cur)}</b> par jour)</>}.
            {q.profitPerPiece != null && <> Sur chaque pièce livrée, {q.profitPerPiece >= 0 ? 'il te reste' : 'tu perds'} <b className={pt}>{money(Math.abs(q.profitPerPiece), cur)}</b> après la pub.</>}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Big label={day ? 'Bénéfice de la journée' : 'Bénéfice par jour'} value={money(day ? q.profit : q.profitPerDay, cur)} tone={pt} sub={day ? undefined : `Total : ${money(q.profit, cur)}`} />
            <Big label="Bénéfice net par pièce" value={money(q.profitPerPiece, cur)} tone={pt} sub={`${num(q.delivered)} pièces livrées`} />
            <Big label="Marge nette" value={percent(q.marginPct, 0)} tone={pt}
              sub={q.targetMarginPct != null ? `${targetOk ? '✓' : '✗'} objectif ${q.targetMarginPct} %` : 'Bénéfice ÷ argent encaissé'} />
          </div>
          {q.piece && <PieceBar p={q.piece} cur={cur} />}
          <details className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
            <summary className="cursor-pointer py-1 font-medium text-slate-700">Voir les indicateurs détaillés</summary>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Line label="Taux de livraison" value={percent(q.deliveryRate, 0)} hint="Sur 100 commandes, combien sont livrées" bad={q.deliveryRate != null && q.deliveryRate < 60} />
              <Line label="Pub par pièce livrée (CPA livré)" value={money(q.cpaDelivered, cur)} hint="Ce que la pub te coûte pour 1 pièce encaissée" bad={q.cpaDelivered != null && q.maxCpaDelivered != null && q.cpaDelivered >= q.maxCpaDelivered} />
              <Line label="Pub maximale par pièce livrée" value={money(q.maxCpaDelivered, cur)} hint="Au-delà, tu perds de l’argent" />
              {q.maxCpaForTarget != null && <Line label={`Pub maximale pour ${q.targetMarginPct} % de marge`} value={money(q.maxCpaForTarget, cur)} hint="Pour tenir ton objectif de marge" />}
              <Line label="CPA commande" value={money(q.cpaOrder, cur)} hint="Pub ÷ commandes Shopify" />
              <Line label="CPA Meta" value={money(q.cpaMeta, cur)} hint="Pub ÷ achats comptés par Meta" />
              <Line label="Meta vs Shopify" value={q.metaGapPct == null ? '—' : signedPct(q.metaGapPct)} hint={q.metaGapPct == null ? 'Renseigne les achats Meta' : q.metaGapPct > 0 ? 'Meta annonce plus d’achats que tes vraies commandes' : 'Meta annonce moins d’achats que tes commandes'} />
              <Line label="Argent encaissé" value={money(q.revenue, cur)} hint="Seules les pièces livrées sont payées" />
            </div>
          </details>
        </div>
      )}
      {ev && <div className={`border-t border-slate-100 px-4 py-3 text-sm ${ev.worse ? 'text-amber-800' : 'text-slate-600'}`}>{ev.worse ? '⚠️ ' : '📈 '}{ev.text}</div>}
    </section>
  );
}

function Big({ label, value, tone, sub }: { label: string; value: string; tone: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold tracking-tight ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
function Line({ label, value, hint, bad }: { label: string; value: string; hint: string; bad?: boolean }) {
  return (
    <div className="rounded-lg bg-white p-2.5">
      <div className="flex items-baseline justify-between gap-2"><span className="text-slate-600">{label}</span><b className={bad ? 'text-rose-700' : ''}>{value}</b></div>
      <div className="text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function PieceBar({ p, cur }: { p: NonNullable<Quick['piece']>; cur: string }) {
  const parts = [
    { k: 'Pièce (usine)', v: p.piece, c: 'bg-slate-700' },
    { k: 'Importation', v: p.importCost, c: 'bg-slate-500' },
    { k: 'Livraison', v: p.delivery + p.other, c: 'bg-sky-500' },
    { k: 'Pub', v: p.ads, c: 'bg-violet-500' },
    { k: 'Autres frais', v: p.failed, c: 'bg-amber-500' }
  ].filter((x) => x.v > 0.5);
  const profit = p.profit;
  const scale = Math.max(p.price, parts.reduce((s, x) => s + x.v, 0));
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-slate-700">Sur une pièce vendue à {money(p.price, cur)} :</div>
      <div className="flex h-7 w-full overflow-hidden rounded-lg bg-slate-100">
        {parts.map((x) => <div key={x.k} className={x.c} style={{ width: `${(x.v / scale) * 100}%` }} title={`${x.k} : ${money(x.v, cur)}`} />)}
        {profit > 0 && <div className="bg-emerald-500" style={{ width: `${(profit / scale) * 100}%` }} />}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        {parts.map((x) => <li key={x.k} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${x.c}`} />{x.k} : <b>{money(x.v, cur)}</b></li>)}
        <li className={`flex items-center gap-1.5 font-semibold ${profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}><span className={`h-2.5 w-2.5 rounded-sm ${profit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />{profit >= 0 ? 'Il te reste' : 'Tu perds'} : {money(Math.abs(profit), cur)}</li>
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ Objectif du mois
function MonthCard({ plan: m, cur, setTarget }: { plan: ReturnType<typeof monthPlan>; cur: string; setTarget: (v: Num) => void }) {
  const STATUS: Record<typeof m.status, { t: string; c: string }> = {
    atteint: { t: '🎉 Objectif atteint', c: 'text-emerald-700' },
    'en-avance': { t: '✅ En bonne voie', c: 'text-emerald-700' },
    'en-retard': { t: '⚠️ En retard sur l’objectif', c: 'text-amber-700' },
    'sans-objectif': { t: '', c: '' },
    'pas-de-donnees': { t: '', c: '' }
  };
  const pctBar = m.target ? Math.max(0, Math.min(100, (m.profitSoFar / m.target) * 100)) : 0;
  const projPct = m.target && m.projection != null ? Math.max(0, Math.min(100, (m.projection / m.target) * 100)) : 0;
  return (
    <Card title={`Mon mois — ${m.monthLabel}`} subtitle={`Jour ${m.dayOfMonth} sur ${m.daysInMonth}`}>
      {m.status === 'pas-de-donnees' ? (
        <p className="text-sm text-slate-500">Enregistre une première saisie pour voir ton estimation du mois.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Big label="Bénéfice déjà fait ce mois-ci" value={money(m.profitSoFar, cur)} tone={m.profitSoFar >= 0 ? 'text-emerald-700' : 'text-rose-700'} sub={`${m.daysWithData} jour(s) saisi(s)`} />
            <Big label="Bénéfice estimé fin de mois" value={money(m.projection, cur)} tone={(m.projection ?? 0) >= 0 ? 'text-slate-900' : 'text-rose-700'} sub={`Au ${m.basis}`} />
            <Big label="Rythme actuel" value={`${money(m.avgProfitPerDay, cur)} / jour`} tone="text-slate-900" />
          </div>
          {m.target != null ? (
            <>
              <div>
                <div className="flex justify-between text-sm"><span className={`font-semibold ${STATUS[m.status].c}`}>{STATUS[m.status].t}</span><span className="text-slate-600">{money(m.profitSoFar, cur)} / {money(m.target, cur)}</span></div>
                <div className="relative mt-1.5 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="absolute inset-y-0 left-0 bg-emerald-200" style={{ width: `${projPct}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-emerald-600" style={{ width: `${pctBar}%` }} />
                </div>
                <div className="mt-1 text-xs text-slate-500">Vert foncé : déjà gagné · vert clair : estimation fin de mois</div>
              </div>
              {m.status !== 'atteint' && m.neededPerDay != null && (
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                  Pour atteindre <b>{money(m.target, cur)}</b>, il te faut <b>{money(m.neededPerDay, cur)} de bénéfice par jour</b> sur les jours restants
                  {m.deliveriesPerDay != null ? <>, soit environ <b>{num(Math.ceil(m.deliveriesPerDay))} pièces livrées par jour</b>{m.ordersPerDay != null && <> (≈ {num(Math.ceil(m.ordersPerDay))} commandes)</>}{m.adBudgetPerDay != null && <> pour un budget pub d’environ <b>{money(m.adBudgetPerDay, cur)} par jour</b></>}.</>
                    : <>. Avec tes résultats actuels (perte par pièce), aucun volume ne permet d’y arriver : rends d’abord le produit rentable.</>}
                </div>
              )}
            </>
          ) : (
            <TargetInput cur={cur} onSave={setTarget} />
          )}
          <p className="text-xs text-slate-500">Estimation : elle suppose que tu gardes le même rythme, le même coût de pub par pièce et le même taux de livraison. Ce n’est pas une garantie.</p>
        </div>
      )}
    </Card>
  );
}

function TargetInput({ cur, onSave }: { cur: string; onSave: (v: Num) => void }) {
  const [v, setV] = useState<Num>(null);
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr,auto] sm:items-start">
      <NumField label="Fixe ton objectif de bénéfice du mois" value={v} onChange={setV} suffix={cur} min={0} placeholder="Ex. 1000000" />
      <div className="sm:pt-6"><Button variant="primary" disabled={v == null || v <= 0} onClick={() => onSave(v)}>Valider l’objectif</Button></div>
    </div>
  );
}

function Glossary() {
  const items: [string, ReactNode][] = [
    ['Bénéfice net', 'Ce qui reste vraiment dans ta poche : argent des pièces livrées − pièces − importation − livraison − pub.'],
    ['Marge nette', 'La part du prix qui te reste. 25 % = sur 10 000 FCFA encaissés, tu gardes 2 500 FCFA.'],
    ['CPA', 'Ce que la pub te coûte pour obtenir une vente. Le « CPA livré » compte seulement les pièces vraiment livrées (payées).'],
    ['Pub maximale par pièce', 'Si ta pub coûte plus que ce montant par pièce livrée, tu perds de l’argent.'],
    ['Scaler', 'Augmenter ton budget pub pour vendre plus. À faire seulement quand tu es rentable avec de la marge.']
  ];
  return (
    <details className="rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-slate-200">
      <summary className="cursor-pointer font-medium text-slate-700">📖 Comprendre les mots</summary>
      <dl className="mt-2 space-y-2">{items.map(([t, d]) => <div key={t}><dt className="font-semibold">{t}</dt><dd className="text-slate-600">{d}</dd></div>)}</dl>
    </details>
  );
}

function periodLabel(p: Period) { return p.start === p.end ? dateFr(p.start) : `${dateFr(p.start)} → ${dateFr(p.end)}`; }
