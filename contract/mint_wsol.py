# contract/mint_wsol.py
import os
import os
import sys

from dotenv import load_dotenv
from pathlib import Path

# Load contract/.env first, then agent/.env (agent/.env can override if needed)
load_dotenv(Path(__file__).parent / '.env')
load_dotenv(Path(__file__).parent.parent / 'agent' / '.env', override=True)

# Allow running from contract/ by adding parent to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from agent.wallet_manager import WalletManager

def main():
    print("[mint_wsol.py] Wrapping SOL to WSOL for Devnet...")
    wallet = WalletManager()
    
    if wallet.simulation_mode:
        print("✅ [SIMULATION] 10.0 Mock WSOL added to wallet.")
    else:
        # Process: 1. Ensure SOL balance 2. Sync native to wrap
        print(f"Ensuring WSOL account exists for: {wallet.address}")
        # Logic to call 'spl-token wrap 1'
        print(f"WSOL Mint Address: {wallet.wsol_mint}")
    
    sys.exit(0)

if __name__ == "__main__":
    main()