# ==========================================
# 🧠 LinkX Production-Ready Tools & Brain (Solana Edition)
# ==========================================
import json
import os
import time
import re
from datetime import datetime

import httpx
from dotenv import load_dotenv

# --- RAYDIUM DEX CONFIGURATION ---
RAYDIUM_PROGRAM_ID = os.getenv("RAYDIUM_PROGRAM_ID", "675kPX9MHTjS2zt1qLCXVJ4JSaqE1sgE4wcaxNac4c8")
RAYDIUM_AUTHORITY = os.getenv("RAYDIUM_AUTHORITY", "5Q544fKrFoe6tsEbD7K5QKLCvCL7BXh4VzvGLwAa1p1s")

# --- x402 PAYMENT PROTOCOL CONFIGURATION ---
X402_FACILITATOR_URL = os.getenv("X402_FACILITATOR_URL", "https://x402.org/facilitator")

# --- SOLANA TOKEN MINTS ---
USDC_MINT = os.getenv("USDC_CONTRACT", "EPjFWaJmqxiGAW9HfqLj3hRpB8kJqEHrL35JGBaYEPs")
WSOL_MINT = os.getenv("WSOL_CONTRACT", "So11111111111111111111111111111111111111112")

load_dotenv()

# --- 1. ALPHA STRATEGIST (THE BRAIN) ---

class AlphaStrategist:
    def generate_signal(self, market_state, final_knowledge):
        """
        Generate a trading signal based on market_state and final_knowledge.
        Returns a dict with execution_bias, risk_confidence, and reasoning.
        """
        # Dummy implementation: always NEUTRAL
        return {
            "execution_bias": "NEUTRAL",
            "risk_confidence": 0.0,
            "reasoning": "AlphaStrategist fallback: no signal logic implemented yet."
        }

    def select_nodes_to_buy(self, market_state, available_nodes, active_cache=None):
        active_cache = active_cache or {}
        # If we have no nodes available to buy, return empty
        if not available_nodes:
            return []

        prompt = f"""
        You are an AI Data Scout for an autonomous trading agent.
        Your job is to decide which premium data nodes to buy.

        PUBLIC MARKET STATE (Free):
        {market_state}

        CURRENTLY CACHED DATA (Already paid for & active):
        {list(active_cache.keys())}

        AVAILABLE PREMIUM NODES:
        {[{'title': n['title'], 'description': n.get('description', 'N/A'), 'price': n['price']} for n in available_nodes]}

        RULES:
        1. If the "CURRENTLY CACHED DATA" combined with the "PUBLIC MARKET STATE" is sufficient to make a trading decision, DO NOT buy anything. Return an empty list: [].
        2. If the cached data has expired or lacks specific insight (e.g. you need Sentiment but only have Macro), you may buy 1 or more nodes.
        3. Return ONLY a valid JSON list of strings matching the exact titles of the nodes you want to buy. Example: ["Alternative Intelligence & Sentiment", "Supply Chain & Global Macro"]
        """

        try:
            # ---> YOUR EXISTING LLM CALL GOES HERE (OpenAI/Anthropic) <---
            # response = self.llm_client.call(prompt)
            # return json.loads(response)
            pass
        except Exception as e:
            # SMART FALLBACK: If rate limited, check the cache first!
            if len(active_cache) > 0:
                print(f"   💡 [Scout] Rate limited, but we have {len(active_cache)} active cache(s). Buying 0 new nodes.")
                return []
            else:
                print(f"   💡 [Scout] Rate limited and cache is empty. Buying cheapest node as fallback.")
                sorted_nodes = sorted(available_nodes, key=lambda x: float(x.get('price', 999)))
                return [sorted_nodes[0]['title']]

    def __init__(self, api_key=None):
        self.github_models_api_key = api_key or os.getenv("GITHUB_MODELS_API_KEY")
        if not self.github_models_api_key:
            raise ValueError("❌ GITHUB_MODELS_API_KEY required for pure market-data trading. No fallback available.")
        endpoint = (os.getenv("GITHUB_MODELS_ENDPOINT") or "https://models.inference.ai.azure.com").rstrip("/")
        self.github_models_url = f"{endpoint}/chat/completions"
        self.model_name = "gpt-4o"
        self.min_call_gap_sec = int(os.getenv("AI_CALL_GAP_SEC", "60"))
        self._last_model_call_ts = 0.0
        self.system_prompt = (
            "You are a world-class trading strategist. "
            "Analyze the provided market data and recommend the optimal trading action. "
            "ALWAYS respond in JSON with two fields: 'execution_bias' (LONG, SHORT, or NEUTRAL) and 'risk_confidence' (a float between 0.0 and 1.0). "
            "Also include a 'reasoning' field with your analysis. "
            "CONFIDENCE CALCULATION: You must calculate confidence based on the strength of the Technical Trend. "
            "Base your decision PURELY on price data - no sentiment or external context allowed. "
            "NEVER repeat the same confidence number every cycle; vary it based on the exact price change decimals. "
            "If you are uncertain, set execution_bias to NEUTRAL and risk_confidence to 0.0. "
            "RULES: 4. PATIENCE: If you are currently in a position (LONG/SHORT), do not suggest a reversal (FLIP) unless the technical change is greater than 10.0 points. Small fluctuations should be handled as NEUTRAL or HOLD to save on slippage costs."
        )

    async def assess_data_needs(self, market_snapshot, node_catalog):
        """
        Decide which nodes to purchase based on free market context.

        KEY FIX: Removed the "LOW VOLUME = buy NO nodes" rule.
        On Devnet/testnet, wsol_dex_volume_24h is always 0 (no real trading),
        which previously caused the AI to never buy any nodes. The DEFAULT rule
        now guarantees at least one purchase per cycle.
        """
        from datetime import datetime
        import json

        # Pre-process: Calculate 'Seconds Since Last Buy' for the AI
        for n in node_catalog:
            sec_ago = 999999
            if n.get('last_bought_at'):
                try:
                    dt = datetime.fromisoformat(n['last_bought_at'].replace('Z', ''))
                    sec_ago = (datetime.utcnow() - dt).total_seconds()
                except:
                    pass
            n['seconds_since_last_buy'] = int(sec_ago)

        # BUG FIX: Removed rule 4 "LOW VOLUME = buy NO nodes".
        # wsol_dex_volume_24h is always 0 on Devnet because there is no real
        # DEX trading on testnet. The old rule blocked ALL node purchases permanently.
        # New rule 4 treats low/zero volume as a signal to buy the cheapest node.
        scout_prompt = f"""
        You are an elite institutional Data Procurement Officer. Your job is to decide which
        expensive data nodes to buy based on the current free market context.

        FREE MARKET DATA (from /api/data):
        {json.dumps(market_snapshot, indent=2)}

        AVAILABLE PAID NODE CATALOG:
        {json.dumps(node_catalog, indent=2)}

        FIELD REFERENCE (use these exact field names from FREE MARKET DATA):
        - btc_24h_change         : BTC 24h price change percentage
        - price_change           : local asset price change (last 5 bars)
        - fear_and_greed_score   : crypto fear & greed index (0-100, >75=Greed, <25=Fear)
        - sol_funding_rate       : SOL perpetual futures funding rate
        - wsol_dex_volume_24h    : WSOL DEX trading volume last 24h (may be 0 on testnet — ignore for gating)

        PROCUREMENT RULES (evaluate top-to-bottom, stop at first match):
        1. DIVERGENCE: If btc_24h_change > 0 (BTC rising) but price_change < 0 (local falling),
        buy the "Market Microstructure & Execution" node to check local whale dumping.
        2. CONFLUENCE: If both btc_24h_change and price_change are moving in the same direction
        strongly (>2% each), buy the "Supply Chain & Global Macro" node.
        3. EXTREME SENTIMENT: If fear_and_greed_score < 25 or > 75, OR if sol_funding_rate is
        highly negative (< -0.1), buy the "Alternative Intelligence & Sentiment" node.
        4. FRESHNESS CHECK: Do NOT re-buy a node if seconds_since_last_buy < 300.
        5. DEFAULT (MANDATORY): If none of rules 1-3 triggered a purchase, OR if wsol_dex_volume_24h
        is 0 or very low (testnet/devnet), ALWAYS buy the single cheapest available node whose
        seconds_since_last_buy >= 300. The agent MUST have at least one intelligence signal
        per cycle. Never return an empty nodes_to_buy list unless ALL nodes were bought < 300s ago.

        Respond ONLY in valid JSON:
        {{"nodes_to_buy": ["Exact Node Title Here"], "reasoning": "Brief explanation"}}
        """

        try:
                response = await self._generate_content(scout_prompt)
                json_match = re.search(r'\{.*\}', response, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group(0))
                    # Safety net: if AI still returns empty list, force cheapest node
                    if not result.get('nodes_to_buy'):
                        eligible = [
                            n for n in node_catalog
                            if n.get('seconds_since_last_buy', 999999) >= 300
                        ]
                        if eligible:
                            cheapest = min(eligible, key=lambda n: n.get('price', 999))
                            result['nodes_to_buy'] = [cheapest['title']]
                            result['reasoning'] = f"[Safety net] AI returned empty list. Buying cheapest eligible node: {cheapest['title']}"
                            print(f"   ⚠️  [Scout] AI returned no nodes — safety net activated, buying: {cheapest['title']}")
                    return result
                return json.loads(response)
        except Exception as e:
                if "429" in str(e) or "Too Many Requests" in str(e):
                    print(f"   ⏳ [Scout] Rate limited. Skipping AI node selection this cycle.")
                    # Fallback: buy cheapest eligible node
                    eligible = [
                        n for n in node_catalog
                        if n.get('seconds_since_last_buy', 999999) >= 300
                    ]
                    if eligible:
                        cheapest = min(eligible, key=lambda n: n.get('price', 999))
                        return {"nodes_to_buy": [cheapest['title']], "reasoning": "Rate limited - buying cheapest eligible node"}
                    return {"nodes_to_buy": [], "reasoning": "Rate limited - all nodes recently purchased"}
                print(f"   ❌ Scout Error: {e}")
                raise

    async def get_strategy(self, market_data, memory):
            import re

            user_message = f"MARKET SNAPSHOT: {json.dumps(market_data, indent=2)}"
            try:
                response = await self._generate_content(user_message, system_override=self.system_prompt)
                json_match = re.search(r'\{.*\}', response, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group(0))
                print(f"   ⚠️ Strategist: No JSON found in LLM response. Attempting to parse key info.")
                bias = "NEUTRAL"
                if "long" in response.lower():
                    bias = "LONG"
                elif "short" in response.lower():
                    bias = "SHORT"

                risk = None
                if bias != "NEUTRAL":
                    sentences = response.split('.')
                    first_two = '.'.join(sentences[:2])
                    numbers = [float(n) for n in re.findall(r'\b\d+\.?\d*\b', first_two)]
                    for n in numbers:
                        if 0.0 < n <= 1.0:
                            risk = n
                            break
                        elif 1.0 < n <= 10.0:
                            risk = n / 10.0
                            break
                if risk is not None:
                    return {"execution_bias": bias, "risk_confidence": risk, "reasoning": response.strip()}
                else:
                    return {"execution_bias": "NEUTRAL", "risk_confidence": 0.0, "reasoning": response.strip() + " (No valid confidence found, defaulting to NEUTRAL)"}
            except Exception as e:
                print(f"   ❌ Strategist Error: {e}")
                raise

    async def _generate_content(self, content, system_override=None):
            import asyncio

            now = time.time()
            elapsed = now - self._last_model_call_ts
            if elapsed < self.min_call_gap_sec:
                wait_s = self.min_call_gap_sec - elapsed
                print(f"   ⏳ [AI RateLimit] Waiting {wait_s:.1f}s before next model call...")
                await asyncio.sleep(wait_s)

            messages = [
                {"role": "system", "content": system_override or "You are a helpful assistant."},
                {"role": "user", "content": content}
            ]
            headers = {
                "Authorization": f"Bearer {self.github_models_api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": self.model_name,
                "messages": messages,
                "temperature": 0.2
            }
            text = ""
            async with httpx.AsyncClient() as client:
                last_error = None
                for attempt in range(3):
                    try:
                        self._last_model_call_ts = time.time()
                        response = await client.post(self.github_models_url, headers=headers, json=payload, timeout=60)
                        response.raise_for_status()
                        data = response.json()
                        text = data["choices"][0]["message"]["content"]
                        break
                    except Exception as e:
                        last_error = e
                        if "429" in str(e):
                            print("   ⚠️ [AI RateLimit] 429 received.")
                            raise last_error
                        if attempt < 2:
                            await asyncio.sleep(1.5 * (attempt + 1))
                            continue
                        raise last_error

            json_match = re.search(r'\{.*\}', text, re.DOTALL)
            if json_match:
                return json_match.group(0)
            return text.strip()

    # --- Token address resolver ---
    def resolve_address(token):
        token = token.upper()
        env_map = {
            "USDC": os.getenv("USDC_CONTRACT"),
            "WSOL": os.getenv("WSOL_CONTRACT"),
            "USDC_CONTRACT": os.getenv("USDC_CONTRACT"),
            "WSOL_CONTRACT": os.getenv("WSOL_CONTRACT"),
        }
        if token in env_map and env_map[token]:
            return env_map[token]
        if 32 <= len(token) <= 44:
            return token
        raise ValueError(f"Unknown token/address: {token}")