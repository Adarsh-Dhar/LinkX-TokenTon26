import os
from dotenv import load_dotenv
from pathlib import Path

# Load .env files
load_dotenv(Path(__file__).parent / '.env')
load_dotenv(Path(__file__).parent.parent / 'contract' / '.env', override=True)

from wallet_manager import WalletManager

def main():
    print("[DEBUG SCRIPT] --- ENVIRONMENT ---")
    print(f"WALLET_PRIVATE_KEY: {os.getenv('WALLET_PRIVATE_KEY')}")
    print(f"USDC_CONTRACT: {os.getenv('USDC_CONTRACT')}")
    print(f"WSOL_CONTRACT: {os.getenv('WSOL_CONTRACT')}")
    print(f"RPC_URL: {os.getenv('RPC_URL')}")
    print(f"SOLANA_CLUSTER: {os.getenv('SOLANA_CLUSTER')}")
    print(f"PWD: {os.getcwd()}")

    wallet = WalletManager()
    print("[DEBUG SCRIPT] --- WALLET ---")
    print(f"Wallet pubkey: {wallet.keypair.pubkey()}")
    print(f"USDC mint: {wallet.usdc_mint}")
    print(f"WSOL mint: {wallet.wsol_mint}")

    print("[DEBUG SCRIPT] --- RAW BALANCE ---")
    usdc_balance = wallet.get_balance('USDC')
    print(f"USDC balance (agent logic): {usdc_balance}")

if __name__ == "__main__":
    main()