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
    def __init__(self, api_key=None):
        self.github_models_api_key = api_key or os.getenv("GITHUB_MODELS_API_KEY")
        if not self.github_models_api_key:
            raise ValueError("❌ GITHUB_MODELS_API_KEY required for pure market-data trading. No fallback available.")
        endpoint = (os.getenv("GITHUB_MODELS_ENDPOINT") or "https://models.inference.ai.azure.com").rstrip("/")
        self.github_models_url = f"{endpoint}/chat/completions"
        self.model_name = "gpt-4o-mini"
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

    # REMOVED: Local fallback logic
    # All AI failures will now raise exceptions and show raw errors

    async def assess_data_needs(self, market_snapshot, node_catalog):
        # Pre-process: Calculate 'Seconds Since Last Buy' for the AI
        from datetime import datetime
        import json
        for n in node_catalog:
            sec_ago = 999999
            if n.get('last_bought_at'):
                try:
                    dt = datetime.fromisoformat(n['last_bought_at'].replace('Z', ''))
                    sec_ago = (datetime.utcnow() - dt).total_seconds()
                except: pass
            n['seconds_since_last_buy'] = int(sec_ago)

        scout_prompt = f"""
        You are a Data Procurement Officer.
        MARKET: {json.dumps(market_snapshot)}
        CATALOG: {json.dumps(node_catalog)}

        REASONING RULES:
        1. NO BLIND TRADES: You are an institutional trader. You are currently 'Blind' (intelligence is empty).
        2. RESEARCH REQUIREMENT: If the price has moved more than 2.0 points, you MUST buy the most relevant node report (Sentiment or Macro) to confirm the move.
        3. DO NOT SAVE MONEY: Your priority is trade accuracy, not research cost. Spend the budget to break the Neutral loop.
        4. VALIDITY: Data is valid for 300 seconds (5m). REUSE it if 'seconds_since_last_buy' < 300.
        5. baseline: If you have NO node data, you MUST buy at least one to understand the market.
        6. thrift: If technicals are neutral and you have fresh data, buy nothing.

        Respond in JSON: {{"nodes_to_buy": ["Exact Node Name"], "reasoning": "..."}}
        """
        try:
            response = await self._generate_content(scout_prompt)
            return json.loads(response)
        except Exception as e:
            if "429" in str(e) or "Too Many Requests" in str(e):
                print(f"   ⏳ [Scout] Rate limited. Skipping AI node selection this cycle.")
                return {"nodes_to_buy": [], "reasoning": "Rate limited - conservative fallback"}
            print(f"   ❌ Scout Error: {e}")
            raise

    async def get_strategy(self, market_data, memory):
        # No fallback - AI must be available

        import re  # only re is needed here, json is already imported at top
        user_message = f"MARKET SNAPSHOT: {json.dumps(market_data, indent=2)}"
        try:
            response = await self._generate_content(user_message, system_override=self.system_prompt)
            # Try to parse JSON from the response
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(0))
            # If not JSON, try to extract key info from the text
            print(f"   ⚠️ Strategist: No JSON found in LLM response. Attempting to parse key info.")
            # Simple heuristic: look for LONG/SHORT/NEUTRAL in text
            bias = "NEUTRAL"
            if "long" in response.lower():
                bias = "LONG"
            elif "short" in response.lower():
                bias = "SHORT"

            # Try to extract risk/confidence if bias is not NEUTRAL
            risk = None
            if bias != "NEUTRAL":
                # Look for a number in the first 2 sentences
                sentences = response.split('.')
                first_two = '.'.join(sentences[:2])
                numbers = [float(n) for n in re.findall(r'\b\d+\.?\d*\b', first_two)]
                for n in numbers:
                    if 0.0 < n <= 1.0:
                        risk = n
                        break
                    elif 1.0 < n <= 10.0:
                        # If LLM gives 1-10 scale, normalize to 0-1
                        risk = n / 10.0
                        break
            if risk is not None:
                return {"execution_bias": bias, "risk_confidence": risk, "reasoning": response.strip()}
            else:
                return {"execution_bias": "NEUTRAL", "risk_confidence": 0.0, "reasoning": response.strip() + " (No valid confidence found, defaulting to NEUTRAL)"}
        except Exception as e:
            print(f"   ❌ Strategist Error: {e}")
            raise  # No fallback - show raw error

    async def _generate_content(self, content, system_override=None):
        import asyncio

        # Global pacing for this strategist instance to avoid 429s
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
                        # Fail fast on rate-limit; caller fallback will keep pipeline moving.
                        print("   ⚠️ [AI RateLimit] 429 received. Using local fallback path.")
                        raise last_error
                    if attempt < 2:
                        await asyncio.sleep(1.5 * (attempt + 1))
                        continue
                    raise last_error
        # Robustly extract JSON even if there is markdown or leading text
        import re
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            return json_match.group(0)
        return text.strip()

# --- Token address resolver ---
def resolve_address(token):
    token = token.upper()
    # Try environment variables first
    env_map = {
        "USDC": os.getenv("USDC_CONTRACT"),
        "WSOL": os.getenv("WSOL_CONTRACT"),
        "USDC_CONTRACT": os.getenv("USDC_CONTRACT"),
        "WSOL_CONTRACT": os.getenv("WSOL_CONTRACT"),
    }
    if token in env_map and env_map[token]:
        return env_map[token]
    # If already a Solana mint address, return as is
    if 32 <= len(token) <= 44:
        return token
    raise ValueError(f"Unknown token/address: {token}")