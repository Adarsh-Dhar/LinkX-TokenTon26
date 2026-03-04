// --- Price History State ---
let prices = [];

/**
 * Institutional Seeding:
 * Generates 30 minutes of historical data so agents can sync immediately.
 */
function seedHistoricalData() {
    console.log("📈 [MarketAnalyst] Seeding 30 minutes of historical price action...");
    const now = Date.now();
    const interval = 60000; // 1 minute per point
    let lastPrice = 2942.50; // Starting baseline

    for (let i = 30; i > 0; i--) {
        // Create realistic price movement
        const volatility = (Math.random() - 0.5) * 5; 
        lastPrice += volatility;
        prices.push({
            price: parseFloat(lastPrice.toFixed(2)),
            timestamp: new Date(now - (i * interval)).toISOString(),
            volume: Math.floor(Math.random() * 100) + 50
        });
    }
    console.log(`✅ [MarketAnalyst] History synced. ${prices.length} points available.`);
}

// CRITICAL: Call this before the server starts listening
seedHistoricalData();

const express = require('express');
const cors = require('cors');
const app = express();
const port = 3050;

app.use(cors());
app.use(express.json());

// --- Expose price history for charting ---
app.get('/api/prices', (req, res) => {
    res.json(prices);
});

// ...existing code...
// ...existing code...

// Mock Data Generators
const generateSentiment = () => Math.random().toFixed(4);
const generateWhaleMovement = () => (Math.random() > 0.8 ? 1000000 : 0);
const generateVolatility = () => Math.random().toFixed(2);

// Middleware to simulate Paywall
const paywall = (price) => (req, res, next) => {
    const proof = req.headers['x-payment-proof'];
    // If no proof is provided, demand payment
    if (!proof) {
        console.log(`💰 [Paywall] Blocked request to ${req.path}. Demanding $${price}`);
        return res.status(402).json({
            error: "Payment Required",
            price: price,
            currency: "USDC",
            wallet: "0xb8552ec41cd7b5697464602d24d9c174F6FB863C", // Agent pays itself for demo
            invoice_id: `inv_${Date.now()}`
        });
    }
    console.log(`✅ [Paywall] Access Granted to ${req.path}`);
    next();
};

// Routes
app.get('/alpha/insight/sentiment', paywall(0.1), (req, res) => {
    res.json({ value: generateSentiment(), type: "sentiment" });
});

app.get('/alpha/insight/whale', paywall(0.25), (req, res) => {
    res.json({ value: generateWhaleMovement(), type: "volume" });
});

app.get('/alpha/insight/volatility', paywall(0.15), (req, res) => {
    res.json({ value: generateVolatility(), type: "volatility" });
});

app.get('/alpha/insight/news', paywall(0.1), (req, res) => {
    res.json({ value: Math.random(), type: "news_sentiment" });
});

// Health Check
app.get('/health', (req, res) => res.json({ status: 'ok' }));


app.listen(port, () => {
    console.log(`🚀 Market Analyst Server running on http://localhost:${port}`);
});
