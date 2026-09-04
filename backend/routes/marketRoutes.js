/**
 * marketRoutes.js
 *
 * Express router for market data endpoints. Kept separate from server.js
 * so route definitions stay modular and easy to extend (e.g. adding
 * /api/market/:symbol later) without bloating the app entrypoint.
 */

const express = require('express');
const marketDataService = require('../services/MarketDataService');

const router = express.Router();

/**
 * GET /api/market/latest
 * Instantly returns the current in-memory snapshot of all tracked tickers.
 * No I/O, no external calls — just reads whatever the background worker
 * last computed, so this is effectively O(1) and always fast.
 */
router.get('/latest', (req, res) => {
  try {
    const snapshot = marketDataService.getSnapshot();

    res.status(200).json({
      success: true,
      count: snapshot.length,
      data: snapshot,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[marketRoutes] Failed to build snapshot:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve market data at this time.',
    });
  }
});

/**
 * GET /api/market/:symbol
 * Bonus convenience endpoint for fetching a single ticker, e.g. /api/market/AAPL
 */
router.get('/:symbol', (req, res) => {
  const ticker = marketDataService.getTicker(req.params.symbol);

  if (!ticker) {
    return res.status(404).json({
      success: false,
      error: `Ticker '${req.params.symbol.toUpperCase()}' not found.`,
    });
  }

  res.status(200).json({ success: true, data: ticker });
});

module.exports = router;