'use client';
import { useState } from 'react';
import type { Analysis, Optimization } from '@/lib/engine';
import { NO_OPT, scaling, simulate } from '@/lib/engine';
import type { Num } from '@/lib/types';
import { money, num, percent } from '@/lib/format';
import { Banner, Button, Card, Grid, Missing, NumField, Stat } from './ui';
import { profitTone } from '@/lib/view';

function Slider({ label, value, onChange, max, unit }: { label: string; value: number; onChange: (v: number) => void; max: number; unit: string }) {
  return (
    <label className="block">
      <div className="flex justify-between text-sm"><span className="font-medium text-slate-700">{label}</span><span className="font-semibold">{value > 0 ? (unit === 'pts' ? `+${value} pts` : `${label.startsWith('Augmentation') ? '+' : '−'}${value} %`) : '—'}</span></div>
      <input type="range" min={0} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-slate-900" />
    </label>
  );
}

export function OptimizerView({ a }: { a: Analysis }) {
  const [o, setO] = useState<Optimization>(NO_OPT);
  const c = a.product.currency || 'FCFA';
  if (!a.model) return <Missing items={a.missing.length ? a.missing : ['Il faut des résultats réels (dépenses et commandes) pour simuler.']} />;
  const m = a.model;
  const { current: cu, optimized: op, impact } = simulate(m, o);
  const set = (patch: Partial<Optimization>) => setO((x) => ({ ...x, ...patch }));
  const presets: [string, Partial<Optimization>][] = [
    ['CPA −10 %', { cpaReductionPct: 10 }], ['CPA −20 %', { cpaReductionPct: 20 }], ['CPA −30 %', { cpaReductionPct: 30 }],
    ['Livraison +10 pts', { deliveryPts: 10 }], ['Frais opérationnels −10 %', { closingReductionPct: 10, deliveryCostReductionPct: 10 }],
    ['Prix +5 %', { priceIncreasePct: 5 }], ['Prix +10 %', { priceIncreasePct: 10 }]
  ];
  const rows: [string, string, string][] = [
    ['CPA par commande', money(cu.cpaOrder, c), money(op.cpaOrder, c)],
    ['CPA par livraison', money(cu.cpaDelivered, c), money(op.cpaDelivered, c)],
    ['Taux de confirmation', percent(m.confirmRate * 100), percent(Math.min(1, m.confirmRate + o.confirmationPts / 100) * 100)],
    ['Taux de livraison', percent(m.deliveryRate * 100), percent(Math.min(1, m.deliveryRate + o.deliveryPts / 100) * 100)],
    ['Livraisons', num(cu.delivered, 1), num(op.delivered, 1)],
    ['Dépenses publicitaires', money(cu.adSpend, c), money(op.adSpend, c)],
    ['Chiffre d’affaires', money(cu.revenue, c), money(op.revenue, c)],
    ['Bénéfice', money(cu.net, c), money(op.net, c)],
    ['Marge nette', percent(cu.marginPct), percent(op.marginPct)],
    ['Commandes nécessaires pour couvrir les charges fixes', cu.ordersForFixedCosts == null ? 'impossible' : num(Math.ceil(cu.ordersForFixedCosts)), op.ordersForFixedCosts == null ? 'impossible' : num(Math.ceil(op.ordersForFixedCosts))]
  ];
  return (
    <div className="space-y-4">
      <Card title="COMMENT AMÉLIORER MA RENTABILITÉ ?" subtitle={`Même volume (${num(m.received)} commandes reçues) et même période que la situation actuelle.`}>
        <div className="flex flex-wrap gap-2">
          {presets.map(([l, p]) => <Button key={l} small onClick={() => set(p)}>{l}</Button>)}
          <Button small variant="ghost" onClick={() => setO(NO_OPT)}>Réinitialiser</Button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Slider label="Réduction du CPA Meta" value={o.cpaReductionPct} onChange={(v) => set({ cpaReductionPct: v })} max={50} unit="%" />
          <Slider label="Augmentation du taux de confirmation" value={o.confirmationPts} onChange={(v) => set({ confirmationPts: v })} max={30} unit="pts" />
          <Slider label="Augmentation du taux de livraison" value={o.deliveryPts} onChange={(v) => set({ deliveryPts: v })} max={30} unit="pts" />
          <Slider label="Réduction du coût de closing" value={o.closingReductionPct} onChange={(v) => set({ closingReductionPct: v })} max={50} unit="%" />
          <Slider label="Réduction du coût de livraison" value={o.deliveryCostReductionPct} onChange={(v) => set({ deliveryCostReductionPct: v })} max={50} unit="%" />
          <Slider label="Réduction du coût d’importation" value={o.importReductionPct} onChange={(v) => set({ importReductionPct: v })} max={50} unit="%" />
          <Slider label="Augmentation du prix de vente" value={o.priceIncreasePct} onChange={(v) => set({ priceIncreasePct: v })} max={30} unit="%" />
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Bénéfice actuel" value={money(cu.net, c)} tone={profitTone(cu.net)} />
        <Stat label="Bénéfice optimisé" value={money(op.net, c)} tone={profitTone(op.net)} big />
        <Stat label="Impact de l’optimisation" value={`${impact >= 0 ? '+' : ''}${money(impact, c)}`} tone={impact > 0 ? 'green' : impact < 0 ? 'red' : 'gray'} />
      </div>
      <Card title="SITUATION ACTUELLE VS SCÉNARIO OPTIMISÉ">
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 font-medium">Indicateur</th><th className="font-medium">Actuel</th><th className="font-medium">Optimisé</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map(([l, x, y]) => <tr key={l}><td className="py-2 pr-3">{l}</td><td className="pr-3">{x}</td><td className={x !== y ? 'font-semibold' : ''}>{y}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
      <Banner tone="gray">Simulation à hypothèses constantes : elle montre l’effet mathématique d’une amélioration, ce n’est pas une garantie de résultat.</Banner>
    </div>
  );
}

export function ScalingView({ a }: { a: Analysis }) {
  const c = a.product.currency || 'FCFA';
  const m = a.model;
  const perDay = a.totals.days ? a.totals.adSpend / a.totals.days : null;
  const [cur, setCur] = useState<Num>(a.product.dailyBudget ?? (perDay != null ? Math.round(perDay) : null));
  const [next, setNext] = useState<Num>(cur != null ? Math.round(cur * 2) : null);
  const [days, setDays] = useState<Num>(30);
  const [cpa, setCpa] = useState<Num>(m ? Math.round(m.cpaOrder) : null);
  const [del, setDel] = useState<Num>(m ? Math.round(m.deliveryRate * 1000) / 10 : null);
  const [stock, setStock] = useState<Num>(null);
  const [cash, setCash] = useState<Num>(null);
  if (!m) return <Missing items={a.missing.length ? a.missing : ['Il faut des résultats réels pour simuler un scaling.']} />;
  const ready = next != null && days != null && cpa != null && cpa > 0 && del != null;
  const r = ready ? scaling(m, { currentDailyBudget: cur ?? 0, newDailyBudget: next!, days: days!, forecastCpa: cpa!, forecastDeliveryPct: del!, stockAvailable: stock, cashAvailable: cash }) : null;
  return (
    <div className="space-y-4">
      <Card title="Simulateur de scaling" subtitle="Les taux de confirmation et d’expédition actuels sont conservés.">
        <Grid cols={4}>
          <NumField label="Budget journalier actuel" value={cur} onChange={setCur} suffix={c} min={0} />
          <NumField label="Nouveau budget journalier" value={next} onChange={setNext} suffix={c} min={0} />
          <NumField label="Durée" value={days} onChange={setDays} suffix="jours" min={1} />
          <NumField label="CPA prévisionnel" value={cpa} onChange={setCpa} suffix={c} min={0} hint={`Actuel : ${money(m.cpaOrder, c)}`} />
          <NumField label="Taux de livraison prévisionnel" value={del} onChange={setDel} suffix="%" min={0} />
          <NumField label="Stock disponible" value={stock} onChange={setStock} suffix="unités" min={0} />
          <NumField label="Trésorerie disponible" value={cash} onChange={setCash} suffix={c} min={0} />
        </Grid>
      </Card>
      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Dépenses publicitaires" value={money(r.adSpend, c)} />
            <Stat label="Commandes estimées" value={num(r.received)} />
            <Stat label="Livraisons estimées" value={num(r.delivered)} />
            <Stat label="Chiffre d’affaires estimé" value={money(r.revenue, c)} />
            <Stat label="Bénéfice estimé" value={money(r.net, c)} tone={profitTone(r.net)} hint="Après charges fixes de la période analysée" />
            <Stat label="Besoin en stock" value={`${num(r.stockNeed)} unités`} tone={r.stockAlert ? 'red' : 'neutral'} hint={r.missingStock != null ? (r.missingStock > 0 ? `Il manque ${num(r.missingStock)} unités` : 'Stock suffisant') : 'Renseigne ton stock'} />
            <Stat label="Besoin de trésorerie" value={money(r.cashNeed, c)} tone={r.cashAlert ? 'red' : 'neutral'} hint="Pub + frais avancés avant encaissement (+ réassort)" />
            <Stat label="Marge nette estimée" value={percent(r.marginPct)} tone={profitTone(r.net)} />
          </div>
          {r.warnings.map((w, i) => <Banner key={i} tone={i === 0 ? 'gray' : 'orange'}>{w}</Banner>)}
          <Banner tone="gray">Doubler le budget ne double pas automatiquement les ventes : refais la simulation avec un CPA plus élevé pour mesurer ta marge de sécurité.</Banner>
        </>
      )}
    </div>
  );
}
