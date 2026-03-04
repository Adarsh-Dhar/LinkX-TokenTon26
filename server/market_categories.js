// Defines the 24 distinct data markets
export default [
    // --- MARKET DATA ---
    { id: "price", name: "Current Price", type: "Market Data", template: { price: 0.12, source: "aggregated_cex" } },
    { id: "volume", name: "Trading Volume (24h)", type: "Market Data", template: { volume_24h: 4500000, change_24h: "+5%" } },
    { id: "spread", name: "Bid-Ask Spread", type: "Market Data", template: { spread_bps: 12, liquidity_health: "high" } },
    { id: "depth", name: "Order Book Depth", type: "Market Data", template: { bid_depth_2pct: 120000, ask_depth_2pct: 150000 } },
    { id: "mcap", name: "Market Cap", type: "Market Data", template: { mcap: 350000000, rank: 45 } },
    { id: "funding", name: "Funding Rates", type: "Market Data", template: { rate: "0.01%", bias: "neutral" } },

    // --- ON-CHAIN DATA ---
    { id: "inflows", name: "Exchange Inflows", type: "On-Chain", template: { net_inflow: 50000, signal: "bearish" } },
    { id: "outflows", name: "Exchange Outflows", type: "On-Chain", template: { net_outflow: 120000, signal: "bullish" } },
    { id: "whales", name: "Whale Transactions", type: "On-Chain", template: { large_tx_count: 5, total_moved: 5000000 } },
    { id: "active_addr", name: "Active Addresses", type: "On-Chain", template: { dau: 1500, trend: "increasing" } },
    { id: "fees", name: "Transaction Fees", type: "On-Chain", template: { avg_gas: 25, congestion: "low" } },
    { id: "age", name: "Token Age Consumed", type: "On-Chain", template: { days_destroyed: 4000, signal: "accumulation" } },

    // --- SENTIMENT ---
    { id: "social_vol", name: "Social Volume", type: "Sentiment", template: { mentions_24h: 8500, platform_top: "Twitter" } },
    { id: "sentiment", name: "Sentiment Score", type: "Sentiment", template: { score: 0.85, mood: "euphoric" } },
    { id: "search", name: "Search Volume", type: "Sentiment", template: { google_trend: 78, region_top: "Asia" } },
    { id: "dominance", name: "Social Dominance", type: "Sentiment", template: { percentage: "0.4%", trend: "flat" } },

    // --- FUNDAMENTAL ---
    { id: "devs", name: "Developer Commits", type: "Fundamental", template: { weekly_commits: 45, active_devs: 12 } },
    { id: "tvl", name: "Total Value Locked", type: "Fundamental", template: { tvl: 12000000, change_7d: "+12%" } },
    { id: "unlocks", name: "Token Unlocks", type: "Fundamental", template: { next_unlock: "14d", amount: 5000000 } },
    { id: "burn", name: "Burn Rate", type: "Fundamental", template: { burned_24h: 5000, deflationary: true } },

    // --- TECHNICAL ---
    { id: "rsi", name: "RSI (14)", type: "Technical", template: { value: 65, status: "neutral-bullish" } },
    { id: "ma", name: "Moving Averages", type: "Technical", template: { sma_50: 0.11, sma_200: 0.09, cross: "golden" } },
    { id: "volatility", name: "Volatility", type: "Technical", template: { iv_30d: "45%", realized: "38%" } },
    { id: "correlation", name: "BTC Correlation", type: "Technical", template: { pearson: 0.85, decoupling: false } }
];
