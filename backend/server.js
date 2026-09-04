/**
 * server.js
 *
 * Express entrypoint for the Smart Market Watchlist backend.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const marketRoutes = require('./routes/marketRoutes');
const watchlistRoutes = require('./routes/watchlistRoutes');

const app = express();
const PORT = 5000;

// ----- Global middleware --------------------------------------------------
app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ----- Routes --------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    service: 'Smart Market Watchlist API',
    status: 'ok',
    endpoints: [
      'GET /api/market/latest',
      'GET /api/market/:symbol',
      'POST /api/watchlist/update',
      'GET /api/watchlist/:sessionId/delta',
      'POST /api/watchlist/:sessionId/acknowledge',
    ],
  });
});

app.use('/api/market', marketRoutes);
app.use('/api/watchlist', watchlistRoutes);

// --- SIMULATE OUTAGE ENDPOINT ---
app.post('/api/market/simulate-outage', (req, res) => {
  const marketService = require('./services/MarketDataService');
  const isOutageActive = marketService.toggleOutage();
  res.json({ forceOutage: isOutageActive });
});

// ----- 404 handler -----------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found.' });
});

// ----- Centralized error handler ----------------------------------------
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

// ----- Process-level safety nets ----------------------------------------
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
});

// ----- Start server -----------------------------------------------------
async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error('Fatal: could not connect to MongoDB. Exiting.');
    process.exit(1);
  }
  
  app.listen(PORT, () => {
    console.log(`🚀 Smart Market Watchlist API running on http://localhost:${PORT}`);
    console.log(`   Try: http://localhost:${PORT}/api/market/latest`);
    console.log(`   Try: http://localhost:${PORT}/api/watchlist/update`);
  });
}

start();

module.exports = app;