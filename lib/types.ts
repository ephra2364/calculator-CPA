// Modèle de données de CPA CALCULATOR.
// Toutes les valeurs monétaires sont dans la devise du produit (FCFA par défaut).
// Un champ laissé vide vaut `null` : le moteur ne l'invente jamais.

export type Num = number | null;

export type CostMode = 'import' | 'unit' | 'piece';
export type ClosingScope = 'all' | 'confirmed';

export interface Product {
  id: string;
  name: string;
  country: string;
  category: string;
  currency: string; // 'FCFA' par défaut
  price: Num; // prix de vente
  isExample?: boolean;

  // Coût du produit : soit le détail de l'importation, soit un coût unitaire direct (jamais les deux)
  costMode: CostMode;
  importCosts: {
    purchaseTotal: Num; // prix d'achat fournisseur (total du lot)
    transport: Num;
    customs: Num;
    transit: Num;
    other: Num;
    quantity: Num;
  };
  unitCostDirect: Num;
  pieceCost?: Num; // mode simple : prix d'achat de la pièce (usine)
  importPerPiece?: Num; // mode simple : importation par pièce

  // Frais opérationnels (par commande / livraison)
  closingCost: Num;
  closingScope: ClosingScope; // closing payé sur toutes les commandes reçues ou seulement les confirmées
  deliverySuccessCost: Num;
  deliveryFailCost: Num; // transport d'une livraison échouée
  returnCost: Num; // frais de retour d'un colis non livré
  otherVariableCost: Num; // autres frais variables par livraison réussie
  fixedCostsMonthly: Num; // charges fixes mensuelles (hors marge contributive)
  lostRatePct: Num; // % des colis échoués perdus / non revendables (0 = tout revient en stock)

  // Objectifs publicitaires
  targetCpa: Num; // CPA cible par commande reçue
  dailyBudget: Num;
  totalBudget: Num;

  // Hypothèses utilisées tant qu'aucun résultat réel n'est saisi
  assumedConfirmationPct: Num;
  assumedShippingPct: Num;
  assumedDeliveryPct: Num;

  createdAt: string;
  updatedAt: string;
}

export interface MetaMetrics {
  impressions: Num;
  cpm: Num; // saisi si impressions inconnues
  ctrAll: Num; // %
  ctrLink: Num; // %
  cpcLink: Num;
  linkClicks: Num;
  addToCart: Num;
  initiateCheckout: Num;
  metaPurchases: Num;
  metaCpa: Num;
  roas: Num;
  frequency: Num;
}

export interface Orders {
  received: Num;
  confirmed: Num;
  shipped: Num;
  delivered: Num;
  refused: Num;
  unreachable: Num;
  returned: Num;
  cancelled: Num;
}

export interface Period {
  id: string;
  productId: string;
  start: string; // AAAA-MM-JJ inclus
  end: string; // AAAA-MM-JJ inclus
  adSpend: Num;
  meta: MetaMetrics;
  orders: Orders;
  // Frais réellement appliqués sur la période (vide = frais du produit)
  closingCostOverride: Num;
  deliverySuccessCostOverride: Num;
  deliveryFailCostOverride: Num;
  fixedCosts: Num; // charges fixes imputées à cette période
  note: string;
  createdAt: string;
}

export interface AppData {
  version: 1;
  products: Product[];
  periods: Period[];
}
