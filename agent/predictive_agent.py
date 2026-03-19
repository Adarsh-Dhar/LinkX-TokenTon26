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
        self.intelligence_cache = {} # { "NodeName": {"report": "...", "timestamp": 123.4} }
        self.current_position = "NEUTRAL"
        self.last_trade_confidence = 0.0
        self.last_trade_time = 0.0
        self.risk_threshold = 0.05
        self.forced_bias = None
        self.data_cache = {} # Stores: { "NodeName": {"data": "...", "timestamp": 12345} }
        self._token_decimals_cache = {}
        self._last_logged_swap_tx = None
        # Allow max_slippage to be set via env or default to 1000
        self.max_slippage = float(os.getenv("MAX_SLIPPAGE", "1000"))
        # Continuous trading mode: keep executing while bias remains directional
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
        # check_for_overrides() disabled - trading on pure market data only
        # self.check_for_overrides()

        # 1. Fetch free market context from API
        free_gatherer = FreeIntelGatherer()
        market_context = await free_gatherer.get_market_context()
        if not market_context:
            print("[PredictiveAgent] Failed to fetch free market context. Skipping cycle.")
            return

        # 2. Get Basic Market Data
        df = await self.analyst.get_latest_tape()
        if df is None or df.empty:
            return
        # Ensure 'close' column exists, fallback to 'price' if needed
        if 'close' in df.columns:
            price_col = 'close'
        else:
            price_col = 'price'
        initial_snapshot = {
            "current_price": float(df[price_col].iloc[-1]),
            "price_change": float(df[price_col].iloc[-1] - df[price_col].iloc[-5]),
            "agent_performance": self.state_db.get_performance_context(),
            "suggested_bias": self.forced_bias if self.forced_bias else "NONE",
            # Add free market context
            **market_context
        }

        # --- SCOUT PHASE ---
        node_catalog = self.state_db.get_active_nodes_catalog()
        # FILTER: Only allow microstructure nodes for pure price-based trading
        microstructure_catalog = [
            n for n in node_catalog
            if "microstructure" in str(n.get("category", "")).lower()
            or "microstructure" in str(n.get("title", "")).lower()
        ]
        purchased_intel = {}
        if microstructure_catalog:
            # Ask AI which nodes are relevant (microstructure only)
            print("   🔎 [Scout] Assessing microstructure node catalog...")
            procurement = await self.strategist.assess_data_needs(initial_snapshot, microstructure_catalog)
            requested_nodes = procurement.get('nodes_to_buy', [])
            print(f"   📋 [Scout] Requested nodes: {requested_nodes}")
            if requested_nodes:
                for node in requested_nodes:
                    requested_name = str(node).strip()
                    requested_lower = requested_name.lower()

                    # Match strategist output (title) back to catalog entry
                    matched = next(
                        (
                            n for n in node_catalog
                            if str(n.get('title', '')).strip().lower() == requested_lower
                            or str(n.get('id', '')).strip().lower() == requested_lower
                        ),
                        None
                    )
                    if matched is None:
                        matched = next(
                            (
                                n for n in node_catalog
                                if requested_lower in str(n.get('title', '')).lower()
                                or str(n.get('title', '')).lower() in requested_lower
                            ),
                            None
                        )

                    if matched is None:
                        print(f"   ⚠️  [Procurement] Requested node not found in catalog: {requested_name}")
                        continue

                    node_id = matched.get('id') or matched.get('title')
                    node_title = matched.get('title') or requested_name
                    node_key = node_title
                    last_buy_time = self.short_term_memory.get(f"last_buy_{node_key}", 0)

                    if time.time() - last_buy_time < 300:
                        print(f"   ♻️  [Cache] Reusing fresh report from {node_key}")
                    else:
                        print(f"   💳 [Procurement] Buying intelligence from {node_key}")

                        # Real x402 purchase path
                        purchase = await self.analyst.purchase_single_node(node_id)
                        if purchase:
                            signal = purchase.get('signal')
                            purchased_intel[node_key] = signal
                            self.state_db.record_node_purchase(node_key, float(matched.get('price', 1.0) or 1.0))
                            self.short_term_memory[f"last_buy_{node_key}"] = time.time()
                            tx_hash = purchase.get('tx_hash')
                            if tx_hash:
                                print(f"      🧾 [x402 TX] {tx_hash} | Node: {node_key}")
                            print(f"      💸 Paid research fees to {node_key}")
                        else:
                            print(f"   ❌ [Procurement] Purchase failed for {node_key}")
            else:
                print("   💰 [Procurement] No nodes requested by AI")
        # --- END SCOUT PHASE ---

        # 4. TRADER PHASE (RLAgent brain)
        # Prepare state vector (dummy: use last 48 closes or zeros)
        state_vector = None
        if 'close' in df.columns and len(df['close']) >= 48:
            state_vector = df['close'].values[-48:]
        else:
            state_vector = [0.0] * 48
        import numpy as np
        state_vector = np.array(state_vector, dtype=np.float32)
        action, confidence, size, _ = self.rl_brain.get_action(state_vector)
        print(f"   🧠 [RLAgent] Action: {action}, Confidence: {confidence:.2f}, Size: {size:.2f}")
        # Map action to bias for compatibility
        bias = 'NEUTRAL'
        if action == 'BUY':
            bias = 'LONG'
        elif action == 'SELL':
            bias = 'SHORT'
        conf = confidence
        # Risk percent logic: size is already clamped [0, 0.15] in RLAgent
        risk_percent = size
        # Only trade if confidence and size are sufficient
        should_trade = False
        now_ts = time.time()
        if bias != self.current_position and risk_percent > 0 and conf >= 0.6:
            should_trade = True
            print(f"   🔄 [Position Change] {self.current_position} -> {bias}")
        elif (
            self.continuous_trading
            and bias in ("LONG", "SHORT")
            and (now_ts - self.last_trade_time) >= self.min_trade_interval_sec
            and risk_percent > 0 and conf >= 0.6
        ):
            should_trade = True
            print(
                f"   🔁 [Re-Entry] {bias} persists | "
                f"elapsed={int(now_ts - self.last_trade_time)}s "
                f"(min={self.min_trade_interval_sec}s)"
            )
        else:
            print(f"   ⏳ [Hold] Maintaining {self.current_position} position")
        if should_trade:
            if bias != "NEUTRAL":
                print(f"   🚀 [Executing] Attempting {bias} swap...")
                success = await self.execute_move(bias, conf, risk_percent)
                if success:
                    self.current_position = bias
                    self.last_trade_confidence = conf
                    self.last_trade_time = time.time()
                    # NEW: Log to DB so it shows in 'Decision Log'
                    trade_size = 0  # Default fallback
                    if bias == "LONG":
                        usdc_addr = os.getenv("USDC_CONTRACT") or os.getenv("USDC_ADDRESS")
                        if usdc_addr:
                            try:
                                trade_size = float(await self.wallet.get_token_balance(usdc_addr)) * conf * 0.99
                            except Exception:
                                trade_size = 0
                    elif bias == "SHORT":
                        wsol_addr = os.getenv("WSOL_CONTRACT")
                        if wsol_addr:
                            try:
                                trade_size = float(await self.wallet.get_token_balance(wsol_addr)) * conf * 0.99
                            except Exception:
                                trade_size = 0
                    # If a trade was executed, try to log the tradeId if available
                    trade_id = None
                    if hasattr(self.trading, 'last_trade_id'):
                        trade_id = getattr(self.trading, 'last_trade_id', None)
            else:
                # Smart Exit logic: pass confidence and risk_percent
                success = await self.execute_move("NEUTRAL", conf, risk_percent)
                if success:
                    if conf > 0.80:
                        self.current_position = "NEUTRAL"
                    self.last_trade_confidence = conf
                    self.last_trade_time = time.time()

    def _get_token_decimals(self, token_address):
        if token_address in self._token_decimals_cache:
            return self._token_decimals_cache[token_address]
        try:
            # Use Solana WalletManager's method for SPL tokens
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

        # Direction: LONG = Buy WSOL using USDC | SHORT = Sell WSOL to USDC
        if action == "LONG":
            token_in, token_out, addr_in = "USDC", "WSOL", usdc_addr
        elif action == "SHORT":
            token_in, token_out, addr_in = "WSOL", "USDC", wsol_addr
        elif action == "NEUTRAL":
            # No-op for NEUTRAL, or could implement scale-out logic
            print("   [NEUTRAL] No trade executed.")
            return True
        else:
            return False

        # Use risk_percent for position sizing
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
        # Position sizing: use risk_percent (already clamped)
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

                # Log swap to transaction logger
                logger = get_logger()
                logger.log_swap(
                    tx_hash=result,
                    token_in=token_in,
                    token_out=token_out,
                    amount_in=amount_in,
                    amount_out=0,  # Would need to calculate from swap result
                    price_impact=0,
                    status="confirmed"
                )
                self._last_logged_swap_tx = result
                
            # Log structured JSON for the frontend (always when swap succeeds)
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