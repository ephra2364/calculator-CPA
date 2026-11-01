'use client';
import { useMemo, useState } from 'react';
import type { Period, Product } from '@/lib/types';
import { deadzone, type MetricTrend } from '@/lib/engine';
import { addDays, dateFr, money, num, percent, signedPct, todayIso } from '@/lib/format';
import { STATUS_TONE } from '@/lib/view';
import { Banner, Card, Explain, Pill, Segmented, TextField } from './ui';

type Mode = '7' | '14' | '30' | 'custom';

export function DeadzoneView({ product, periods }: { product: Product; periods: Period[] }) {
  const [mode, setMode] = useState<Mode>('7');
  const mine = periods.filter((p) => p.productId === product.id);
  const lastEnd = mine.length ? mine.map((p) => p.end).sort().slice(-1)[0] : todayIso();
  const [cs, setCs] = useState(addDays(lastEnd, -6));
  const [ce, setCe] = useState(lastEnd);
  const [ps, setPs] = useState(addDays(lastEnd, -13));
  const [pe, setPe] = useState(addDays(lastEnd, -7));
  const c = product.currency || 'FCFA';
  const dz = useMemo(() => mode === 'custom'
    ? deadzone(product, periods, 7, undefined, { start: cs, end: ce, compareStart: ps, compareEnd: pe })
    : deadzone(product, periods, Number(mode), lastEnd), [product, periods, mode, cs, ce, ps, pe, lastEnd]);

  const fmt = (t: MetricTrend, v: number | null) => {
    if (v == null) return '—';
    if (['cpm', 'cpc', 'cpa', 'profitPerDay'].includes(t.key)) return money(v, c);
    if (['ctr', 'conversion'].includes(t.key)) return percent(v, 1);
    return num(v, t.key === 'frequency' ? 2 : 1);
  };
  const [w0, w1, w2] = dz.windows;

  return (
    <div className="space-y-4">
      <Card title="Fenêtres comparées" subtitle="Durées identiques. Les achats Meta et les commandes réellement reçues restent distincts.">
        <Segmented value={mode} onChange={setMode} options={[['7', '7 j vs 7 j précédents'], ['14', '14 j'], ['30', '30 j'], ['custom', 'Dates']]} />
        {mode === 'custom' && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <TextField label="Période récente : du" type="date" value={cs} onChange={setCs} />
            <TextField label="au" type="date" value={ce} onChange={setCe} />
            <TextField label="Comparée à : du" type="date" value={ps} onChange={setPs} />
            <TextField label="au" type="date" value={pe} onChange={setPe} />
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Récente : {dateFr(w0.start)} → {dateFr(w0.end)} ({w0.coveredDays}/{w0.days} j couverts) · Précédente : {w1 ? `${dateFr(w1.start)} → ${dateFr(w1.end)} (${w1.coveredDays}/${w1.days} j)` : '—'}
          {w2 && ` · Avant : ${dateFr(w2.start)} → ${dateFr(w2.end)} (${w2.coveredDays}/${w2.days} j)`}
        </p>
      </Card>

      <div className={`rounded-2xl p-5 ring-1 ${{ vert: 'bg-emerald-50 ring-emerald-200', orange: 'bg-amber-50 ring-amber-200', rouge: 'bg-rose-50 ring-rose-200', gris: 'bg-slate-100 ring-slate-200' }[dz.status]}`}>
        <div className="flex items-center gap-2"><Pill tone={STATUS_TONE[dz.status]}>{dz.status.toUpperCase()}</Pill><span className="text-lg font-bold">{dz.title}</span></div>
        <p className="mt-1 text-sm text-slate-700">{dz.summary}</p>
      </div>

      {dz.status !== 'gris' && (
        <Card title="Évolution des indicateurs">
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 font-medium">Indicateur</th>{w2 && <th className="font-medium">Avant</th>}<th className="font-medium">Précédente</th><th className="font-medium">Récente</th><th className="font-medium">Évolution</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {dz.trends.map((t) => (
                  <tr key={t.key}>
                    <td className="py-2 font-medium">{t.label}</td>
                    {w2 && <td>{fmt(t, t.older)}</td>}
                    <td>{fmt(t, t.previous)}</td>
                    <td>{fmt(t, t.recent)}</td>
                    <td className={t.degraded ? 'font-semibold text-rose-700' : 'text-slate-600'}>{signedPct(t.change)}</td>
                    <td>{t.persistent ? <Pill tone="red">Persistant</Pill> : t.degraded ? <Pill tone="orange">Dégradé</Pill> : t.change == null ? <Pill tone="gray">n/d</Pill> : <Pill tone="green">OK</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2"><Explain>Seuils de dégradation : CPM, CPC, CPA et fréquence +15 % ; CTR −10 % ; conversion −15 % ; commandes et bénéfice −20 %. « Persistant » = dégradé sur deux comparaisons consécutives.</Explain></div>
        </Card>
      )}

      {dz.causes.length > 0 && (
        <Card title="Causes probables">
          <ul className="space-y-2">
            {dz.causes.map((x) => (
              <li key={x.key} className="rounded-xl border border-slate-200 p-3 text-sm">
                <b>{x.label}</b>
                <div className="text-slate-600">{x.evidence}</div>
                <div className="mt-1 text-slate-800">→ {x.action}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Banner tone="gray">Un produit n’est jamais déclaré en deadzone sur une seule journée : l’analyse compare des fenêtres d’au moins 7 jours, couvertes à 70 % minimum par tes saisies. Une période qui chevauche une fenêtre est répartie au prorata des jours.</Banner>
    </div>
  );
}
