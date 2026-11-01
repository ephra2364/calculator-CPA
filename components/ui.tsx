'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { parseNum } from '@/lib/format';
import type { Num } from '@/lib/types';

export type Tone = 'green' | 'orange' | 'red' | 'gray' | 'neutral' | 'blue';
const toneText: Record<Tone, string> = {
  green: 'text-emerald-700', orange: 'text-amber-700', red: 'text-rose-700', gray: 'text-slate-500', neutral: 'text-slate-900', blue: 'text-sky-700'
};
const toneBg: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200', orange: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-rose-50 text-rose-800 ring-rose-200', gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  neutral: 'bg-white text-slate-800 ring-slate-200', blue: 'bg-sky-50 text-sky-800 ring-sky-200'
};

export function Card({ title, subtitle, children, right, className = '' }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = 'neutral', big }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; big?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 font-semibold tracking-tight ${big ? 'text-2xl' : 'text-lg'} ${toneText[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs leading-snug text-slate-500">{hint}</div>}
    </div>
  );
}

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${toneBg[tone]}`}>{children}</span>;
}

export function Banner({ tone, title, children }: { tone: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`rounded-xl px-4 py-3 text-sm ring-1 ${toneBg[tone]}`}>
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
    </div>
  );
}

export function NumField({ label, value, onChange, suffix, hint, placeholder, min }: { label: string; value: Num; onChange: (v: Num) => void; suffix?: string; hint?: string; placeholder?: string; min?: number }) {
  const [txt, setTxt] = useState(value == null ? '' : String(value));
  useEffect(() => {
    if (parseNum(txt) !== value) setTxt(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const n = parseNum(txt);
  const invalid = txt.trim() !== '' && n == null;
  const negative = min != null && n != null && n < min;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <div className={`flex items-center rounded-xl border bg-white focus-within:ring-2 focus-within:ring-slate-900/20 ${invalid || negative ? 'border-rose-400' : 'border-slate-300'}`}>
        <input
          inputMode="decimal"
          className="w-full min-w-0 rounded-xl bg-transparent px-3 py-2.5 text-base outline-none"
          value={txt}
          placeholder={placeholder ?? '—'}
          onChange={(e) => { setTxt(e.target.value); const v = parseNum(e.target.value); if (e.target.value.trim() === '' || v != null) onChange(v); }}
        />
        {suffix && <span className="pr-3 text-sm text-slate-500">{suffix}</span>}
      </div>
      {(hint || invalid || negative) && <span className={`mt-1 block text-xs ${invalid || negative ? 'text-rose-600' : 'text-slate-500'}`}>{invalid ? 'Nombre invalide' : negative ? 'La valeur ne peut pas être négative' : hint}</span>}
    </label>
  );
}

export function TextField({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input type={type} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-slate-900/20" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label?: string }) {
  return (
    <div>
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {options.map(([v, l]) => (
          <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${value === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function Button({ children, onClick, variant = 'secondary', type = 'button', small, disabled }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; type?: 'button' | 'submit'; small?: boolean; disabled?: boolean }) {
  const v = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800',
    secondary: 'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50',
    danger: 'bg-white text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50',
    ghost: 'text-slate-600 hover:bg-slate-100'
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition disabled:opacity-50 ${small ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm'} ${v}`}>{children}</button>
  );
}

export function Hypotheses({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <details className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
      <summary className="cursor-pointer font-medium text-slate-700">Hypothèses de calcul ({items.length})</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </details>
  );
}

export function Missing({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <Banner tone="gray" title="Données manquantes pour certains calculs">
      <ul className="list-disc pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </Banner>
  );
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' }[cols];
  return <div className={`grid gap-3 ${c}`}>{children}</div>;
}

export function Explain({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-slate-500">{children}</p>;
}
