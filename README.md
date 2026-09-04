# SMART MARKET WATCHLIST

## PROJECT DESCRIPTION

Smart Market Watchlist is a full-stage real-time financial tracking dashboard designed to monitor high-volume equities. Built with a robust circuit-breaker architecture, the platform automatically intercepts upstream API failures and falls back to a gracefully degraded local cache, ensuring uninterrupted dashboard availability during market volatility or network outages. It features automated session state management, real-time delta computation for swings occurring during user absence, and fault-injection controls for live resilience testing.

## TECH STACK

• Frontend: Next.js, React, Tailwind CSS, Lucide Icons, Google Fonts (Space Grotesk & JetBrains Mono)
• Backend: Node.js, Express.js, MongoDB, Mongoose
• External APIs: Finnhub Financial REST API

## API ENDPOINTS USED

### MARKET DATA ENDPOINTS

• GET /api/market/latest: Fetches the latest live or cached quotes, price changes, and spike statuses for all tracked market tickers.

• GET /api/market/:symbol: Retrieves real-time metrics for a specific financial instrument symbol.

• POST /api/market/simulate-outage: Toggles the fault-injection circuit breaker to simulate an upstream provider outage.

External APIs Used

Finnhub Financial REST API: Fetches real-time market data quotes, percentage changes, and previous close prices for tracked financial equities.

### WATCHLIST & SESSION ENDPOINTS

• POST /api/watchlist/update: Adds or removes an asset symbol from a user's persistent session watchlist.

• GET /api/watchlist/:sessionId/delta: Computes meaningful percentage movements (>2% swings) for tracked assets since the user's last session review.

• POST /api/watchlist/:sessionId/acknowledge: Clears or marks active price movement alerts as reviewed for the given session.

## GETTING STARTED LOCALLY

### PREREQUISITES

• Node.js installed on your machine
• MongoDB database URI
• Finnhub API Key (free tier)

### INSTALLATION & EXECUTION

1. Clone the repository:

git clone https://github.com/sanyak-1/smart-market-watchlist.git
cd smart-market-watchlist

2. Configure Backend Environment:

Create a .env file inside the backend folder with:

PORT=5000
MONGO_URI=your_mongodb_connection_string
FINNHUB_API_KEY=your_finnhub_api_key

3. Run the Backend:

cd backend
npm install
npm start

4. Run the Frontend:

Open a second terminal window in the root folder:

cd frontend
npm install --force
npm run dev

5. Access the web interface at:

http://localhost:3000

## HACKATHON SUBMISSION DETAILS

Demo Video: [Insert YouTube/Loom Link Here]

Target Track: FinTech / Resilient Distributed Systems
