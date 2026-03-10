# contract/mint_usdc.py
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
    print("[mint_usdc.py] Requesting USDC for Devnet...")
    wallet = WalletManager()
    
    if wallet.simulation_mode:
        print("✅ [SIMULATION] 1000.0 Mock USDC added to wallet.")
    else:
        # In a real devnet scenario, this would call an SPL token faucet
        # or use the spl-token CLI via subprocess
        print(f"Minting USDC to: {wallet.address}")
        print("Run: 'spl-token mint " + wallet.usdc_mint + " 1000'")
    
    sys.exit(0)

if __name__ == "__main__":
    main()