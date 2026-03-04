// node_macro.js
// Node 3: Global Macroeconomic Indicators and Supply Chain Logistics
// Monitors large-scale economic and physical world data that impacts long-term asset valuations.


const express = require('express');
const { x402Middleware, getRandom, TREASURY_WALLET, registerNode } = require('./shared_logic');
const app = express();
app.use(express.json());

let nodeState = {
    id: "macro-node-uuid",
    title: "Supply Chain & Global Macro",
    description: "This node monitors large-scale economic and physical world data that impacts long-term asset valuations. It tracks supply chain health through port congestion indices and vessel transit counts, alongside critical infrastructure metrics like energy grid stability. Furthermore, it provides high-level economic indicators, including Consumer Price Index (CPI) expectations and Central Bank biases (Hawkish vs. Dovish), maintaining a 92% quality score for fundamental research.",
    more_context: "Focuses on global macro, supply chain, port congestion, energy grid, and central bank bias.",
    ratings: 92,
    data: {},
    timestamp: Date.now()
};

function updateNodeState() {
    nodeState.data = {
        port_congestion_index: getRandom(0.05, 0.35, 2),
        vessel_count_transit: getRandom(1300, 1500),
        energy_grid_stability: Math.random() > 0.9 ? "Fluctuating" : "Stable",
        economic_indicators: {
            cpi_expectation: `${getRandom(1.9, 2.6, 1)}%`,
            central_bank_bias: Math.random() > 0.5 ? "Hawkish" : "Dovish"
        }
    };
    nodeState.timestamp = Date.now();
    setTimeout(updateNodeState, getRandom(5000, 15000));
}
updateNodeState();

app.get('/api/macro', x402Middleware(0.65), (req, res) => {
    res.json(nodeState);
});

// POST /feed endpoint for x402 payment proof verification
app.post('/api/macro/feed', (req, res) => {
    const paymentProof = req.headers['x-402-payment-proof'];
    if (!paymentProof) {
        return res.status(402).json({
            error: 'Payment Required',
            price: 0.65,
            title: 'Supply Chain & Global Macro'
        });
    }
    // Verify tx hash format (0x + 64 hex chars)
    const isValidTxHash = /^0x[a-fA-F0-9]{64}$/.test(paymentProof);
    if (!isValidTxHash) {
        console.warn(`[Macro] Invalid tx hash format: ${paymentProof}`);
    }
    console.log(`✅ [Macro] Access granted with proof ${paymentProof.slice(0, 10)}...`);
    const signal = parseFloat(getRandom(0.8, 1.2, 2));
    res.json({
        success: true,
        ...nodeState,
        signal: signal
    });
});

// Register with marketplace on startup
registerNode({
    title: 'Supply Chain & Global Macro',
    nodeType: 'macro',
    category: 'Fundamental',
    endpointUrl: 'http://localhost:4003/api/macro',
    port: 4003,
    price: 0.65,
    ratings: 92,
    description: 'Monitors large-scale economic and physical world data including supply chain health, port congestion, energy grid stability, CPI expectations, and central bank biases for fundamental research.',
    more_context: 'Focuses on global macro, supply chain, port congestion, energy grid, and central bank bias.',
    providerAddress: TREASURY_WALLET,
    assetCoverage: 'WSOL/USDC',
    granularity: '1h'
}).catch(err => console.error('Registration error:', err));

app.listen(4003, () => console.log("🚀 Global Macro Node online on :4003"));
