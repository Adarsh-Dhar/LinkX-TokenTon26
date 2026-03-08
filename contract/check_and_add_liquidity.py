# contract/check_and_add_liquidity.py
import os
import sys
import sys
import os

# Allow running from contract/ by adding parent to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from agent.wallet_manager import WalletManager
from agent.trading_engine import TradingEngine

def main():
    print("[check_and_add_liquidity.py] Initializing Solana Liquidity Check...")
    wallet = WalletManager()
    engine = TradingEngine(wallet)
    
    # Check balances
    usdc_balance = wallet.get_balance('USDC')
    wsol_balance = wallet.get_balance('WSOL')

    print(f"Current Balances - USDC: {usdc_balance}, WSOL: {wsol_balance}")

    if usdc_balance < 10.0 or wsol_balance < 0.1:
        print("⚠️  Low liquidity detected for testing. Please run mint_usdc.py and mint_wsol.py.")
    else:
        print("✅ Liquidity verified for local development.")
    
    # Implementation for Raydium liquidity provisioning would go here
    # currently handled via devnet faucet simulation in WalletManager
    sys.exit(0)

if __name__ == "__main__":
    main()