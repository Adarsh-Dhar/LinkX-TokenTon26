import aiohttp

class FreeIntelGatherer:
    def __init__(self):
        # Pointing the agent directly to your Next.js API
        self.api_url = "http://localhost:3600/api/data"

    async def get_free_market_context(self):
        """Fetches the aggregated market data directly from the Next.js frontend."""
        fallback_context = {
            "btc_24h_change": 0.0,
            "wsol_dex_volume_24h": 0.0,
            "fear_and_greed_score": 50,
            "sol_funding_rate": 0.0
        }

        async with aiohttp.ClientSession() as session:
            try:
                # Ask the Next.js API for the data
                async with session.get(self.api_url, timeout=5) as response:
                    if response.status == 200:
                        result = await response.json()
                        if result and result.get("success"):
                            return result.get("data", fallback_context)
                    else:
                        print(f"   ⚠️ [FreeIntel] Frontend API returned status {response.status}")
            except Exception as e:
                print(f"   ⚠️ [FreeIntel] Could not reach frontend API at {self.api_url}: {e}")
        
        # If the frontend is down, return neutral defaults so the agent doesn't crash
        return fallback_context