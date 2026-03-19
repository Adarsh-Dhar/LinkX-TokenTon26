import { NextResponse } from 'next/server';

const WSOL_MINT = "So11111111111111111111111111111111111111112";

// Helper function to fetch data safely without crashing the whole route if one API goes down
async function fetchSafe(url: string) {
  try {
    // Revalidate every 60 seconds to prevent rate-limiting from public APIs
    const response = await fetch(url, { next: { revalidate: 60 } });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`[Market Context] Failed to fetch ${url}:`, error);
    return null;
  }
}

export async function GET() {
  try {
    const urls = {
      btc: "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
      dex: `https://api.dexscreener.com/latest/dex/tokens/${WSOL_MINT}`,
      fng: "https://api.alternative.me/fng/",
      funding: "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=SOLUSDT"
    };

    // Fetch all 4 public APIs concurrently (takes < 1 second total)
    const [btcData, dexData, fngData, fundData] = await Promise.all([
      fetchSafe(urls.btc),
      fetchSafe(urls.dex),
      fetchSafe(urls.fng),
      fetchSafe(urls.funding)
    ]);

    // Initialize with safe default values
    const context = {
      btc_24h_change: 0.0,
      wsol_dex_volume_24h: 0.0,
      fear_and_greed_score: 50,
      sol_funding_rate: 0.0
    };

    // 1. Parse BTC Trend
    if (btcData && btcData.priceChangePercent) {
      context.btc_24h_change = parseFloat(btcData.priceChangePercent);
    }

    // 2. Parse DEX Volume (get highest liquidity pair for WSOL)
    if (dexData && dexData.pairs && dexData.pairs.length > 0) {
      const primaryPair = dexData.pairs[0];
      context.wsol_dex_volume_24h = parseFloat(primaryPair.volume?.h24 || 0);
    }

    // 3. Parse Fear & Greed Index
    if (fngData && fngData.data && fngData.data.length > 0) {
      context.fear_and_greed_score = parseInt(fngData.data[0].value, 10);
    }

    // 4. Parse SOL Funding Rate (convert to percentage)
    if (fundData && fundData.lastFundingRate) {
      context.sol_funding_rate = parseFloat(fundData.lastFundingRate) * 100;
    }

    // Return the aggregated data
    return NextResponse.json({
      success: true,
      data: context
    }, { status: 200 });

  } catch (error) {
    console.error('[Market Context API] Critical Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to retrieve market context' 
    }, { status: 500 });
  }
}