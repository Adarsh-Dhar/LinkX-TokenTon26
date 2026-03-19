import os
from .free_intel import FreeIntelGatherer
import sys
import time
import json
import asyncio
import io
import pandas as pd
from datetime import datetime
from contextlib import redirect_stdout, redirect_stderr
from web3 import Web3
from .agent_state_db import AgentStateDB
from dotenv import load_dotenv
from pathlib import Path
from .transaction_logger import get_logger

# Explicitly load the root .env and agent/.env
load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env')
load_dotenv(dotenv_path=Path(__file__).parent / '.env', override=True)

from agent.brain import RLAgent

class PredictiveAgent:
    def __init__(self, wallet_manager, node_connector, market_analyst, trading_engine, strategist):
        # RLAgent brain for action/size
        self.rl_brain = RLAgent()
        self.wallet = wallet_manager
        self.node_connector = node_connector
        self.analyst = market_analyst
        self.trading = trading_engine
        self.strategist = strategist
        self.state_db = AgentStateDB()
        self.short_term_memory = {}
        self.intelligence_cache = {}
        self.current_position = "NEUTRAL"
        self.last_trade_confidence = 0.0
        self.last_trade_time = 0.0
        self.risk_threshold = 0.05
        self.forced_bias = None
        self.data_cache = {}
        self._token_decimals_cache = {}
        self._last_logged_swap_tx = None
        self.max_slippage = float(os.getenv("MAX_SLIPPAGE", "1000"))
        self.continuous_trading = os.getenv("CONTINUOUS_TRADING", "true").lower() in ("1", "true", "yes")
        self.min_trade_interval_sec = int(os.getenv("MIN_TRADE_INTERVAL_SEC", "10"))

    def check_for_overrides(self):
        """Checks for overrides using ABSOLUTE paths."""
        current_dir = os.path.dirname(os.path.abspath(__file__))
        override_path = os.path.join(current_dir, "override_state.json")
        if os.path.exists(override_path):
            try:
                with open(override_path, "r") as f:
                    data = json.load(f)
                    self.forced_bias = data.get('forced_bias') or data.get('bias_override')
                    ctx = data.get('external_context')
                    if ctx:
                        self.short_term_memory['human_intel'] = ctx
                    if self.forced_bias:
                        self.forced_bias = self.forced_bias.upper()
            except Exception:
                pass
        else:
            self.forced_bias = None

    async def run_cycle(self):
        # 1. Get Free Intel
        market_state = self.analyst.get_market_state()

        # 2. Get Unexpired Purchased Data (Valid for 5 minutes)
        active_cache = self.analyst.get_valid_cached_data(ttl_seconds=300)

        # 3. Ask Scout what to buy (Pass the cache!)
        available_nodes = self.node_connector.get_available_nodes()
        nodes_to_buy = self.strategist.select_nodes_to_buy(market_state, available_nodes, active_cache)

        # 4. Procure New Data
        if len(nodes_to_buy) == 0:
            print("   ✅ [Procurement] Cache is sufficient. Skipping new purchases this cycle.")
        else:
            for node_name in nodes_to_buy:
                print(f"   💳 [Procurement] Initiating x402 purchase for: {node_name}")
                # Execute purchase and get data
                new_data = self.node_connector.purchase_and_fetch(node_name)
                if new_data:
                    # Save it to our new time-aware pipeline
                    self.analyst.add_purchased_data(node_name, new_data)

        # 5. Generate Final Trading Signal
        # Re-fetch cache to include anything we JUST bought
        final_knowledge = self.analyst.get_valid_cached_data(ttl_seconds=300)

        # ---> Pass market_state AND final_knowledge to your signal generator
        signal = self.strategist.generate_signal(market_state, final_knowledge)

        # ---> Execute trade...

    def _get_token_decimals(self, token_address):
        if token_address in self._token_decimals_cache:
            return self._token_decimals_cache[token_address]
        try:
            decimals = self.wallet._get_token_decimals(token_address)
            print(f"   [DEBUG] Fetched decimals for {token_address}: {decimals}")
        except Exception as e:
            print(f"   [DEBUG] Failed to fetch decimals for {token_address}: {e}, defaulting to 6")
            decimals = 6
        self._token_decimals_cache[token_address] = decimals
        return decimals

    def _format_amount(self, amount):
        if abs(amount - round(amount)) < 1e-9:
            return str(int(round(amount)))
        return f"{amount:.6f}".rstrip("0").rstrip(".")

    async def execute_move(self, action, confidence, risk_percent=0.0):
        wsol_addr = os.getenv("WSOL_CONTRACT")
        usdc_addr = os.getenv("USDC_CONTRACT") or os.getenv("USDC_ADDRESS")

        if not wsol_addr or not usdc_addr:
            return False

        if action == "LONG":
            token_in, token_out, addr_in = "USDC", "WSOL", usdc_addr
        elif action == "SHORT":
            token_in, token_out, addr_in = "WSOL", "USDC", wsol_addr
        elif action == "NEUTRAL":
            print("   [NEUTRAL] No trade executed.")
            return True
        else:
            return False

        raw_balance_result = await self.wallet.get_token_balance(addr_in)
        print(f"   [DEBUG] get_token_balance returned: {raw_balance_result} (type: {type(raw_balance_result).__name__})")
        sys.stdout.flush()
        decimals = self._get_token_decimals(addr_in)
        if isinstance(raw_balance_result, (int, float)) and raw_balance_result > 1000000:
            bal = float(raw_balance_result) / (10 ** decimals)
        else:
            bal = float(raw_balance_result)
        print(f"   [DEBUG] Token: {token_in}, Balance: {bal:.6f} {token_in}")
        sys.stdout.flush()
        if bal <= 0:
            return False
        MIN_EXECUTABLE = 0.000001
        if bal < MIN_EXECUTABLE:
            return False
        amount_in = bal * risk_percent
        if amount_in < 0.1:
            print(f"   ⚠️  Trade amount too small ({amount_in:.4f}). Skipping trade.")
            return False
        result = await self.trading.execute_swap(token_in, token_out, amount_in, max_slippage=self.max_slippage)
        if result:
            self.current_position = action
            direction = f"{token_in.lower()} -> {token_out.lower()}"
            amount_str = self._format_amount(amount_in)
            human_amount = f"{amount_str} {token_in.lower()}"
            is_new_tx = result != self._last_logged_swap_tx
            if is_new_tx:
                print(f"   💱 [SWAP TX] {result} | {human_amount} → {token_out.lower()}")
                logger = get_logger()
                logger.log_swap(
                    tx_hash=result,
                    token_in=token_in,
                    token_out=token_out,
                    amount_in=amount_in,
                    amount_out=0,
                    price_impact=0,
                    status="confirmed"
                )
                self._last_logged_swap_tx = result
            try:
                self.state_db.record_trade_decision({
                    "action": direction,
                    "amount": human_amount,
                    "ticker": f"{token_in}/{token_out}"
                })
            except Exception as e:
                print(f"   ❌ [Trade Log Error] Failed to record trade: {e}")
                import traceback
                traceback.print_exc()
                sys.stdout.flush()
            timestamp = datetime.now().strftime("%d/%m/%Y, %H:%M:%S")
            print(f"{token_in.lower()} -> {token_out.lower()} {amount_str} {timestamp}")
            return True
        else:
            print(f"   ❌ [Swap Failed] {token_in} → {token_out} ({amount_in:.4f}). Check logs above for details.")
        return False