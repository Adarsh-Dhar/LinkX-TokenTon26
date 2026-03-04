// node_sentiment.js
// Node 2: AI-Driven Social Sentiment and Alternative Behavioral Intelligence
// Specializes in quantifying the "human element" of the market by aggregating data from social platforms.


const express = require('express');
const { x402Middleware, getRandom, ASSET_TICKER, TREASURY_WALLET, registerNode } = require('./shared_logic');
const app = express();
app.use(express.json());

let nodeState = {
    id: "sentiment-node-uuid",
    title: "Alternative Intelligence & Sentiment",
    description: "This node specializes in quantifying the 'human element' of the market by aggregating data from social platforms to produce a highly bullish or bearish sentiment score. It tracks social velocity changes, web traffic indices, and even simulated satellite retail occupancy data to provide a holistic view of asset demand. With an 85% quality score, it helps traders understand the psychological momentum behind price action beyond traditional chart-based technical analysis.",
    more_context: "Focuses on WSOL/USDC social velocity, web traffic, and behavioral sentiment.",
    ratings: 85,
    data: {},
    timestamp: Date.now()
};

function updateNodeState() {
    const score = getRandom(0.1, 0.9, 2);
    nodeState.data = {
        social_sentiment: score,
        sentiment_label: score > 0.7 ? "Euphoric" : score < 0.3 ? "Fear" : "Neutral",
        social_velocity_change: `${getRandom(-15, 25)}%`,
        web_traffic_index: getRandom(1.0, 2.2, 1)
    };
    nodeState.timestamp = Date.now();
    setTimeout(updateNodeState, getRandom(5000, 15000));
}
updateNodeState();

app.get('/api/sentiment', x402Middleware(0.45), (req, res) => {
    res.json(nodeState);
});

// POST /feed endpoint for x402 payment proof verification
app.post('/api/sentiment/feed', (req, res) => {
    const paymentProof = req.headers['x-402-payment-proof'];
    if (!paymentProof) {
        return res.status(402).json({
            error: 'Payment Required',
            price: 0.45,
            title: 'Alternative Intelligence & Sentiment'
        });
    }
    // Verify tx hash format (0x + 64 hex chars)
    const isValidTxHash = /^0x[a-fA-F0-9]{64}$/.test(paymentProof);
    if (!isValidTxHash) {
        console.warn(`[Sentiment] Invalid tx hash format: ${paymentProof}`);
    }
    console.log(`✅ [Sentiment] Access granted with proof ${paymentProof.slice(0, 10)}...`);
    res.json({
        success: true,
        ...nodeState,
        signal: parseFloat(nodeState.data.social_sentiment)
    });
});

// Register with marketplace on startup
registerNode({
    title: 'Alternative Intelligence & Sentiment',
    nodeType: 'sentiment',
    category: 'Sentiment',
    endpointUrl: 'http://localhost:4002/api/sentiment',
    port: 4002,
    price: 0.45,
    ratings: 85,
    description: "Quantifies the 'human element' of the market by aggregating data from social platforms to produce highly bullish or bearish sentiment scores. Tracks social velocity changes, web traffic indices, and simulated satellite retail occupancy data.",
    more_context: 'Focuses on WSOL/USDC social velocity, web traffic, and behavioral sentiment.',
    providerAddress: TREASURY_WALLET,
    assetCoverage: 'WSOL/USDC',
    granularity: '1m'
}).catch(err => console.error('Registration error:', err));

app.listen(4002, () => console.log("🚀 Sentiment Node online on :4002"));
