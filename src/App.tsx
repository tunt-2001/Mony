import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase, type Transaction } from './lib/supabase';
import { PRESETS, periodLabel, periodRange, presetPeriod, previousPeriod, type Period } from './lib/period';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Transactions } from './components/Transactions';
import { PeriodFilter } from './components/PeriodFilter';
import { IconChart, IconList, IconSettings } from './components/Icons';
import { Settings } from './components/Settings';
import { findGaps, findTransfers } from './lib/ledger';
import { monthSpent, vnMonth, vnMonthStart } from '../supabase/functions/_shared/alerts.ts';
import { loadSettingsData, type SettingsData } from './lib/userSettings';
import { registerServiceWorker } from './lib/push';
import { clearSnapshot, readSnapshot, storedUserId, writeSnapshot } from './lib/snapshot';
import type { Budget } from './components/LimitCard';

registerServiceWorker();

/** This calendar month against the limit, whatever period the filter shows. Null when no limit is set. */
async function loadBudget(monthly_limit: number | null): Promise<Budget | null> {
  if (!monthly_limit) return null;
  const now = new Date();
  // A week before the month start, so a transfer straddling it still pairs up.
  const from = new Date(Date.parse(vnMonthStart(now)) - 7 * 24 * 3600_000).toISOString();
  const { data } = await supabase
    .from('transactions')
    .select('id, occurred_at, amount, balance, bank, account, transfer')
    .gte('occurred_at', from);
  const month = vnMonth(now.toISOString());
  return { limit: monthly_limit, spent: monthSpent(data ?? [], month), month };
}

type Tab = 'dashboard' | 'transactions';

const rangeKey = (p: Period) => `${p.from}|${p.to}`;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  // Launch without waiting for auth (it may need a token refresh over the network) when this
  // device already holds a session and a snapshot for that same user. Login still shows if the session turns out dead.
  const [optimisticUser] = useState(() => {
    const id = storedUserId();
    return id && readSnapshot()?.userId === id ? id : null;
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') clearSnapshot();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <main className="center">
        <p>Thiếu cấu hình Supabase. Tạo file <code>.env</code> từ <code>.env.example</code> (xem README).</p>
      </main>
    );
  }
  if (!ready) return optimisticUser ? <Main userId={optimisticUser} /> : null;
  if (!session) return <Login />;
  return <Main userId={session.user.id} />;
}

function Main({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>('dashboard');
  // A notification may open the app on a given period, e.g. the monthly report on "Tháng trước".
  const [period, setPeriod] = useState<Period>(() => {
    const asked = new URLSearchParams(location.search).get('period');
    if (asked) history.replaceState(null, '', '/');
    const preset = PRESETS.find((p) => p.id === asked)?.id;
    return presetPeriod(preset && preset !== 'custom' ? preset : 'month');
  });
  const defaultRange = rangeKey(presetPeriod('month'));
  const [snap] = useState(() => {
    const s = readSnapshot();
    return s?.userId === userId ? s : null;
  });
  const cached = snap?.range === defaultRange ? snap : null;

  // Everything loaded for the period and the one before it, and which period that was.
  const [all, setAll] = useState<Transaction[]>(cached?.all ?? []);
  const [loadedRange, setLoadedRange] = useState<string | null>(cached ? defaultRange : null);
  const [settingsData, setSettingsData] = useState<SettingsData | null>(snap?.settings ?? null);
  const [otherBudget, setOtherBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const request = useRef(0);

  const [start] = periodRange(period);
  // Compare instants, not strings: Postgres and JS format timestamps differently.
  const startMs = Date.parse(start);
  const view = useMemo(
    () => ({
      // Pair and chain over everything loaded, so a transfer or gap straddling the period start is still seen.
      transfers: findTransfers(all),
      gaps: findGaps(all).filter((g) => Date.parse(g.next.occurred_at) >= startMs),
      txs: all.filter((t) => Date.parse(t.occurred_at) >= startMs),
      prevTxs: all.filter((t) => Date.parse(t.occurred_at) < startMs),
    }),
    [all, startMs],
  );

  const limit = settingsData?.prefs.monthly_limit ?? null;
  const budget = useMemo<Budget | null>(() => {
    if (!limit) return null;
    // Viewing this month: its transactions are already loaded, no extra query.
    if (loadedRange === defaultRange) {
      const month = vnMonth(new Date().toISOString());
      return { limit, spent: monthSpent(all, month), month };
    }
    return otherBudget;
  }, [limit, loadedRange, defaultRange, all, otherBudget]);

  const load = useCallback(async () => {
    const id = ++request.current;
    setRefreshing(true);
    const key = rangeKey(period);
    // Prefetched so the Settings sheet opens already filled in.
    loadSettingsData().then((d) => {
      if (id !== request.current) return;
      setSettingsData(d);
      if (key !== defaultRange) loadBudget(d.prefs.monthly_limit).then((b) => id === request.current && setOtherBudget(b));
    });
    const [prevStart] = periodRange(previousPeriod(period));
    const [, end] = periodRange(period);
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .gte('occurred_at', prevStart)
      .lt('occurred_at', end)
      .order('occurred_at', { ascending: false });
    if (id !== request.current) return; // A newer load (other period) is in flight.
    setLoading(false);
    setRefreshing(false);
    if (error) return setError(error.message);
    setError(null);
    setAll(data as Transaction[]);
    setLoadedRange(key);
  }, [period, defaultRange]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the snapshot of the default view current for the next launch.
  useEffect(() => {
    if (loadedRange === defaultRange) writeSnapshot({ userId, range: defaultRange, all, settings: settingsData });
  }, [userId, loadedRange, defaultRange, all, settingsData]);

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
          <p className="eyebrow">
            {tab === 'dashboard' ? 'Tổng quan' : 'Giao dịch'}
            {refreshing && !loading && <span className="sync-dot" role="status" aria-label="Đang cập nhật" />}
          </p>
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
          <Dashboard
            period={period}
            txs={view.txs}
            prevTxs={view.prevTxs}
            transfers={view.transfers}
            gaps={view.gaps}
            budget={budget}
            onChange={load}
          />
        ) : (
          <Transactions txs={view.txs} transfers={view.transfers} onChange={load} />
        )}
      </main>

      {showSettings && (
        <Settings
          initial={settingsData}
          onClose={() => {
            setShowSettings(false);
            load(); // The limit may have changed.
          }}
        />
      )}

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
