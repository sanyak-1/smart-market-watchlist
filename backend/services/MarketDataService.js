/**
 * MarketDataService.js
 *
 * Resilient Market Data Provider with Circuit Breaker Architecture.
 * - Primary Source: Live Finnhub Quote API (polled concurrently every 15s)
 * - Fallback / Circuit Breaker: Honest Degradation (serves cached prices flagged as stale)
 * - Preserves complete compatibility with existing routes and frontends
 */
require('dotenv').config();

const SEED_TICKERS = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 227.50 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 172.30 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: 415.20 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 186.40 },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: 248.90 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 118.75 },
  { symbol: 'META', name: 'Meta Platforms Inc.', price: 502.10 },
  { symbol: 'NFLX', name: 'Netflix Inc.', price: 675.60 },
  { symbol: 'AMD', name: 'Advanced Micro Devices', price: 143.20 },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', price: 205.80 },
];

const POLL_INTERVAL_MS = 15000; // 15 seconds (10 tickers * 4 fetches/min = 40 calls/min, well inside 60/min free tier)
const FETCH_TIMEOUT_MS = 4000;  // 4s timeout per request before triggering fallback

class MarketDataService {
  constructor() {
    this.cache = {};
    this.isStale = false;
    this.consecutiveFailures = 0;
    this._intervalHandle = null;
    this.forceOutage = false; // Controls the simulated API failure

    this._seedCache();
    this.start();
  }

  _seedCache() {
    const now = new Date().toISOString();
    SEED_TICKERS.forEach(({ symbol, name, price }) => {
      this.cache[symbol] = {
        symbol,
        name,
        price: this._round(price),
        previousPrice: this._round(price),
        changePercent: 0,
        changeAmount: 0,
        lastSpike: false,
        isStale: false,
        updatedAt: now,
      };
    });
  }

  start() {
    if (this._intervalHandle) return;

    // Initial fetch immediately
    this._fetchBatch();

    // Background polling loop
    this._intervalHandle = setInterval(() => {
      this._fetchBatch();
    }, POLL_INTERVAL_MS);

    if (this._intervalHandle.unref) this._intervalHandle.unref();
  }

  stop() {
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }
  }

  /**
   * Fetch quotes for all tracked symbols concurrently with a hard timeout.
   */
  async _fetchBatch() {
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      console.warn('[MarketDataService] ⚠️ FINNHUB_API_KEY missing in .env. Serving cached baseline data.');
      this.isStale = true;
      this._markAllStale(true);
      return;
    }

    try {
      // Intercept the API call if the simulation toggle is active
      if (this.forceOutage) throw new Error("Simulated API Outage Activated");

      const symbols = Object.keys(this.cache);

      const fetchPromises = symbols.map(async (symbol) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`,
            { signal: controller.signal }
          );

          clearTimeout(timeoutId);

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }

          const data = await res.json();

          // Finnhub response: c = current price, d = change, dp = percent change, pc = previous close
          if (data && typeof data.c === 'number' && data.c > 0) {
            const currentEntry = this.cache[symbol];
            const previousPrice = data.pc || currentEntry.price;
            const currentPrice = data.c;
            const changeAmount = data.d !== undefined ? data.d : currentPrice - previousPrice;
            const changePercent = data.dp !== undefined ? data.dp : (changeAmount / previousPrice) * 100;

            this.cache[symbol] = {
              ...currentEntry,
              previousPrice: this._round(previousPrice),
              price: this._round(currentPrice),
              changeAmount: this._round(changeAmount),
              changePercent: this._round(changePercent, 3),
              lastSpike: Math.abs(changePercent) >= 2.0,
              isStale: false,
              updatedAt: new Date().toISOString(),
            };
          }
        } catch (tickerErr) {
          clearTimeout(timeoutId);
          throw tickerErr; // Bubble up to trigger circuit breaker
        }
      });

      await Promise.all(fetchPromises);

      // Successfully synced
      this.consecutiveFailures = 0;
      this.isStale = false;
      this._markAllStale(false);
      console.log(`[MarketDataService] ✅ Synced live prices from Finnhub (${new Date().toLocaleTimeString()})`);
    } catch (err) {
      this.consecutiveFailures += 1;
      this.isStale = true;
      this._markAllStale(true);

      console.error(
        `[MarketDataService] 🔴 Circuit Breaker: Upstream API call failed (${err.message}). Degrading gracefully — serving last known good cache.`
      );
    }
  }

  _markAllStale(staleFlag) {
    Object.keys(this.cache).forEach((sym) => {
      if (this.cache[sym]) {
        this.cache[sym].isStale = staleFlag;
      }
    });
  }

  // ----- Public Read API ----------------------------------------------------

  getSnapshot() {
    return Object.values(this.cache).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  getTicker(symbol) {
    if (!symbol) return null;
    return this.cache[symbol.toUpperCase()] || null;
  }

  getStatus() {
    return {
      status: this.isStale ? 'stale' : 'live',
      consecutiveFailures: this.consecutiveFailures,
      lastSync: new Date().toISOString(),
      isSimulating: this.forceOutage // Expose simulation status
    };
  }

  toggleOutage() {
    this.forceOutage = !this.forceOutage;
    return this.forceOutage;
  }

  _round(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}

module.exports = new MarketDataService();