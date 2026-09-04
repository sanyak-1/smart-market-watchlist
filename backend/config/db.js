/**
 * config/db.js
 *
 * Centralizes the MongoDB connection so server.js just calls connectDB()
 * once at startup. Keeping this separate makes it trivial to swap
 * connection strings per environment (local/dev/staging) or add
 * retry/backoff logic later without touching server.js.
 *
 * Expects a MONGO_URI environment variable, e.g.:
 *   MONGO_URI=mongodb://127.0.0.1:27017/smart-market-watchlist
 * or an Atlas connection string.
 */

const mongoose = require('mongoose');

const DEFAULT_LOCAL_URI = 'mongodb://127.0.0.1:27017/smart-market-watchlist';

/**
 * Connect to MongoDB via Mongoose.
 * Resolves once the connection is established; rejects (and lets the
 * caller decide what to do) if it fails, rather than silently continuing
 * with a dead DB layer.
 */
async function connectDB() {
  const uri = process.env.MONGO_URI || DEFAULT_LOCAL_URI;

  // Fail fast during a hackathon demo instead of hanging forever if
  // Mongo isn't reachable.
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    throw err; // let server.js decide whether to exit or keep running
  }

  // Log unexpected disconnects/reconnects during the demo so it's obvious
  // what happened if the DB blips mid-presentation.
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected.');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('🔄 MongoDB reconnected.');
  });

  return mongoose.connection;
}

module.exports = connectDB;