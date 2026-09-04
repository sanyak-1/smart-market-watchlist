'use client';

import { useCallback, useEffect, useState } from 'react';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { Plus, X, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'] });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600'] });

const SESSION_STORAGE_KEY = 'smw_session_id';
const POLL_INTERVAL_MS = 5000;

interface MarketTicker {
  symbol: string;
  name: string;
  price: number;
  previousPrice: number;
  changePercent: number;
  changeAmount: number;
  lastSpike: boolean;
  updatedAt: string;
}

interface WatchlistChange {
  symbol: string;
  currentPrice: number | null;
  lastKnownPrice: number | null;
  percentChange: number | null;
  isMeaningfulChange: boolean;
  note?: string;
}

type ConnectionState = 'connecting' | 'live' | 'offline';

function loadOrCreateSessionId(): string {
  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `sess-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

  window.localStorage.setItem(SESSION_STORAGE_KEY, generated);
  return generated;
}

function formatPrice(value: number | null): string {
  return value == null ? '—' : `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  if (value == null) return 'new';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export default function Page() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketTicker[]>([]);
  const [changes, setChanges] = useState<WatchlistChange[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [pendingSymbol, setPendingSymbol] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [isSimulatingOutage, setIsSimulatingOutage] = useState(false);

  useEffect(() => {
    setSessionId(loadOrCreateSessionId());
  }, []);

  const fetchAll = useCallback(async () => {
    if (!sessionId) return;

    try {
      const [marketRes, deltaRes] = await Promise.all([
        fetch('/api/market/latest'),
        fetch(`/api/watchlist/${sessionId}/delta`),
      ]);

      if (!marketRes.ok) {
        throw new Error(`Market feed returned ${marketRes.status}.`);
      }
      const marketJson = await marketRes.json();
      const marketArray = Array.isArray(marketJson) ? marketJson : (marketJson.data ?? []);
      setMarket(marketArray);

      if (deltaRes.status === 404) {
        setChanges([]);
      } else if (!deltaRes.ok) {
        throw new Error(`Watchlist feed returned ${deltaRes.status}.`);
      } else {
        const deltaJson = await deltaRes.json();
        setChanges(deltaJson.data?.changes ?? deltaJson.changes ?? []);
      }

      setError(null);
      setConnection('live');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Lost contact with the market service.'
      );
      setConnection('offline');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    fetchAll();
    const id = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sessionId, fetchAll]);

  const toggleOutage = async () => {
    await fetch('/api/market/simulate-outage', { method: 'POST' });
    setIsSimulatingOutage(!isSimulatingOutage);
  };

  async function handleWatchlistAction(symbol: string, action: 'add' | 'remove') {
    if (!sessionId) return;
    setPendingSymbol(symbol);
    try {
      const res = await fetch('/api/watchlist/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, symbol, action }),
      });
      if (!res.ok) throw new Error(`Could not ${action} ${symbol}.`);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your watchlist.');
    } finally {
      setPendingSymbol(null);
    }
  }

  async function handleClearAlerts() {
    if (!sessionId) return;
    setAcknowledging(true);
    try {
      const res = await fetch(`/api/watchlist/${sessionId}/acknowledge`, { method: 'POST' });
      if (!res.ok) throw new Error('Could not clear alerts.');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear alerts.');
    } finally {
      setAcknowledging(false);
    }
  }

  if (!sessionId) {
    return (
      <main className={`flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0e14] to-black text-slate-400 ${display.className}`}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-400"></div>
          <p className="text-sm tracking-widest">INITIALIZING SECURE SESSION...</p>
        </div>
      </main>
    );
  }

  const watchlistSymbols = changes.map((c) => c.symbol);
  const watchlistRows = changes.map((change) => ({
    ...change,
    name: market.find((m) => m.symbol === change.symbol)?.name ?? change.symbol,
  }));
  const alerts = changes.filter((c) => c.isMeaningfulChange);
  const availableToAdd = market.filter((m) => !watchlistSymbols.includes(m.symbol));

  return (
    <main className={`min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0e14] to-black text-slate-200 ${display.className}`}>
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-white/10 pb-8">
          <div>
            <h1 className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-4xl font-bold text-transparent drop-shadow-sm">
              Signal
            </h1>
            <p className="mt-2 max-w-md text-sm text-slate-400">
              Track high-volume tickers with edge-case resilience. Engineered for meaningful market movements.
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleOutage}
                className={`relative overflow-hidden px-4 py-1.5 text-xs font-semibold rounded-lg border transition-all duration-300 ${
                  isSimulatingOutage 
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.15)] hover:bg-rose-500/20' 
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20 hover:text-white'
                }`}
              >
                {isSimulatingOutage ? 'Stop Simulation' : 'Simulate API Outage'}
              </button>

              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border shadow-lg backdrop-blur-md ${mono.className} ${
                connection === 'live' && !isSimulatingOutage
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/10'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-amber-500/10'
              }`}>
                <div className={`w-2 h-2 rounded-full ${connection === 'live' && !isSimulatingOutage ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]'}`} />
                {connection === 'live' && !isSimulatingOutage ? 'LIVE DATA' : 'CIRCUIT BREAKER'}
              </div>
            </div>
            <p className={`text-[11px] text-slate-500/80 uppercase tracking-widest ${mono.className}`}>
              Session ID // {sessionId.slice(0, 8)}
            </p>
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div className="mt-8 flex items-center justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.1)] backdrop-blur-md">
            <span className="font-medium">{error}</span>
            <button
              onClick={fetchAll}
              className="flex shrink-0 items-center gap-2 rounded-md bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/30 hover:text-rose-100"
            >
              <RefreshCw size={14} />
              Retry Connection
            </button>
          </div>
        )}

        {/* "Since You Left" spotlight */}
        {alerts.length > 0 && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-transparent p-6 shadow-[0_0_30px_rgba(245,158,11,0.05)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-amber-400 flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </span>
                  Meaningful Movements
                </h2>
                <p className="mt-1 text-sm text-amber-200/70">
                  {alerts.length} {alerts.length === 1 ? 'ticker has' : 'tickers have'} swung by more than 2% since your last review.
                </p>
              </div>
              <button
                onClick={handleClearAlerts}
                disabled={acknowledging}
                className="shrink-0 rounded-lg bg-amber-500/20 px-5 py-2.5 text-sm font-bold text-amber-300 border border-amber-500/30 transition-all hover:bg-amber-500/30 hover:shadow-[0_0_15px_rgba(245,158,11,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {acknowledging ? 'Clearing...' : 'Acknowledge Deltas'}
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-4">
              {alerts.map((alert) => {
                const positive = (alert.percentChange ?? 0) >= 0;
                return (
                  <div
                    key={alert.symbol}
                    className="flex min-w-[200px] items-center justify-between gap-6 rounded-xl border border-white/5 bg-black/40 p-4 shadow-inner"
                  >
                    <div>
                      <p className="text-lg font-bold text-white">{alert.symbol}</p>
                      <p className={`text-sm text-slate-400 ${mono.className}`}>
                        {formatPrice(alert.currentPrice)}
                      </p>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-bold tabular-nums ${mono.className} ${
                        positive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {positive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      {formatPercent(alert.percentChange)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Watchlist manager */}
        <section className="mt-12">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-bold text-white tracking-wide">Active Portfolio</h2>
            <span className={`rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-300 ${mono.className}`}>
              {watchlistRows.length} TRACKED
            </span>
          </div>

          {isLoading ? (
            <div className="mt-5 space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl border border-white/5 bg-white/[0.02]" />
              ))}
            </div>
          ) : watchlistRows.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-white/20 bg-white/[0.02] px-6 py-12 text-center text-sm font-medium text-slate-400 backdrop-blur-sm">
              Your dashboard is empty. Add a ticker below to initialize tracking.
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] shadow-2xl backdrop-blur-xl">
              <div className="divide-y divide-white/5">
                {watchlistRows.map((row) => {
                  const positive = (row.percentChange ?? 0) >= 0;
                  const hasChange = row.percentChange != null;
                  return (
                    <div key={row.symbol} className="group flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-white/[0.04]">
                      <div className="flex min-w-0 items-center gap-4">
                        <span className="text-lg font-bold text-white">{row.symbol}</span>
                        <span className="truncate text-sm font-medium text-slate-500">{row.name}</span>
                      </div>

                      <div className="flex items-center gap-8">
                        <span className={`text-base font-medium text-slate-200 tabular-nums ${mono.className}`}>
                          {formatPrice(row.currentPrice)}
                        </span>
                        <span
                          className={`w-20 text-right text-base font-bold tabular-nums ${mono.className} ${
                            !hasChange ? 'text-slate-500' : positive ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]' : 'text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.3)]'
                          }`}
                        >
                          {formatPercent(row.percentChange)}
                        </span>
                        <button
                          onClick={() => handleWatchlistAction(row.symbol, 'remove')}
                          disabled={pendingSymbol === row.symbol}
                          aria-label={`Remove ${row.symbol} from watchlist`}
                          className="rounded-lg p-2 text-slate-500 opacity-0 transition-all group-hover:opacity-100 hover:bg-rose-500/20 hover:text-rose-400 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-40"
                        >
                          <X size={18} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Add-to-watchlist */}
        <section className="mb-20 mt-12">
          <h2 className="px-1 text-xl font-bold text-white tracking-wide">Market Universe</h2>

          {isLoading ? (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl border border-white/5 bg-white/[0.02]" />
              ))}
            </div>
          ) : availableToAdd.length === 0 ? (
            <p className="mt-5 px-1 text-sm font-medium text-slate-500">Maximum coverage achieved. All available tickers are currently tracked.</p>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {availableToAdd.map((stock) => (
                <button
                  key={stock.symbol}
                  onClick={() => handleWatchlistAction(stock.symbol, 'add')}
                  disabled={pendingSymbol === stock.symbol}
                  className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/50 hover:bg-white/10 hover:shadow-[0_8px_20px_rgba(52,211,153,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-emerald-500/0 to-emerald-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                  <span className="relative z-10 min-w-0">
                    <span className="block text-lg font-bold text-slate-200 transition-colors group-hover:text-white">{stock.symbol}</span>
                    <span className="block truncate text-xs font-medium text-slate-500 transition-colors group-hover:text-slate-300">{stock.name}</span>
                  </span>
                  <div className="relative z-10 rounded-full bg-white/5 p-2 text-slate-400 transition-all duration-300 group-hover:scale-110 group-hover:bg-emerald-500/20 group-hover:text-emerald-400">
                    <Plus size={16} strokeWidth={2.5} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}