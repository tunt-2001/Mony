import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase, type Transaction } from './lib/supabase';
import { periodLabel, periodRange, presetPeriod, previousPeriod, type Period } from './lib/period';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Transactions } from './components/Transactions';
import { PeriodFilter } from './components/PeriodFilter';
import { IconChart, IconList, IconSettings } from './components/Icons';
import { Settings } from './components/Settings';
import { findGaps, findTransfers, type Gap } from './lib/ledger';

type Tab = 'dashboard' | 'transactions';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <main className="center">
        <p>Thiếu cấu hình Supabase. Tạo file <code>.env</code> từ <code>.env.example</code> (xem README).</p>
      </main>
    );
  }
  if (!ready) return null;
  if (!session) return <Login />;
  return <Main />;
}

function Main() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [period, setPeriod] = useState<Period>(() => presetPeriod('month'));
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [prevTxs, setPrevTxs] = useState<Transaction[]>([]);
  const [transfers, setTransfers] = useState<Map<string, string | null>>(new Map());
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    const [prevStart] = periodRange(previousPeriod(period));
    const [start, end] = periodRange(period);
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .gte('occurred_at', prevStart)
      .lt('occurred_at', end)
      .order('occurred_at', { ascending: false });
    setLoading(false);
    if (error) return setError(error.message);
    setError(null);
    const all = data as Transaction[];
    // Compare instants, not strings: Postgres and JS format timestamps differently.
    const startMs = Date.parse(start);
    // Pair and chain over everything loaded, so a transfer or gap straddling the period start is still seen.
    setTransfers(findTransfers(all));
    setGaps(findGaps(all).filter((g) => Date.parse(g.next.occurred_at) >= startMs));
    setTxs(all.filter((t) => Date.parse(t.occurred_at) >= startMs));
    setPrevTxs(all.filter((t) => Date.parse(t.occurred_at) < startMs));
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  // New SMS may arrive while the PWA sits in the background.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">{tab === 'dashboard' ? 'Tổng quan' : 'Giao dịch'}</p>
          <h1>{periodLabel(period)}</h1>
        </div>
        <button className="icon-btn" aria-label="Cài đặt" onClick={() => setShowSettings(true)}>
          <IconSettings />
        </button>
      </header>

      <PeriodFilter value={period} onChange={setPeriod} />

      {error && <p className="error">{error}</p>}

      <main className="content">
        {loading ? (
          <p className="empty">Đang tải…</p>
        ) : tab === 'dashboard' ? (
          <Dashboard period={period} txs={txs} prevTxs={prevTxs} transfers={transfers} gaps={gaps} onChange={load} />
        ) : (
          <Transactions txs={txs} transfers={transfers} onChange={load} />
        )}
      </main>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}

      <nav className="tabbar">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
          <IconChart />
          <span>Tổng quan</span>
        </button>
        <button className={tab === 'transactions' ? 'active' : ''} onClick={() => setTab('transactions')}>
          <IconList />
          <span>Giao dịch</span>
        </button>
      </nav>
    </div>
  );
}
