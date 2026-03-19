"""
KEY x402 PAYMENT PATHS in purchase_single_node:

PATH A (preferred) — providerAddress is set in DB:
  agent → transfer_usdc(providerAddress, price) → get tx_hash
  agent → GET endpoint with X-402-Payment-Proof: tx_hash header
  node  → returns 200 + signal data

PATH B (fallback) — providerAddress is NULL in DB:
  agent → GET endpoint (no payment headers)
  node  → returns 402 + X-Payment-Wallet header
  agent → transfer_usdc(wallet_from_header, price) → get tx_hash
  agent → GET endpoint with PAYMENT-SIGNATURE: tx_hash header
  node  → returns 200 + signal data

ROOT CAUSE OF MISSING x402: If providerAddress is NULL *and* the node server
returns 200 (no 402), Path B completes without any payment. Fix: always seed
nodes with providerAddress so Path A is used.
"""

import os
import time
import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from .data_consumer import fetch_node_data
from .transaction_logger import get_logger

class DataPipeline:
    def __init__(self, market_manager):
        self.market = market_manager
        self.chart_api_url = "http://localhost:3600/api/dashboard/chart"
        self.nodes_api_url = "http://localhost:3600/api/market/nodes"
        self.TOOL_CATEGORIES = {}
        
        # Initialize memory cache
        self.purchased_data_cache = {}

        # Simulation mode: skip real x402 payments
        self.simulation_mode = os.getenv("SIMULATION_MODE", "false").lower() == "true"
        if self.simulation_mode:
            print("⚠️  [DataPipeline] SIMULATION_MODE enabled - using mock signals instead of real x402 payments")

    def add_purchased_data(self, node_title: str, payload: dict):
        """Store purchased data with a timestamp."""
        if not hasattr(self, 'purchased_data_cache'):
            self.purchased_data_cache = {}
            
        self.purchased_data_cache[node_title] = {
            'timestamp': time.time(),
            'data': payload
        }
        print(f"   💾 [DataPipeline] Cached data for '{node_title}'.")

    def get_valid_cached_data(self, ttl_seconds=300):
        """Returns data bought within the last `ttl_seconds` (Default 5 mins)."""
        if not hasattr(self, 'purchased_data_cache'):
            return {}
            
        current_time = time.time()
        valid_data = {}
        
        # Clean up expired data and return valid data
        for node, record in list(self.purchased_data_cache.items()):
            age = current_time - record['timestamp']
            if age < ttl_seconds:
                valid_data[node] = record['data']
            else:
                print(f"   🗑️ [DataPipeline] Cached data for '{node}' expired ({int(age)}s old).")
                del self.purchased_data_cache[node]
                
        return valid_data

    def get_market_state(self):
        """Helper to get current market state for the AI Scout."""
        try:
            # Sync fetch so it can be used easily in prompt construction
            import asyncio
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # We are already in an async context, this might fail depending on how it's called
                # But typically market_state needs to be stringified anyway.
                df = requests.get("http://localhost:3600/api/dashboard/chart", timeout=2).json()
                if isinstance(df, dict) and "data" in df:
                    return str(df["data"][-5:]) # Return last 5 points for context
                return str(df[-5:]) if isinstance(df, list) else "Market State Unavailable"
            else:
                 return "Market State Unavailable"
        except:
             return "Market State Unavailable"

    async def fetch_with_proof(self, endpoint_url, tx_hash, node_id):
        """
        Fetch locked data from feed endpoint using x402 proof.
        Sends tx_hash as payment proof in headers.
        """
        try:
            headers = {
                "X-402-Payment-Proof": tx_hash,
                "x-payment-proof": tx_hash,
                "PAYMENT-SIGNATURE": tx_hash,
                "Content-Type": "application/json"
            }

            # Some providers expose /feed at root, some under endpoint path
            candidate_urls = [endpoint_url, f"{endpoint_url}/feed"]
            if "/api/" in endpoint_url:
                base = endpoint_url.split("/api/", 1)[0]
                candidate_urls.append(f"{base}/feed")

            res = None
            for url in candidate_urls:
                try:
                    res = requests.get(url, headers=headers, timeout=10)
                    if res.status_code == 200:
                        break
                except Exception:
                    continue

            if res is None:
                print(f"   ❌ [x402 Feed] Could not reach feed endpoint for node {node_id}")
                return None

            if res.status_code == 200:
                data = res.json()
                print(f"   ✅ [x402 Feed] Received data from {endpoint_url}")
                signal = data.get('signal', None)
                if signal is not None:
                    return signal
                return data
            elif res.status_code == 402:
                print(f"   ❌ [x402 Feed] Payment proof rejected: {res.text[:200]}")
                return None
            else:
                print(f"   ⚠️  [x402 Feed] Unexpected status {res.status_code}: {res.text[:200]}")
                return None

        except Exception as e:
            print(f"   ❌ [x402 Feed Error] {e}")
            import traceback
            traceback.print_exc()
            return None

    async def purchase_single_node(self, node_id):
        """
        Execute real x402 purchase of a single node.

        PATH A: providerAddress is set → pay directly, use tx_hash as proof header.
        PATH B: providerAddress not set → GET endpoint expecting 402 response with wallet.
        SIMULATION: if SIMULATION_MODE=true → return mock signal, no blockchain call.
        """
        sim_mode = getattr(self, "simulation_mode", os.getenv("SIMULATION_MODE", "false").lower() == "true")
        if not hasattr(self, "simulation_mode"):
            self.simulation_mode = sim_mode

        if sim_mode:
            print(f"   🔵 [DataPipeline] SIMULATION: Mock purchase of node {node_id}")
            import asyncio
            await asyncio.sleep(0.1)
            return {
                "signal": 0.72,
                "node_id": node_id,
                "timestamp": datetime.utcnow().isoformat(),
                "simulated": True
            }

        print(f"   💸 [DataPipeline] Real x402 purchase for node: {node_id}")

        import asyncio
        try:
            nodes = None
            source_endpoint = None
            for _ in range(6):
                for endpoint in ["http://localhost:3600/api/nodes", self.nodes_api_url]:
                    try:
                        res = requests.get(endpoint, timeout=5)
                        if res.status_code == 200:
                            nodes = res.json()
                            source_endpoint = endpoint
                            break
                    except Exception as inner_e:
                        pass
                if nodes is not None:
                    break
                await asyncio.sleep(5)

            if nodes is None:
                print("   ❌ [x402] Could not load node catalog from frontend API")
                return None

            if isinstance(nodes, dict) and "nodes" in nodes:
                nodes = nodes.get("nodes", [])

            if not isinstance(nodes, list):
                print(f"   ❌ [x402] Unexpected node catalog payload from {source_endpoint}")
                return None

            # Match by id or title
            target_node = next((n for n in nodes if str(n.get('id')) == str(node_id)), None)
            if target_node is None:
                target_node = next(
                    (n for n in nodes if str(n.get('title', '')).strip().lower() == str(node_id).strip().lower()),
                    None
                )

            if not target_node:
                print(f"   ❌ Node {node_id} not found in node catalog (checked {len(nodes)} nodes)")
                return None

            endpoint_url = (
                target_node.get('endpointUrl')
                or target_node.get('endpoint')
                or target_node.get('url')
            )
            price = float(target_node.get('price', 0.0) or 0.0)
            provider_address = (
                target_node.get('providerAddress')
                or target_node.get('providerWallet')
                or target_node.get('walletAddress')
            )

            # ── PATH A: Direct payment (providerAddress known) ────────────────────
            if provider_address and endpoint_url:
                print(f"   📍 [x402 Path A] Direct payment → {provider_address}")
                print(f"   💰 [x402 Path A] Sending {price} USDC to {provider_address}...")
                from .wallet_manager import WalletManager
                wallet_manager = WalletManager()
                tx_hash = wallet_manager.transfer_usdc(provider_address, price)
                if not tx_hash:
                    print(f"   ❌ [x402 Path A] Payment transaction failed for node {node_id}")
                    return None

                print(f"   ✅ [x402 Path A] Payment sent! TX: {tx_hash}")
                get_logger().log_x402_payment(
                    tx_hash=tx_hash,
                    amount=price,
                    recipient=provider_address,
                    node_id=target_node.get('id', node_id),
                    node_name=target_node.get('title', str(node_id)),
                    data_type=target_node.get('nodeType', 'unknown')
                )

                signal = await self.fetch_with_proof(endpoint_url, tx_hash, node_id)
                if signal is not None:
                    print(f"   ✅ [x402 Path A] Data received for {node_id}")
                    return {
                        "node_id": node_id,
                        "signal": signal.get('value', signal) if isinstance(signal, dict) else signal,
                        "tx_hash": tx_hash,
                        "timestamp": datetime.utcnow().isoformat(),
                        "real_purchase": True,
                        "path": "A"
                    }
                else:
                    print(f"   ⚠️  [x402 Path A] Payment sent but no data returned. TX logged.")
                    return {
                        "node_id": node_id,
                        "signal": 0.5,  # neutral fallback
                        "tx_hash": tx_hash,
                        "timestamp": datetime.utcnow().isoformat(),
                        "real_purchase": True,
                        "path": "A",
                        "note": "payment_sent_no_signal"
                    }

            # ── PATH B: Legacy 402-challenge flow (providerAddress unknown) ────────
            elif endpoint_url:
                print(f"   📍 [x402 Path B] Legacy 402 challenge flow → {endpoint_url}")
                print(f"   ⚠️  [x402] No providerAddress in DB — node must return 402 with wallet in headers")

                def sync_fetch():
                    return fetch_node_data(
                        node_url=endpoint_url,
                        api_key=target_node.get('apiKey'),
                        price=price,
                        category=target_node.get('nodeType'),
                        node_id=target_node.get('id'),
                        node_name=target_node.get('title')
                    )

                loop = asyncio.get_event_loop()
                signal = await loop.run_in_executor(None, sync_fetch)

                if signal:
                    print(f"   ✅ [x402 Path B] Purchase complete for {node_id}")
                    return {
                        "node_id": node_id,
                        "signal": signal.value if hasattr(signal, 'value') else signal,
                        "tx_hash": None,
                        "timestamp": datetime.utcnow().isoformat(),
                        "real_purchase": True,
                        "path": "B"
                    }
                else:
                    print(f"   ❌ [x402 Path B] No signal returned for {node_id}.")
                    return None

            else:
                print(f"   ❌ [x402] Node {node_id} has no endpointUrl AND no providerAddress — cannot purchase")
                return None

        except Exception as e:
            print(f"   ❌ [DataPipeline purchase_single_node Error] {e}")
            import traceback
            traceback.print_exc()
            return None

    async def get_latest_tape(self):
        """
        Fetches market price history from the dashboard/chart endpoint.
        """
        try:
            res = requests.get("http://localhost:3600/api/dashboard/chart", timeout=2)
            if res.status_code != 200:
                print(f"⚠️ [Pipeline] API returned status {res.status_code}")
                return self._generate_mock_price_data()
            raw_data = res.json()
            if isinstance(raw_data, dict) and "data" in raw_data:
                price_list = raw_data["data"]
            else:
                price_list = raw_data
            df = pd.DataFrame(price_list)
            if not df.empty:
                df.columns = [c.lower() for c in df.columns]
                if "price" not in df.columns and "value" in df.columns:
                    df["price"] = df["value"]
                print(f"✅ [Pipeline] Synced {len(df)} price points.")
            return df
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            return self._generate_mock_price_data()
        except Exception as e:
            print(f"⚠️ [Pipeline] Chart fetch error: {e}")
            return self._generate_mock_price_data()

    def _generate_mock_price_data(self):
        """Generate synthetic price data when frontend API is unavailable."""
        import random
        now = datetime.now()
        base_price = 100.0
        data = []
        for i in range(60):
            timestamp = (now - timedelta(minutes=60-i)).isoformat()
            price = base_price + random.gauss(0, 2) + (i * 0.05)
            data.append({"timestamp": timestamp, "price": price, "close": price})
        df = pd.DataFrame(data)
        print(f"⚠️  [Pipeline] Using mock price data (60 points, frontend unavailable)")
        return df

    def fetch_candles(self):
        return None

    async def execute_targeted_buy(self, node_id):
        if hasattr(self, 'purchase_single_node'):
            return await self.purchase_single_node(node_id)
        raise NotImplementedError("purchase_single_node method not implemented.")

    async def pay_x402_batch(self, node_objs):
        """Batch payment stub — Solana EVM path not applicable."""
        print("      ℹ️ Solana mode: batch payment via pay_x402_batch not implemented. Use purchase_single_node per node.")
        return True

    async def fetch_dynamic_tools(self, node_objs):
        from agent.wallet_manager import WalletManager
        results = {}
        failure_flag = False
        wallet_manager = WalletManager()
        for node in node_objs:
            try:
                data = fetch_node_data(
                    node_url=node.get("endpointUrl"),
                    api_key=node.get("apiKey"),
                    wallet_manager=wallet_manager
                )
                results[node.get("name")] = data
            except Exception as e:
                print(f"   ❌ Failed to fetch {node.get('name')}: {e}")
                failure_flag = True
        return results, failure_flag