'use client';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { Dashboard } from './Dashboard';
import { ProductsList } from './ProductsList';
import { ProductView, type Tab } from './ProductView';
import { emptyProduct } from '@/lib/factory';

type Route = { name: 'dashboard' } | { name: 'products' } | { name: 'product'; id: string; tab: Tab };

function parseHash(h: string): Route {
  const parts = h.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'produits') return { name: 'products' };
  if (parts[0] === 'p' && parts[1]) return { name: 'product', id: parts[1], tab: (parts[2] as Tab) || 'resume' };
  return { name: 'dashboard' };
}
function toHash(r: Route) {
  if (r.name === 'products') return '#/produits';
  if (r.name === 'product') return `#/p/${r.id}/${r.tab}`;
  return '#/';
}

export default function App() {
  const store = useStore();
  const [route, setRoute] = useState<Route>({ name: 'dashboard' });
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (r: Route) => { location.hash = toHash(r); setRoute(r); window.scrollTo(0, 0); };

  const product = route.name === 'product' ? store.data.products.find((p) => p.id === route.id) : undefined;
  const newProduct = () => {
    const p = emptyProduct({ name: 'Nouveau produit' });
    store.upsertProduct(p);
    go({ name: 'product', id: p.id, tab: 'infos' });
  };
  const nav = useMemo(() => [
    { key: 'dashboard', label: 'Tableau de bord', icon: '▦', active: route.name === 'dashboard', onClick: () => go({ name: 'dashboard' }) },
    { key: 'products', label: 'Mes produits', icon: '◫', active: route.name === 'products' || route.name === 'product', onClick: () => go({ name: 'products' }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [route]);

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 md:pb-10">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <button onClick={() => go({ name: 'dashboard' })} className="flex items-center gap-2 font-bold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-xs font-black text-white">CPA</span>
            <span className="hidden sm:inline">CPA CALCULATOR</span>
          </button>
          <nav className="ml-4 hidden gap-1 md:flex">
            {nav.map((n) => (
              <button key={n.key} onClick={n.onClick} className={`rounded-lg px-3 py-2 text-sm font-medium ${n.active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{n.label}</button>
            ))}
          </nav>
          <div className="flex-1" />
          <button onClick={newProduct} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">+ NOUVEAU PRODUIT</button>
        </div>
      </header>
      {store.saveError && (
        <div className="bg-rose-600 px-4 py-2 text-center text-sm text-white">Enregistrement impossible dans ce navigateur (navigation privée ou stockage plein). Exporte une sauvegarde.</div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-5">
        {!store.ready ? <div className="py-20 text-center text-slate-400">Chargement…</div>
          : route.name === 'dashboard' ? <Dashboard store={store} openProduct={(id, tab = 'resume') => go({ name: 'product', id, tab })} newProduct={newProduct} />
          : route.name === 'products' ? <ProductsList store={store} open={(id) => go({ name: 'product', id, tab: 'resume' })} newProduct={newProduct} />
          : product ? <ProductView key={product.id} store={store} product={product} tab={route.tab} setTab={(tab) => go({ name: 'product', id: product.id, tab })} back={() => go({ name: 'products' })} />
          : <div className="py-20 text-center text-slate-500">Produit introuvable. <button className="underline" onClick={() => go({ name: 'products' })}>Retour aux produits</button></div>}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {nav.map((n) => (
          <button key={n.key} onClick={n.onClick} className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${n.active ? 'text-slate-900' : 'text-slate-400'}`}>
            <span className="text-lg leading-none">{n.icon}</span>{n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
