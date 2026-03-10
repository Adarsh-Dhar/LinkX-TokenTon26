



import os
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
        
        # Simulation mode: skip real x402 payments
        self.simulation_mode = os.getenv("SIMULATION_MODE", "false").lower() == "true"
        if self.simulation_mode:
            print("⚠️  [DataPipeline] SIMULATION_MODE enabled - using mock signals instead of real x402 payments")

    async def fetch_with_proof(self, endpoint_url, tx_hash, node_id):
        """
        Fetch locked data from feed endpoint using x402 proof.
        Sends tx_hash as payment proof in headers.
        """
        try:
            headers = {
                "X-402-Payment-Proof": tx_hash,
                "x-payment-proof": tx_hash,
                "Content-Type": "application/json"
            }

            # Some providers expose /feed at root, some under endpoint path
            candidate_urls = [f"{endpoint_url}/feed"]
            if "/api/" in endpoint_url:
                base = endpoint_url.split("/api/", 1)[0]
                candidate_urls.append(f"{base}/feed")

            res = None
            for url in candidate_urls:
                try:
                    res = requests.post(url, headers=headers, timeout=10)
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
                # Extract signal from response - prefer 'signal' field, fallback to full response
                signal = data.get('signal', None)
                if signal is not None:
                    return signal
                # Fallback: return the full data object if no signal field
                return data
            elif res.status_code == 402:
                print(f"   ❌ [x402 Feed] Payment proof rejected: {res.text}")
                return None
            else:
                print(f"   ⚠️  [x402 Feed] Unexpected status {res.status_code}: {res.text}")
                return None
                
        except Exception as e:
            print(f"   ❌ [x402 Feed Error] {e}")
            import traceback
            traceback.print_exc()
            return None

    async def purchase_single_node(self, node_id):
        """
        Execute real x402 purchase of a single node.
        In simulation mode, returns mock signal without blockchain payment.
        """
        sim_mode = getattr(self, "simulation_mode", os.getenv("SIMULATION_MODE", "false").lower() == "true")
        if not hasattr(self, "simulation_mode"):
            self.simulation_mode = sim_mode
            print("   ⚠️  [DataPipeline] simulation_mode missing on instance; recovered from env.")

        if sim_mode:
            print(f"[DataPipeline] SIMULATION: Mock purchase of node {node_id}")
            import asyncio
            await asyncio.sleep(0.5)  # Simulate network latency
            return {
                "signal": 0.72,
                "node_id": node_id,
                "timestamp": datetime.utcnow().isoformat(),
                "simulated": True
            }
        
        print(f"[DataPipeline] Real purchase of node: {node_id}")
        
        # Fetch node details from API (try both known endpoints)
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
                        else:
                            print(f"   ⚠️  [x402] Node catalog endpoint returned {res.status_code}: {endpoint}")
                    except Exception as inner_e:
                        print(f"   ⚠️  [x402] Node catalog endpoint failed: {endpoint} ({inner_e})")
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

            target_node = next((n for n in nodes if str(n.get('id')) == str(node_id)), None)
            if target_node is None:
                target_node = next((n for n in nodes if str(n.get('title', '')).strip().lower() == str(node_id).strip().lower()), None)
                
            if not target_node:
                print(f"   ❌ Node {node_id} not found in node catalog")
                return None
                
            endpoint_url = target_node.get('endpointUrl') or target_node.get('endpoint') or target_node.get('url')
            price = float(target_node.get('price', 0.0) or 0.0)
            provider_address = (
                target_node.get('providerAddress')
                or target_node.get('providerWallet')
                or target_node.get('walletAddress')
            )

            # If provider address is available, pay directly and use tx hash as proof
            if provider_address and endpoint_url:
                from .wallet_manager import WalletManager
                wallet_manager = WalletManager()
                print(f"   💸 [x402] Transferring {price} USDC to {provider_address}...")
                tx_hash = wallet_manager.transfer_usdc(provider_address, price)
                if not tx_hash:
                    print(f"   ❌ [x402] Payment transaction failed for node {node_id}")
                    return None
                print(f"   📝 [x402 TX] {tx_hash} | {price} USDC → {provider_address} | Node: {node_id}")
                get_logger().log_x402_payment(
                    tx_hash=tx_hash,
                    amount=price,
                    recipient=provider_address,
                    node_id=target_node.get('id', node_id),
                    node_name=target_node.get('title', str(node_id)),
                    data_type=target_node.get('category', 'unknown')
                )

                signal = await self.fetch_with_proof(endpoint_url, tx_hash, node_id)
            else:
                # Fallback to legacy flow if provider address is missing
                if not endpoint_url:
                    print(f"   ❌ [x402] Node {node_id} missing endpoint URL")
                    return None

                def sync_fetch():
                    return fetch_node_data(
                        node_url=endpoint_url,
                        api_key=target_node.get('apiKey'),
                        price=price,
                        category=target_node.get('category'),
                        node_id=target_node.get('id'),
                        node_name=target_node.get('title')
                    )

                # Use run_in_executor to handle sync function in async context
                loop = asyncio.get_event_loop()
                signal = await loop.run_in_executor(None, sync_fetch)

            if signal:
                print(f"   ✅ Real x402 purchase successful: {node_id}")
                return {
                    "node_id": node_id,
                    "signal": signal.value if hasattr(signal, 'value') else signal,
                    "tx_hash": tx_hash if provider_address and endpoint_url else None,
                    "timestamp": datetime.utcnow().isoformat(),
                    "real_purchase": True
                }

            print(f"   ❌ Real x402 purchase failed: {node_id}")
            return None
                    
        except Exception as e:
            print(f"   ❌ [DataPipeline Error] {e}")
            return None

    async def get_latest_tape(self):
        """
        Fetches market price history from the dashboard/chart endpoint.
        Matches the naming convention expected by PredictiveAgent.
        """
        try:
            res = requests.get("http://localhost:3600/api/dashboard/chart", timeout=2)
            if res.status_code != 200:
                print(f"⚠️ [Pipeline] API returned status {res.status_code}")
                return self._generate_mock_price_data()
            raw_data = res.json()
            # Extract data array if wrapped in an object
            if isinstance(raw_data, dict) and "data" in raw_data:
                price_list = raw_data["data"]
            else:
                price_list = raw_data
            df = pd.DataFrame(price_list)
            if not df.empty:
                # Ensure columns are lowercase for the Neural Brain (price, timestamp)
                df.columns = [c.lower() for c in df.columns]
                # Normalize chart schema: dashboard returns `value` not `price`
                if "price" not in df.columns and "value" in df.columns:
                    df["price"] = df["value"]
                # Log success for debugging
                print(f"✅ [Pipeline] Synced {len(df)} price points.")
            return df
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            # Frontend not ready yet, use mock data
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
            # Random walk with slight upward bias
            price = base_price + random.gauss(0, 2) + (i * 0.05)
            data.append({"timestamp": timestamp, "price": price, "close": price})
        df = pd.DataFrame(data)
        print(f"⚠️  [Pipeline] Using mock price data (60 points, frontend unavailable)")
        return df

    def __init__(self, market_manager):
        self.market = market_manager
        self.chart_api_url = "http://localhost:3600/api/dashboard/chart"
        self.nodes_api_url = "http://localhost:3600/api/market/nodes"
        # TOOL_CATEGORIES will be dynamically populated
        self.TOOL_CATEGORIES = {}
        self.simulation_mode = os.getenv("SIMULATION_MODE", "false").lower() == "true"
        if self.simulation_mode:
            print("⚠️  [DataPipeline] SIMULATION_MODE enabled - using mock signals instead of real x402 payments")

    def fetch_candles(self):
        """
        Placeholder method for fetching market candles. Should return a pandas DataFrame or None.
        """
        # TODO: Implement actual candle fetching logic
        return None

    async def execute_targeted_buy(self, node_id):
        """
        Executes a targeted x402 acquisition for one specific intelligence node (single-node purchase).
        """
        if hasattr(self, 'purchase_single_node'):
            return await self.purchase_single_node(node_id)
        # If purchase_single_node is not defined, you may want to raise an error or handle accordingly
        raise NotImplementedError("purchase_single_node method not implemented.")

    async def pay_x402_batch(self, node_objs):
        """
        Executes a single batch payment for all nodes in node_objs.
        Returns True if payment succeeded, False otherwise.
        """
        from web3 import Web3
        import os
        import json
        # Load USDC ABI
        abi_path = os.path.join(os.path.dirname(__file__), "usdc_abi.json")
        with open(abi_path, "r") as f:
            usdc_abi = json.load(f)
        # Load batch unlock contract ABI (replace with actual ABI file as needed)
        unlock_abi_path = os.path.join(os.path.dirname(__file__), "../abi/vvsrouter.json")
        with open(unlock_abi_path, "r") as f:
            unlock_abi = json.load(f)
        rpc = os.getenv("RPC_URL", "https://api.devnet.solana.com")
        usdc_contract_addr = os.getenv("USDC_CONTRACT", "EPjFWaJmqxiGAW9HfqLj3hRpB8kJqEHrL35JGBaYEPs")
        unlock_contract_addr = "29btcGViz61Db5c1HTeEyw9p5rpDQG87VYNe1WupQnDL"  # Placeholder Solana address for demo
        if not str(usdc_contract_addr).startswith("0x"):
            print("      ℹ️ Solana mode detected: skipping legacy EVM batch-payment path.")
            return True
        unlock_contract_addr = Web3.to_checksum_address(unlock_contract_addr)
        private_key = os.getenv("WALLET_PRIVATE_KEY")
        if not private_key:
            print("      ❌ Missing wallet private key for payment.")
            return False
        w3 = Web3(Web3.HTTPProvider(rpc))
        account = w3.eth.account.from_key(private_key)
        my_addr = account.address
        usdc_contract = w3.eth.contract(address=usdc_contract_addr, abi=usdc_abi)
        # Calculate total cost in USDC
        total_cost = sum(float(n.get("price", 0.0)) for n in node_objs)
        if total_cost <= 0:
            print("      ⚠️ No payment required for batch (total cost is zero).")
            return True
        try:
            decimals = usdc_contract.functions.decimals().call()
            total_cost_wei = int(total_cost * (10 ** decimals))
            balance = usdc_contract.functions.balanceOf(my_addr).call()
            if balance < total_cost_wei:
                print(f"      ❌ Insufficient USDC balance. Have: {balance/(10**decimals):.2f}, Need: {total_cost:.2f}")
                return False
            allowance = usdc_contract.functions.allowance(my_addr, unlock_contract_addr).call()
            if allowance < total_cost_wei:
                print("      🔐 Approving unlock contract for batch payment...")
                nonce = w3.eth.get_transaction_count(my_addr)
                tx = usdc_contract.functions.approve(unlock_contract_addr, total_cost_wei).build_transaction({
                    'from': my_addr, 'nonce': nonce, 'gasPrice': int(w3.eth.gas_price * 1.2)
                })
                signed = w3.eth.account.sign_transaction(tx, private_key)
                w3.eth.send_raw_transaction(signed.raw_transaction)
            # Call the configured swap router as a placeholder for payment logic
            unlock_contract = w3.eth.contract(address=unlock_contract_addr, abi=unlock_abi)
            # Example: swap USDC for WSOL (or another token) as a payment simulation
            # You must replace these addresses with real program/token addresses for your use case
            usdc_token = usdc_contract_addr
            wsol_token = os.getenv("WSOL_CONTRACT", "So11111111111111111111111111111111111111112")
            path = [Web3.to_checksum_address(usdc_token), Web3.to_checksum_address(wsol_token)]
            amount_in = total_cost_wei
            amount_out_min = 1  # Accept any amount out for now
            to_addr = my_addr
            deadline = int(datetime.utcnow().timestamp()) + 600
            nonce = w3.eth.get_transaction_count(my_addr)
            tx = unlock_contract.functions.swapExactTokensForTokens(
                amount_in, amount_out_min, path, to_addr, deadline
            ).build_transaction({
                'from': my_addr,
                'nonce': nonce,
                'gasPrice': int(w3.eth.gas_price * 1.2),
                'gas': 120000  # Increased gas limit
            })
            signed = w3.eth.account.sign_transaction(tx, private_key)
            try:
                tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
                if tx_hash:
                    print(f"      💸 Executed swapExactTokensForTokens for {len(node_objs)} nodes. Tx: {tx_hash.hex()}")
                    print("      ✅ Batch payment and unlock (swap) successful.")
                    return True
                else:
                    print("      ❌ No transaction hash returned (transaction may have failed to broadcast).")
                    return False
            except Exception as e:
                print(f"      ❌ Error sending transaction: {e}")
                return False
        except Exception as e:
            print(f"      ❌ Batch payment error: {e}")
            return False

    async def fetch_dynamic_tools(self, node_objs):
        """
        Accepts a list of node objects (not just names), fetches their data, and returns results.
        Returns (results, failure_flag): failure_flag is True if any node could not be bought.
        """
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