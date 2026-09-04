/**
 * models/UserSession.js
 *
 * Represents one anonymous "device session" and the watchlist state
 * needed to compute price deltas since that session last checked in.
 * No user accounts/auth here by design — sessionId is just an opaque
 * client-generated identifier (e.g. a UUID stored in localStorage).
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSessionSchema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    // Ticker symbols the session is tracking, e.g. ['AAPL', 'NVDA'].
    // Stored uppercase for consistent comparisons against MarketDataService.
    watchlist: {
      type: [String],
      default: [],
      set: (symbols) => symbols.map((s) => s.toUpperCase()),
    },

    // Timestamp of the last time this session's delta was acknowledged/viewed.
    lastViewedAt: {
      type: Date,
      default: null,
    },

    // Snapshot of prices at the moment of last acknowledgement, keyed by
    // ticker symbol. A Map (not a plain object) so Mongoose can track
    // per-key mutations properly and so keys can be arbitrary tickers.
    lastKnownPrices: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
  },
  {
    timestamps: true, // adds createdAt/updatedAt for free, useful for debugging
  }
);

module.exports = mongoose.model('UserSession', UserSessionSchema);