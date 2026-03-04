

import os
import sys
import threading
from dotenv import load_dotenv

# Fix import path if run as a script
if __name__ == "__main__":
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from agent.wallet_manager import WalletManager
from agent.trading_engine import TradingEngine
from agent.autonomous_loop import run_autonomous_loop

class MarketManager:
    def get_market_state(self):
        import requests
        try:
            resp = requests.get("http://localhost:3600/api/market/nodes", timeout=2)
            if resp.status_code == 200:
                return {"nodes": resp.json()}
        except:
            pass
        return {"nodes": []}

class IntelligentAgent:
    def __init__(self):
        # Load .env for Solana configuration
        from pathlib import Path
        from dotenv import load_dotenv
        project_root = Path(__file__).parent.parent
        env_file = project_root / '.env'

        if env_file.exists():
            load_dotenv(env_file)
        
        print("🤖 [Main] Initializing Intelligent Agent (Solana Devnet)...")
        print(f"   🔗 RPC: {os.getenv('RPC_URL', 'https://api.devnet.solana.com')}")
        print(f"   💳 x402 Facilitator: {os.getenv('X402_FACILITATOR_URL', 'https://x402.org/facilitator')}")
        
        # 1. Wallet (Solana)
        private_key = os.getenv("WALLET_PRIVATE_KEY")
        rpc_url = os.getenv("RPC_URL", "https://api.devnet.solana.com")
        
        if not private_key:
            print("   ⚠️  WALLET_PRIVATE_KEY not set - enabling SIMULATION_MODE")
            os.environ["SIMULATION_MODE"] = "true"
        
        self.wallet = WalletManager(private_key, rpc_url)
        print(f"   ✅ Wallet: {self.wallet.address}")
        
        # 2. Market
        self.market = MarketManager()
        
        # 3. Trader (CRITICAL STEP) - WSOL/USDC trading on Solana
        self.trader = TradingEngine(self.wallet)
        print(f"   ✅ TradingEngine: Ready (WSOL/USDC pair)")
        
        # 4. Pipeline (for PredictiveAgent)
        from agent.data_pipeline import DataPipeline
        self.pipeline = DataPipeline(self.market)

    def start(self):
        print("🚀 [Main] Agent Manual Start")
        loop_thread = threading.Thread(target=run_autonomous_loop, args=(self,), daemon=True)
        loop_thread.start()
        return self

if __name__ == "__main__":
    agent = IntelligentAgent()
    agent.start()
    import time
    while True: time.sleep(1)