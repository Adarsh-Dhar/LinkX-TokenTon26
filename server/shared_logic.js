// shared_logic.js
// Shared utilities and x402 middleware for demo microservices

/**
 * Treasury wallet and asset ticker constants
 */
const TREASURY_WALLET = "29btcGViz61Db5c1HTeEyw9p5rpDQG87VYNe1WupQnDL";
const ASSET_TICKER = "WETH/USDC";

/**
 * Generate a random number between min and max, with optional decimals
 */
const getRandom = (min, max, decimals = 0) => {
    const val = Math.random() * (max - min) + min;
    return decimals === 0 ? Math.floor(val) : parseFloat(val.toFixed(decimals));
};

/**
 * x402 payment middleware for Express
 * Returns 402 with challenge if X-Payment-Proof header is missing
 */
const x402Middleware = (price) => (req, res, next) => {
    const paymentProof = req.headers['x-payment-proof'];
    if (!paymentProof) {
        const challenge = {
            protocol: "x402",
            price: price,
            currency: "3nigcoKPGb48mwBoV9HoaDe2QrFT82FfJdVGybk3hiu5", // USDC mint address for Solana devnet
            chainId: 1,
            recipient: TREASURY_WALLET,
            description: `Access to ${ASSET_TICKER} insight`,
            message: {
                from: "<user_wallet>",
                to: TREASURY_WALLET,
                value: Math.floor(price * 1e6),
                nonce: "0x" + Math.random().toString(16).slice(2, 34).padEnd(64, '0')
            }
        };
        return res.status(402).header('X-Payment-Price', price).json(challenge);
    }
    next();
};

/**
 * Register node with the marketplace
 * Allows nodes to self-announce on startup
 * 
 * @param {Object} config - Node configuration
 * @param {string} config.name - Node name
 * @param {string} config.nodeType - Type (e.g., 'sentiment', 'macro', 'microstructure')
 * @param {string} config.category - Category (e.g., 'Technical', 'Sentiment')
 * @param {string} config.endpointUrl - Full endpoint URL
 * @param {number} config.port - Port number
 * @param {number} config.price - Price per request in USDC
 * @param {number} config.qualityScore - Quality score (0-100)
 * @param {string} config.description - Node description
 * @param {string} config.providerAddress - Wallet address for x402 payments
 * @param {string} config.assetCoverage - Asset pair (e.g., 'WSOL/USDC')
 * @param {string} config.granularity - Data granularity (e.g., '1m', '5m')
 * @returns {Promise<Object>} Registration response
 */
async function registerNode(config) {
    const axios = require('axios');
    const registrationUrl = 'http://localhost:3600/api/nodes/register';
    try {
        // Prefer new keys, fallback for backward compatibility
        const payload = {
            title: config.title || config.name,
            nodeType: config.nodeType,
            category: config.category,
            endpointUrl: config.endpointUrl,
            port: config.port,
            price: config.price,
            ratings: config.ratings || config.qualityScore,
            description: config.description,
            more_context: config.more_context,
            providerAddress: config.providerAddress,
            assetCoverage: config.assetCoverage,
            granularity: config.granularity,
            apiVersion: '1.0'
        };
        console.log(`📡 Registering node: ${payload.title}...`);
        const response = await axios.post(registrationUrl, payload);
        console.log(`✅ Node registered successfully!`);
        console.log(`   ID: ${response.data.nodeId}`);
        console.log(`   Endpoint: ${payload.endpointUrl}`);
        console.log(`   Provider Wallet: ${payload.providerAddress}`);
        console.log(`   Price: ${payload.price} USDC per request`);
        return response.data;
    } catch (error) {
        // Handle registration errors gracefully - node can still function
        if (error.response) {
            console.error(`❌ Registration failed: ${error.response.status} - ${error.response.data.error}`);
            if (error.response.data.details) {
                console.error(`   Details: ${error.response.data.details}`);
            }
        } else if (error.request) {
            console.error(`❌ Registration failed: Cannot reach marketplace at ${registrationUrl}`);
            console.error(`   Make sure the frontend is running on port 3600`);
        } else {
            console.error(`❌ Registration failed: ${error.message}`);
        }
        console.log(`⚠️  Node will continue running without marketplace registration`);
        return null;
    }
}

module.exports = { x402Middleware, getRandom, ASSET_TICKER, TREASURY_WALLET, registerNode };
