import os
import time
import threading
import fcntl

from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent.parent / '.env')

from agent.data_consumer import fetch_node_data
from agent.trading_engine import TradingEngine
from agent.wallet_manager import get_daily_spend

import asyncio
from agent.predictive_agent import PredictiveAgent

_LOOP_LOCK_FD = None


def _acquire_single_loop_lock():
    """Ensure only one autonomous loop runs across all local processes."""
    global _LOOP_LOCK_FD
    lock_path = "/tmp/linkx_agent_autonomous_loop.lock"
    fd = open(lock_path, "w")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fd.write(str(os.getpid()))
        fd.flush()
        _LOOP_LOCK_FD = fd
        return True
    except BlockingIOError:
        fd.close()
        return False

def run_autonomous_loop(agent, interval_sec=None):
    """
    Background thread that runs the predictive cycle with persistent PredictiveAgent instance.
    """
    if interval_sec is None:
        interval_sec = int(os.getenv("AGENT_LOOP_INTERVAL_SEC", "60"))

    if not _acquire_single_loop_lock():
        print("   ⚠️ [AutonomousLoop] Another agent loop is already running. Skipping.")
        return

    # Wait for startup to ensure Docker nodes and DB are ready
    time.sleep(5)

    # Use a single, persistent event loop for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    while True:
        try:
            # 1. Ensure Persistent PredictiveAgent exists
            if not hasattr(agent, 'current_predictive_instance') or agent.current_predictive_instance is None:
                print("   🧠 [AutonomousLoop] Initializing new PredictiveAgent instance...")
                wallet = getattr(agent, 'wallet', None)
                node_connector = getattr(agent, 'node_connector', None)
                trading_engine = getattr(agent, 'trader', None)
                
                # Check for strategist
                strategist = getattr(agent, 'strategist', None)
                if strategist is None:
                    from agent.tools import AlphaStrategist
                    strategist = AlphaStrategist()
                    agent.strategist = strategist
                
                # Use DataPipeline as the market analyst
                from agent.data_pipeline import DataPipeline
                market_analyst = DataPipeline(agent.market)
                
                agent.current_predictive_instance = PredictiveAgent(
                    wallet, node_connector, market_analyst, trading_engine, strategist
                )

            # 2. Pre-flight Check: Do we have liquidity to even try a trade?
            # If WSOL and USDC are both zero, x402 data procurement won't trigger.
            balances = loop.run_until_complete(agent.wallet.get_balances())
            if balances.get('usdc', 0) < 0.1 and balances.get('wsol', 0) < 0.01:
                print("   🛑 [AutonomousLoop] Insufficient liquidity to trade. Skipping cycle.")
            else:
                # 3. Run the Actual Predictive Cycle (where x402 happens)
                loop.run_until_complete(agent.current_predictive_instance.run_cycle())

        except Exception as e:
            import traceback
            if "429" in str(e):
                print(f"   ⏳ [AutonomousLoop] Rate limited. Waiting {interval_sec}s...")
            else:
                print(f"   ❌ [AutonomousLoop Error] {e}")
                traceback.print_exc()

        time.sleep(interval_sec)

def start_background_loop(agent):
    t = threading.Thread(target=run_autonomous_loop, args=(agent,), daemon=True)
    t.start()
