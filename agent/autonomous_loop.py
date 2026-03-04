import os
import time
import threading
import fcntl

from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent.parent / '.env')

from agent.data_consumer import fetch_node_data
from agent.trading_engine import TradingEngine
from agent.wallet_manager import get_daily_spend, can_spend

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
        print("   ⚠️ [AutonomousLoop] Another agent loop is already running. Skipping duplicate loop start.")
        return

    # Wait for startup
    time.sleep(5)

    # --- Persistent PredictiveAgent instance ---
    if not hasattr(agent, 'current_predictive_instance') or agent.current_predictive_instance is None:
        # Ensure agent.pipeline exists, else create it
        pipeline = getattr(agent, 'pipeline', None)
        if pipeline is None:
            from agent.data_pipeline import DataPipeline
            pipeline = DataPipeline(agent.market)
            agent.pipeline = pipeline
        wallet = getattr(agent, 'wallet', None)
        node_connector = getattr(agent, 'node_connector', None)
        # Use pipeline as market_analyst (not agent.market)
        market_analyst = pipeline
        trading_engine = getattr(agent, 'trader', None)
        strategist = getattr(agent, 'strategist', None)
        if strategist is None:
            from agent.tools import AlphaStrategist
            strategist = AlphaStrategist()
            agent.strategist = strategist
        agent.current_predictive_instance = PredictiveAgent(wallet, node_connector, market_analyst, trading_engine, strategist)

    predictive_instance = agent.current_predictive_instance

    # Create a single asyncio event loop for the thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    while True:
        try:
            # Check if trader is initialized
            if not hasattr(agent, 'trader') or agent.trader is None:
                time.sleep(5)
                continue

            loop.run_until_complete(predictive_instance.run_cycle())

        except Exception as e:
            import traceback
            error_str = str(e)
            if "429" in error_str or "Too Many Requests" in error_str:
                print(f"   ⏳ [AutonomousLoop] Rate limited. Waiting {interval_sec}s before retry...")
            else:
                print(f"   ❌ [AutonomousLoop Error] {e}")
                traceback.print_exc()

        time.sleep(interval_sec)

def start_background_loop(agent):
    t = threading.Thread(target=run_autonomous_loop, args=(agent,), daemon=True)
    t.start()
