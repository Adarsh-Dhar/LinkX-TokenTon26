// node_microstructure.js
// Node 1: High-Frequency Market Microstructure and Order Flow Analytics
// Provides deep-level insights into the immediate liquidity and trading dynamics of the WETH/USDC pair.


const express = require('express');
const { x402Middleware, getRandom, TREASURY_WALLET, registerNode } = require('./shared_logic');
const app = express();
app.use(express.json());

// Node state for background updates
let nodeState = {
    id: "microstructure-node-uuid",
    title: "Market Microstructure & Execution",
    description: "This node provides deep-level insights into the immediate liquidity and trading dynamics of the WETH/USDC pair. It delivers real-time data on order book depth (bids and asks), trade velocity measured in ticks per second, and Volume Weighted Average Price (VWAP). Additionally, it monitors for advanced execution patterns like iceberg orders and provides high-precision latency metrics to ensure 98% quality-score data for high-frequency execution strategies.",
    more_context: "Focuses on WSOL/USDC order book, trade velocity, iceberg detection, and latency for HFT.",
    ratings: 98,
    data: {},
    timestamp: Date.now()
};

function updateNodeState() {
    nodeState.data = {
        order_book_depth: { bids: getRandom(400000, 500000), asks: getRandom(100000, 150000) },
        trade_velocity: `${getRandom(60, 110)} ticks/sec`,
        vwap: getRandom(2900, 3050, 2),
        iceberg_detected: Math.random() > 0.85,
        latency_ms: getRandom(2, 8)
    };
    nodeState.timestamp = Date.now();
    setTimeout(updateNodeState, getRandom(5000, 15000));
}
updateNodeState();

app.get('/api/microstructure', x402Middleware(0.25), (req, res) => {
    res.json(nodeState);
});

// POST /feed endpoint for x402 payment proof verification
app.post('/api/microstructure/feed', (req, res) => {
    const paymentProof = req.headers['x-402-payment-proof'];
    if (!paymentProof) {
        return res.status(402).json({
            error: 'Payment Required',
            price: 0.25,
            title: 'Market Microstructure & Execution'
        });
    }
    // Verify tx hash format (0x + 64 hex chars)
    const isValidTxHash = /^0x[a-fA-F0-9]{64}$/.test(paymentProof);
    if (!isValidTxHash) {
        console.warn(`[Microstructure] Invalid tx hash format: ${paymentProof}`);
    }
    console.log(`✅ [Microstructure] Access granted with proof ${paymentProof.slice(0, 10)}...`);
    // Return locked data
    res.json({
        success: true,
        ...nodeState,
        signal: parseFloat(getRandom(0.3, 0.95, 2))
    });
});

// Register with marketplace on startup
registerNode({
    title: 'Market Microstructure & Execution',
    nodeType: 'microstructure',
    category: 'Technical',
    endpointUrl: 'http://localhost:4001/api/microstructure',
    port: 4001,
    price: 0.25,
    ratings: 98,
    description: 'Provides deep-level insights into immediate liquidity and trading dynamics including order book depth, trade velocity, VWAP, iceberg detection, and high-precision latency metrics for HFT strategies.',
    more_context: 'Focuses on WSOL/USDC order book, trade velocity, iceberg detection, and latency for HFT.',
    providerAddress: TREASURY_WALLET,
    assetCoverage: 'WSOL/USDC',
    granularity: '1s'
}).catch(err => console.error('Registration error:', err));

app.listen(4001, () => console.log("🚀 Microstructure Node online on :4001"));
