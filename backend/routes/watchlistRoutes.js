/**
 * routes/watchlistRoutes.js
 *
 * The "Delta Engine" — tracks what changed in a user's watchlist since
 * they last checked it, using MongoDB to persist per-session state and
 * MarketDataService (in-memory, from marketRoutes) as the live price source.
 *
 * Flow for a typical client:
 *   1. POST /api/watchlist/update        -> add/remove tickers
 *   2. GET  /api/watchlist/:id/delta     -> "what changed since I last looked?"
 *   3. POST /api/watchlist/:id/acknowledge -> "ok, I've seen it, reset baseline"
 */

const express = require('express');
const UserSession = require('../models/UserSession');
const marketDataService = require('../services/MarketDataService');

const router = express.Router();

const MEANINGFUL_CHANGE_THRESHOLD_PCT = 2; // absolute % change flagged as meaningful

// ----- Helpers -------------------------------------------------------

/**
 * Find a session by sessionId, or null. Centralized so every route
 * validates/looks up the same way.
 */
async function findSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null;
  return UserSession.findOne({ sessionId: sessionId.trim() });
}

/**
 * Build a fresh lastKnownPrices Map from MarketDataService for a given
 * list of symbols. Symbols MarketDataService doesn't recognize are
 * simply skipped (rather than throwing), since the mock service is a
 * fixed universe of 10 tickers.
 */
function buildPriceSnapshot(symbols) {
  const snapshot = new Map();
  symbols.forEach((symbol) => {
    const ticker = marketDataService.getTicker(symbol);
    if (ticker) {
      snapshot.set(symbol.toUpperCase(), ticker.price);
    }
  });
  return snapshot;
}

// ----- POST /api/watchlist/update -------------------------------------

/**
 * Adds or removes a ticker symbol from a session's watchlist.
 * Body: { sessionId: string, symbol: string, action: 'add' | 'remove' }
 *
 * Upserts the session if it doesn't exist yet — a brand new sessionId
 * (freshly generated client-side) should "just work" on its first call
 * rather than requiring a separate "create session" step.
 */
router.post('/update', async (req, res) => {
  try {
    const { sessionId, symbol, action } = req.body || {};

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ success: false, error: 'sessionId is required.' });
    }
    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({ success: false, error: 'symbol is required.' });
    }
    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({ success: false, error: "action must be 'add' or 'remove'." });
    }

    const normalizedSymbol = symbol.toUpperCase().trim();

    // Optional but helpful: warn (not block) if the symbol isn't one
    // MarketDataService tracks, since delta lookups for it will always
    // come back empty.
    const knownTicker = marketDataService.getTicker(normalizedSymbol);
    if (!knownTicker && action === 'add') {
      console.warn(`[watchlistRoutes] '${normalizedSymbol}' is not tracked by MarketDataService.`);
    }

    const update =
      action === 'add'
        ? { $addToSet: { watchlist: normalizedSymbol } } // no duplicates
        : { $pull: { watchlist: normalizedSymbol } };

    const session = await UserSession.findOneAndUpdate(
      { sessionId: sessionId.trim() },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        watchlist: session.watchlist,
      },
    });
  } catch (err) {
    console.error('[watchlistRoutes] /update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update watchlist.' });
  }
});

// ----- GET /api/watchlist/:sessionId/delta -----------------------------

/**
 * The core Delta Engine. For every symbol in the session's watchlist,
 * compares the current MarketDataService price against the price that
 * was recorded the last time the session acknowledged its watchlist,
 * and flags moves greater than MEANINGFUL_CHANGE_THRESHOLD_PCT.
 */
router.get('/:sessionId/delta', async (req, res) => {
  try {
    const session = await findSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found.' });
    }

    if (session.watchlist.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          sessionId: session.sessionId,
          lastViewedAt: session.lastViewedAt,
          changes: [],
        },
        message: 'Watchlist is empty.',
      });
    }

    const changes = session.watchlist.map((symbol) => {
      const currentTicker = marketDataService.getTicker(symbol);

      // Symbol is on the watchlist but MarketDataService doesn't know it
      // (shouldn't normally happen, but don't let it crash the response).
      if (!currentTicker) {
        return {
          symbol,
          currentPrice: null,
          lastKnownPrice: null,
          percentChange: null,
          isMeaningfulChange: false,
          note: 'No live price available for this symbol.',
        };
      }

      const currentPrice = currentTicker.price;
      const lastKnownPrice = session.lastKnownPrices.get(symbol);

      // First time this symbol is being seen (never acknowledged) —
      // there's no baseline yet, so we can't compute a meaningful delta.
      if (lastKnownPrice === undefined || lastKnownPrice === null) {
        return {
          symbol,
          currentPrice,
          lastKnownPrice: null,
          percentChange: null,
          isMeaningfulChange: false,
          note: 'No baseline yet — acknowledge to start tracking changes.',
        };
      }

      const percentChange = ((currentPrice - lastKnownPrice) / lastKnownPrice) * 100;
      const isMeaningfulChange = Math.abs(percentChange) > MEANINGFUL_CHANGE_THRESHOLD_PCT;

      return {
        symbol,
        currentPrice,
        lastKnownPrice,
        percentChange: Math.round(percentChange * 100) / 100,
        isMeaningfulChange,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        lastViewedAt: session.lastViewedAt,
        changes,
      },
    });
  } catch (err) {
    console.error('[watchlistRoutes] /delta error:', err);
    res.status(500).json({ success: false, error: 'Failed to compute delta.' });
  }
});

// ----- POST /api/watchlist/:sessionId/acknowledge -----------------------

/**
 * Marks the watchlist as "seen": resets lastViewedAt to now and
 * overwrites lastKnownPrices with a fresh snapshot from MarketDataService,
 * establishing the new baseline for the next delta computation.
 */
router.post('/:sessionId/acknowledge', async (req, res) => {
  try {
    const session = await findSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found.' });
    }

    session.lastViewedAt = new Date();
    session.lastKnownPrices = buildPriceSnapshot(session.watchlist);

    await session.save();

    res.status(200).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        lastViewedAt: session.lastViewedAt,
        lastKnownPrices: Object.fromEntries(session.lastKnownPrices),
      },
    });
  } catch (err) {
    console.error('[watchlistRoutes] /acknowledge error:', err);
    res.status(500).json({ success: false, error: 'Failed to acknowledge watchlist.' });
  }
});

module.exports = router;