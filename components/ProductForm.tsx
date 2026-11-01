'use client';
import type { Product } from '@/lib/types';
import { unitCost } from '@/lib/engine';
import { money } from '@/lib/format';
import { Banner, Button, Card, Explain, Grid, NumField, Segmented, TextField } from './ui';

const CURRENCIES = ['FCFA', 'GNF', 'CDF', 'NGN', 'GHS', 'MAD', 'EUR', 'USD'];

export function ProductForm({ product: p, onChange, periodsCount, goResults }: { product: Product; onChange: (p: Product) => void; periodsCount: number; goResults: () => void }) {
  const set = (patch: Partial<Product>) => onChange({ ...p, ...patch });
  const setImp = (patch: Partial<Product['importCosts']>) => set({ importCosts: { ...p.importCosts, ...patch } });
  const uc = unitCost(p);
  const cur = p.currency || 'FCFA';
  return (
    <div className="space-y-4">
      <Banner tone="gray">Les modifications sont enregistrées automatiquement. Laisse vide ce que tu ne connais pas : rien n’est inventé.</Banner>
      <Card title="Informations générales">
        <Grid>
          <TextField label="Nom du produit" value={p.name} onChange={(v) => set({ name: v })} />
          <TextField label="Catégorie" value={p.category} onChange={(v) => set({ category: v })} placeholder="Ex. Électronique" />
          <TextField label="Pays de vente" value={p.country} onChange={(v) => set({ country: v })} />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Devise</span>
            <select className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base" value={cur} onChange={(e) => set({ currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <NumField label="Prix de vente" value={p.price} onChange={(v) => set({ price: v })} suffix={cur} min={0} />
        </Grid>
      </Card>

      <Card title="Coût du produit" subtitle="Choisis UNE méthode : les deux ne sont jamais additionnées.">
        <Segmented value={p.costMode} onChange={(v) => set({ costMode: v })} options={[['import', 'Détail de l’importation'], ['unit', 'Coût unitaire déjà calculé']]} />
        <div className="mt-4">
          {p.costMode === 'import' ? (
            <Grid cols={3}>
              <NumField label="Prix d’achat fournisseur (total)" value={p.importCosts.purchaseTotal} onChange={(v) => setImp({ purchaseTotal: v })} suffix={cur} min={0} />
              <NumField label="Transport international" value={p.importCosts.transport} onChange={(v) => setImp({ transport: v })} suffix={cur} min={0} />
              <NumField label="Douane" value={p.importCosts.customs} onChange={(v) => setImp({ customs: v })} suffix={cur} min={0} />
              <NumField label="Transit" value={p.importCosts.transit} onChange={(v) => setImp({ transit: v })} suffix={cur} min={0} />
              <NumField label="Autres frais d’importation" value={p.importCosts.other} onChange={(v) => setImp({ other: v })} suffix={cur} min={0} />
              <NumField label="Quantité importée" value={p.importCosts.quantity} onChange={(v) => setImp({ quantity: v })} suffix="unités" min={0} />
            </Grid>
          ) : (
            <Grid><NumField label="Coût complet par unité" value={p.unitCostDirect} onChange={(v) => set({ unitCostDirect: v })} suffix={cur} min={0} hint="Achat + transport + douane + transit, déjà réparti par unité" /></Grid>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          {p.costMode === 'import' && <div><div className="text-slate-500">Coût total d’importation</div><div className="font-semibold">{money(uc.importTotal, cur)}</div></div>}
          <div><div className="text-slate-500">Coût complet par unité</div><div className="font-semibold">{money(uc.value, cur)}</div></div>
        </div>
      </Card>

      <Card title="Frais opérationnels">
        <Grid cols={3}>
          <NumField label="Confirmation / closing par commande" value={p.closingCost} onChange={(v) => set({ closingCost: v })} suffix={cur} min={0} />
          <NumField label="Livraison réussie" value={p.deliverySuccessCost} onChange={(v) => set({ deliverySuccessCost: v })} suffix={cur} min={0} />
          <NumField label="Livraison échouée (transport)" value={p.deliveryFailCost} onChange={(v) => set({ deliveryFailCost: v })} suffix={cur} min={0} />
          <NumField label="Frais de retour d’un colis" value={p.returnCost} onChange={(v) => set({ returnCost: v })} suffix={cur} min={0} />
          <NumField label="Autres frais variables" value={p.otherVariableCost} onChange={(v) => set({ otherVariableCost: v })} suffix={cur} min={0} hint="Par livraison réussie (emballage, commission…)" />
          <NumField label="Charges fixes mensuelles" value={p.fixedCostsMonthly} onChange={(v) => set({ fixedCostsMonthly: v })} suffix={cur} min={0} hint="Pour information ; les charges imputées se saisissent par période" />
          <NumField label="Colis non livrés perdus / non revendables" value={p.lostRatePct} onChange={(v) => set({ lostRatePct: v })} suffix="%" min={0} hint="0 % = tout revient en stock (le produit n’est pas une perte)" />
        </Grid>
        <div className="mt-4">
          <Segmented label="Les frais de closing s’appliquent à" value={p.closingScope} onChange={(v) => set({ closingScope: v })}
            options={[['all', 'Toutes les commandes reçues'], ['confirmed', 'Les commandes confirmées']]} />
        </div>
      </Card>

      <Card title="Objectifs publicitaires">
        <Grid cols={3}>
          <NumField label="CPA cible souhaité" value={p.targetCpa} onChange={(v) => set({ targetCpa: v })} suffix={cur} min={0} hint="Par commande reçue" />
          <NumField label="Budget journalier" value={p.dailyBudget} onChange={(v) => set({ dailyBudget: v })} suffix={cur} min={0} />
          <NumField label="Budget total" value={p.totalBudget} onChange={(v) => set({ totalBudget: v })} suffix={cur} min={0} />
        </Grid>
      </Card>

      <Card title="Taux prévisionnels" subtitle="Utilisés uniquement tant qu’aucun résultat réel n’est saisi (calcul du CPA break-even dès la création du produit).">
        <Grid cols={3}>
          <NumField label="Taux de confirmation prévu" value={p.assumedConfirmationPct} onChange={(v) => set({ assumedConfirmationPct: v })} suffix="%" min={0} />
          <NumField label="Taux d’expédition prévu" value={p.assumedShippingPct} onChange={(v) => set({ assumedShippingPct: v })} suffix="%" min={0} hint="Expédiées ÷ confirmées" />
          <NumField label="Taux de livraison prévu" value={p.assumedDeliveryPct} onChange={(v) => set({ assumedDeliveryPct: v })} suffix="%" min={0} hint="Livrées ÷ expédiées" />
        </Grid>
        <div className="mt-2"><Explain>Dès qu’une période avec des commandes est saisie, les taux réels remplacent ces hypothèses.</Explain></div>
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" onClick={goResults}>{periodsCount ? 'Voir les résultats' : 'Étape suivante : saisir mes résultats →'}</Button>
      </div>
    </div>
  );
}
