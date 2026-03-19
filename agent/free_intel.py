import httpx

class FreeIntelGatherer:
    """
    Fetches free market context data from the Next.js API endpoint.
    """
    def __init__(self, endpoint_url="http://localhost:3600/api/data"):
        self.endpoint_url = endpoint_url

    async def get_market_context(self):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(self.endpoint_url, timeout=10)
                response.raise_for_status()
                data = response.json()
                if data.get("success"):
                    return data["data"]
                else:
                    raise Exception(f"API error: {data.get('error', 'Unknown error')}")
        except Exception as e:
            print(f"[FreeIntelGatherer] Failed to fetch market context: {e}")
            return None
