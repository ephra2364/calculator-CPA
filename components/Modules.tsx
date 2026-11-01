'use client';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Analysis, DeadzoneResult, Diagnosis } from '@/lib/engine';
import { deliveryAnalysis, marginBreakdown } from '@/lib/engine';
import type { Store } from '@/lib/store';
import { money, num, percent } from '@/lib/format';
import { STATUS_LABEL, STATUS_TONE, profitTone } from '@/lib/view';
import { Banner, Button, Card, Explain, Grid, Hypotheses, Missing, NumField, Pill, Stat } from './ui';
import type { Tab } from './ProductView';

const cur = (a: Analysis) => a.product.currency || 'FCFA';

// ------------------------------------------------------------------ Résumé / diagnostic
export function SummaryView({ a, dz, diag, setTab }: { a: Analysis; dz: DeadzoneResult; diag: Diagnosis; setTab: (t: Tab) => void }) {
  const c = cur(a), pr = a.profit, be = a.breakEven;
  if (!pr && !a.totals.hasOrders) {
    return (
      <div className="space-y-4">
        <Missing items={a.missing} />
        <Card title="Pour obtenir ton diagnostic">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>Renseigne le prix et les coûts dans <button className="font-semibold underline" onClick={() => setTab('infos')}>Produit &amp; coûts</button>.</li>
            <li>Définis ton CPA cible.</li>
            <li>Saisis une période (dépenses, commandes, livraisons) dans <button className="font-semibold underline" onClick={() => setTab('resultats')}>Résultats &amp; historique</button>.</li>
          </ol>
          {be && <p className="mt-3 text-sm">Avec tes taux prévisionnels, ton <b>CPA maximum de rentabilité</b> est de <b>{money(be.perOrder, c)}</b> par commande.</p>}
        </Card>
      </div>
    );
  }
  const net = pr?.net ?? null;
  const cpa = a.cpa.cpaOrder;
  let budget: { tone: 'green' | 'orange' | 'red' | 'gray'; text: string };
  if (!pr || cpa == null || !be) budget = { tone: 'gray', text: 'Données insuffisantes pour répondre.' };
  else if (net! < 0 || cpa >= be.perOrder) budget = { tone: 'red', text: 'Non : le produit n’est pas rentable au CPA actuel. Corrige d’abord le problème principal.' };
  else if (dz.status === 'rouge' || dz.status === 'orange' || cpa > be.perOrder * 0.8) budget = { tone: 'orange', text: 'Avec prudence : la marge de sécurité est faible ou les performances se dégradent. Augmente par petits paliers et vérifie ta trésorerie.' };
  else budget = { tone: 'green', text: 'Oui, par paliers (+20 à 30 %) : ton CPA est nettement sous ton CPA maximum. Vérifie ton stock et ta trésorerie dans le simulateur de scaling.' };

  return (
    <div className="space-y-4">
      <Card title="MON DIAGNOSTIC BUSINESS">
        <p className={`text-base font-semibold ${diag.profitable === false ? 'text-rose-700' : 'text-slate-900'}`}>{diag.headline}</p>
        {diag.main && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-500">Que dois-je améliorer maintenant ?</h3>
              <ol className="mt-2 space-y-2">
                {diag.priorities.map((p, i) => (
                  <li key={i} className="flex gap-3 rounded-xl bg-slate-50 p-3 text-sm"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">{i + 1}</span><span><b>Priorité {i + 1} :</b> {p}</span></li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-500">Qu’est-ce qui me fait perdre le plus d’argent ?</h3>
              <ul className="mt-2 space-y-2">
                {diag.problems.map((p) => (
                  <li key={p.key} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2"><b>{p.category}</b><span className="whitespace-nowrap font-semibold text-emerald-700">+{money(p.impact, c)}</span></div>
                    <div className="text-slate-600">{p.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{p.explanation}</div>
                  </li>
                ))}
              </ul>
              <Explain>Montant = gain de bénéfice estimé si ce point était corrigé (niveau de référence ou retour à la période précédente), à volume de commandes égal. Estimation, pas une garantie.</Explain>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Est-ce que je gagne de l’argent ?" value={net == null ? '—' : net >= 0 ? 'Oui' : 'Non'} tone={profitTone(net)} big />
        <Stat label="Combien je gagne réellement" value={money(net, c)} tone={profitTone(net)} hint="Bénéfice après pub, frais et charges fixes" />
        <Stat label="Mon CPA actuel" value={money(cpa, c)} hint={`Par livraison : ${money(a.cpa.cpaDelivered, c)}`} />
        <Stat label="CPA à atteindre (cible)" value={money(a.cpa.targetCpa, c)} tone={a.cpa.targetStatus === 'over' ? 'orange' : a.cpa.targetStatus === 'under' ? 'green' : 'neutral'}
          hint={a.cpa.targetGap == null ? 'Définis un CPA cible' : a.cpa.targetGap >= 0 ? `${money(a.cpa.targetGap, c)} sous l’objectif` : `${money(-a.cpa.targetGap, c)} au-dessus de l’objectif`} />
        <Stat label="CPA maximum de rentabilité" value={money(be?.perOrder, c)} hint="Au-delà, chaque commande fait perdre de l’argent" tone={be && cpa != null ? (cpa < be.perOrder ? 'green' : 'red') : 'neutral'} />
        <Stat label="Mon produit est-il en deadzone ?" value={<Pill tone={STATUS_TONE[dz.status]}>{STATUS_LABEL[dz.status]}</Pill>} hint={dz.summary} />
        <Stat label="Problème principal" value={diag.main?.category ?? '—'} hint={diag.main?.title} />
        <Stat label="Puis-je augmenter mon budget ?" value={<Pill tone={budget.tone}>{budget.tone === 'green' ? 'Oui' : budget.tone === 'orange' ? 'Prudence' : budget.tone === 'red' ? 'Non' : '—'}</Pill>} hint={budget.text} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button small onClick={() => setTab('optimisation')}>Simuler des optimisations →</Button>
        <Button small onClick={() => setTab('scaling')}>Simuler une hausse de budget →</Button>
        <Button small onClick={() => setTab('deadzone')}>Détail deadzone →</Button>
      </div>
      <Missing items={a.missing} />
      <Hypotheses items={a.assumptions} />
    </div>
  );
}

// ------------------------------------------------------------------ CPA Calculator
export function CpaView({ a, store }: { a: Analysis; store: Store }) {
  const c = cur(a), p = a.product, k = a.cpa, be = a.breakEven;
  const set = (patch: Partial<typeof p>) => store.upsertProduct({ ...p, ...patch });
  const dailyOrders = p.dailyBudget != null && k.cpaOrder ? p.dailyBudget / k.cpaOrder : null;
  return (
    <div className="space-y-4">
      <Card title="Objectif publicitaire">
        <Grid cols={3}>
          <NumField label="CPA cible souhaité" value={p.targetCpa} onChange={(v) => set({ targetCpa: v })} suffix={c} min={0} />
          <NumField label="Budget publicitaire journalier" value={p.dailyBudget} onChange={(v) => set({ dailyBudget: v })} suffix={c} min={0} />
          <NumField label="Budget publicitaire total" value={p.totalBudget} onChange={(v) => set({ totalBudget: v })} suffix={c} min={0} />
        </Grid>
        {dailyOrders != null && <p className="mt-3 text-sm text-slate-600">Au CPA actuel, ton budget journalier génère environ <b>{num(dailyOrders, 1)} commandes / jour</b>.</p>}
      </Card>

      {k.targetStatus && (
        <Banner tone={k.targetStatus === 'over' ? 'orange' : 'green'} title={k.targetStatus === 'over' ? `CPA SUPÉRIEUR À L’OBJECTIF de ${money(-(k.targetGap as number), c)}` : `CPA INFÉRIEUR À L’OBJECTIF de ${money(k.targetGap, c)}`}>
          Écart = CPA cible ({money(k.targetCpa, c)}) − CPA actuel ({money(k.cpaOrder, c)}).
        </Banner>
      )}

      <Card title="Résultats publicitaires" subtitle={`Période analysée : ${num(a.totals.periods)} période(s), ${money(a.totals.adSpend, c)} dépensés`}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="CPA par commande" value={money(k.cpaOrder, c)} hint="Dépenses ÷ commandes reçues" />
          <Stat label="CPA par commande confirmée" value={money(k.cpaConfirmed, c)} hint="Dépenses ÷ commandes confirmées" />
          <Stat label="CPA par livraison réussie" value={money(k.cpaDelivered, c)} hint="Dépenses ÷ commandes livrées" />
          <Stat label="Taux de confirmation" value={percent(k.confirmationRate)} hint="Confirmées ÷ reçues" />
          <Stat label="Taux de livraison" value={percent(k.deliveryRate)} hint="Livrées ÷ expédiées" />
          <Stat label="Taux de refus" value={percent(k.refusalRate)} hint="Refusées ÷ expédiées" />
        </div>
      </Card>

      <Card title="CPA BREAK-EVEN" subtitle="Le coût publicitaire maximal avant que l’activité devienne déficitaire (hors charges fixes). Différent du CPA cible.">
        {be ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Par commande reçue" value={money(be.perOrder, c)} tone={k.cpaOrder != null ? (k.cpaOrder < be.perOrder ? 'green' : 'red') : 'neutral'} big
                hint={k.cpaOrder != null ? (k.cpaOrder < be.perOrder ? `Marge de sécurité : ${money(be.perOrder - k.cpaOrder, c)} par commande` : `Tu dépasses de ${money(k.cpaOrder - be.perOrder, c)} par commande`) : undefined} />
              <Stat label="Par commande confirmée" value={money(be.perConfirmed, c)} />
              <Stat label="Par livraison réussie" value={money(be.perDelivered, c)} />
            </div>
            <div className="mt-3"><Explain>
              Formule : taux de confirmation × taux d’expédition × taux de livraison × (prix − coût produit − livraison − autres frais) − part des colis échoués × (coût d’échec + produits perdus) − closing.
              Taux utilisés : confirmation {percent(a.rates.confirm != null ? a.rates.confirm * 100 : null)}, expédition {percent(a.rates.ship != null ? a.rates.ship * 100 : null)}, livraison {percent(a.rates.delivery != null ? a.rates.delivery * 100 : null)} ({a.rates.source === 'reel' ? 'résultats réels' : 'hypothèses du produit'}).
            </Explain></div>
          </>
        ) : <p className="text-sm text-slate-500">Renseigne le prix, le coût du produit et des taux (réels ou prévisionnels).</p>}
      </Card>
      <Missing items={a.missing} />
      <Hypotheses items={a.assumptions} />
    </div>
  );
}

// ------------------------------------------------------------------ Profit Analyzer
export function ProfitView({ a }: { a: Analysis }) {
  const c = cur(a), pr = a.profit;
  if (!pr) return <div className="space-y-4"><Missing items={a.missing} /><Hypotheses items={a.assumptions} /></div>;
  const line = (label: string, v: number, strong = false, note?: string) => (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${strong ? 'font-semibold' : ''}`}>
      <span>{label}{note && <span className="block text-xs font-normal text-slate-500">{note}</span>}</span>
      <span className={`whitespace-nowrap ${strong ? (v >= 0 ? 'text-emerald-700' : 'text-rose-700') : v < 0 ? 'text-slate-700' : ''}`}>{money(v, c)}</span>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Chiffre d’affaires (livré)" value={money(pr.revenue, c)} hint={`${num(a.totals.delivered)} livraisons encaissées`} />
        <Stat label="Bénéfice contributif" value={money(pr.contribution, c)} tone={profitTone(pr.contribution)} hint="Avant charges fixes" />
        <Stat label="Bénéfice après charges fixes" value={money(pr.net, c)} tone={profitTone(pr.net)} big />
        <Stat label="Marge nette" value={percent(pr.netMarginPct)} tone={profitTone(pr.net)} hint={`Marge contributive : ${percent(pr.contributionMarginPct)}`} />
        <Stat label="Coût des produits vendus" value={money(pr.cogs, c)} />
        <Stat label="Dépenses publicitaires" value={money(pr.adSpend, c)} />
        <Stat label="Dépenses opérationnelles" value={money(pr.operating + pr.failedCosts, c)} hint="Closing, livraison, autres, échecs" />
        <Stat label="Bénéfice moyen par livraison" value={money(pr.profitPerDelivery, c)} tone={profitTone(pr.profitPerDelivery)} hint="Contributif" />
      </div>
      <Card title="Compte de résultat de la période" subtitle="Seules les commandes livrées sont comptées comme revenu encaissé.">
        <div className="divide-y divide-slate-100 text-sm">
          {line('Chiffre d’affaires des commandes livrées', pr.revenue)}
          {line('− Coût des produits vendus', -pr.cogs)}
          {line('− Closing', -pr.closing)}
          {line('− Livraisons réussies', -pr.deliverySuccess)}
          {pr.otherVariable > 0 && line('− Autres frais variables', -pr.otherVariable)}
          {line('− Commandes échouées', -pr.failedCosts, false, `Transport ${money(pr.failedTransport, c)} · retour ${money(pr.failedReturn, c)} · produits perdus ${money(pr.lostProducts, c)}`)}
          {line('− Publicité', -pr.adSpend)}
          {line('= Bénéfice contributif', pr.contribution, true)}
          {line('− Charges fixes (hors marge contributive)', -pr.fixedCosts)}
          {line('= Bénéfice après charges fixes', pr.net, true)}
        </div>
      </Card>
      <Card title="Seuil de rentabilité">
        <p className="text-sm text-slate-700">
          {pr.fixedCosts <= 0 ? 'Aucune charge fixe imputée sur la période : chaque livraison rentable contribue directement au bénéfice.'
            : pr.breakEvenDeliveries == null ? 'Le bénéfice contributif par livraison est négatif : aucun volume ne permet de couvrir les charges fixes dans ces conditions.'
            : <>Il faut <b>{num(Math.ceil(pr.breakEvenDeliveries))} livraisons</b> sur la période pour couvrir {money(pr.fixedCosts, c)} de charges fixes ({num(a.totals.delivered)} réalisées).</>}
        </p>
      </Card>
      <Hypotheses items={a.assumptions} />
    </div>
  );
}

// ------------------------------------------------------------------ Delivery Analyzer
export function DeliveryView({ a }: { a: Analysis }) {
  const c = cur(a), t = a.totals, k = a.cpa;
  if (!t.hasOrders) return <Missing items={['Saisis au moins une période avec tes commandes et livraisons.']} />;
  const d = deliveryAnalysis(a);
  const funnel = [
    { name: 'Reçues', v: t.received }, { name: 'Confirmées', v: t.confirmed }, { name: 'Expédiées', v: t.shipped }, { name: 'Livrées', v: t.delivered }
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Taux de confirmation" value={percent(k.confirmationRate)} tone={k.confirmationRate == null ? 'gray' : k.confirmationRate < 65 ? 'red' : 'green'} />
        <Stat label="Taux d’expédition" value={percent(k.shippingRate)} hint="Expédiées ÷ confirmées" />
        <Stat label="Taux de livraison" value={percent(k.deliveryRate)} tone={k.deliveryRate == null ? 'gray' : k.deliveryRate < 75 ? 'red' : 'green'} />
        <Stat label="Taux de refus" value={percent(k.refusalRate)} />
        <Stat label="Coût moyen d’une livraison réussie" value={money(d.avgDeliveryCost, c)} hint="Closing + livraison + coût des échecs, par livraison" />
        <Stat label="Coût moyen d’une commande échouée" value={money(d.avgFailedCost, c)} hint="Transport, retour et produits perdus" />
        <Stat label="Injoignables" value={percent(k.unreachableRate)} hint="% des expéditions" />
        <Stat label="Annulées" value={percent(k.cancelRate)} hint="% des commandes reçues" />
      </div>
      <Card title="De la commande à la livraison">
        <div className="space-y-2">
          {funnel.map((f) => (
            <div key={f.name} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-slate-600">{f.name}</span>
              <div className="h-7 flex-1 rounded-lg bg-slate-100">
                <div className="flex h-7 items-center rounded-lg bg-slate-800 px-2 text-xs font-semibold text-white" style={{ width: `${Math.max(6, (f.v / Math.max(1, t.received)) * 100)}%` }}>{num(f.v)}</div>
              </div>
            </div>
          ))}
          <div className="pt-1 text-xs text-slate-500">Refusées {num(t.refused)} · injoignables {num(t.unreachable)} · retournées {num(t.returned)} · annulées {num(t.cancelled)}</div>
        </div>
      </Card>
      {d.origin && <Banner tone="blue" title="D’où vient le problème ?">{d.origin}</Banner>}
      {d.diags.map((x) => (
        <Banner key={x.title} tone={x.level === 'bad' ? 'red' : x.level === 'warn' ? 'orange' : 'green'} title={x.title}>
          <p>{x.text}</p>
          {x.actions.length > 0 && <ul className="mt-1 list-disc pl-5">{x.actions.map((y) => <li key={y}>{y}</li>)}</ul>}
        </Banner>
      ))}
      <Explain>Les échecs de livraison ne sont pas attribués automatiquement à Meta : seule une confirmation faible ou beaucoup d’injoignables désignent la qualité des prospects.</Explain>
    </div>
  );
}

// ------------------------------------------------------------------ Margin Analyzer
export function MarginView({ a, diag }: { a: Analysis; diag: Diagnosis }) {
  const c = cur(a);
  const mb = marginBreakdown(a);
  if (!mb) return <Missing items={a.missing.length ? a.missing : ['Il faut au moins une livraison pour analyser la marge.']} />;
  const data = [...mb.slices.map((s) => ({ name: s.label, pct: Math.round(s.pctOfPrice * 10) / 10, value: s.perDelivery, profit: false })),
    { name: 'Bénéfice', pct: Math.round((mb.profitPerDelivery / mb.price) * 1000) / 10, value: mb.profitPerDelivery, profit: true }];
  const COLORS = ['#334155', '#0ea5e9', '#6366f1', '#f59e0b', '#ec4899', '#94a3b8'];
  const biggest = [...mb.slices].sort((x, y) => y.perDelivery - x.perDelivery)[0];
  const marginProblems = diag.problems.filter((p) => ['import', 'operations', 'delivery', 'offer', 'acquisition', 'closing'].includes(p.key));
  return (
    <div className="space-y-4">
      <Card title="Où part ton prix de vente ?" subtitle={`Pour chaque livraison réussie (prix ${money(mb.price, c)}), en % du prix.`}>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} %`} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, _n, item) => [`${v} % · ${money((item.payload as { value: number }).value, c)}`, 'Part du prix']} />
              <Bar isAnimationActive={false} dataKey="pct" radius={[0, 6, 6, 0]}>
                {data.map((d, i) => <Cell key={i} fill={d.profit ? (d.value >= 0 ? '#059669' : '#e11d48') : COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-sm text-slate-700">Le poste qui absorbe le plus : <b>{biggest.label}</b> ({percent(biggest.pctOfPrice)} du prix, {money(biggest.perDelivery, c)} par livraison). Bénéfice net par livraison : <b className={mb.profitPerDelivery >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{money(mb.profitPerDelivery, c)}</b>.</p>
      </Card>
      <Card title="Diagnostic de marge" subtitle="Classé par impact financier estimé">
        {marginProblems.length ? (
          <ul className="space-y-2">
            {marginProblems.map((p) => (
              <li key={p.key} className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="flex justify-between gap-2"><b>{p.title}</b><span className="whitespace-nowrap font-semibold text-emerald-700">+{money(p.impact, c)}</span></div>
                <p className="mt-1 text-slate-600">« {p.explanation} {p.actions[0]}. »</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-600">Ta structure de coûts est équilibrée : aucun poste ne dépasse les niveaux de référence.</p>}
        <div className="mt-2"><Explain>Références utilisées : coût d’importation ≤ 35 % du prix, closing + livraison ≤ 20 % du prix, confirmation ≥ 75 %, livraison ≥ 80 %.</Explain></div>
      </Card>
    </div>
  );
}
