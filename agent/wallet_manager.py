import os
import base58
import json
import uuid
import asyncio
from datetime import datetime

try:
    from solders.keypair import Keypair
    from solders.pubkey import Pubkey
    from solders.transaction import VersionedTransaction
    from solders.message import MessageV0
    from spl.token.constants import TOKEN_PROGRAM_ID
    from spl.token.instructions import transfer_checked, TransferCheckedParams, get_associated_token_address
    from solana.rpc.api import Client
    from solana.rpc.types import TxOpts
except ImportError as e:
    print(f"⚠️ [WalletManager] Required package not installed: {e}")
    raise

def get_daily_spend():
    spend_file = os.path.join(os.path.dirname(__file__), 'daily_spend.json')
    today = datetime.now().strftime('%Y-%m-%d')
    if not os.path.exists(spend_file): return 0.0
    try:
        with open(spend_file, 'r') as f:
            data = json.load(f)
        return float(data.get(today, 0.0))
    except: return 0.0

def add_spend(amount):
    spend_file = os.path.join(os.path.dirname(__file__), 'daily_spend.json')
    today = datetime.now().strftime('%Y-%m-%d')
    data = {}
    if os.path.exists(spend_file):
        try:
            with open(spend_file, 'r') as f: data = json.load(f)
        except: data = {}
    data[today] = float(data.get(today, 0.0)) + float(amount)
    with open(spend_file, 'w') as f: json.dump(data, f)

class WalletManager:
        # Legacy synchronous wrapper for scripts expecting get_balance
        def get_balance(self, token='USDC'):
            """Synchronous wrapper for legacy scripts like check_and_add_liquidity.py"""
            import asyncio
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    return float(self.client.get_token_account_balance(
                        get_associated_token_address(self.keypair.pubkey(), Pubkey.from_string(
                            self.usdc_mint if token == 'USDC' else self.wsol_mint
                        ))
                    ).value.ui_amount)
                else:
                    return asyncio.run(self.get_token_balance(token))
            except:
                return 0.0

        # Ensure send_transaction exists for agent and procurement logic
        def send_transaction(self, destination=None, amount=None, token_in=None, token_out=None):
            """Procurement logic often calls this generic method."""
            if destination and amount:
                return self.transfer_usdc(destination, amount)
            if token_in and token_out:
                return self.execute_swap(token_in, token_out, amount)
            return None
        def __init__(self, private_key=None, rpc_url=None):
            self.private_key = private_key or os.getenv("WALLET_PRIVATE_KEY")
            self.rpc_url = rpc_url or os.getenv("RPC_URL", "https://api.devnet.solana.com")
            self.simulation_mode = os.getenv("SIMULATION_MODE", "false").lower() == "true"
            self.usdc_mint = os.getenv("USDC_CONTRACT")
            self.wsol_mint = os.getenv("WSOL_CONTRACT", "So11111111111111111111111111111111111111112")

            if self.simulation_mode:
                print("⚠️  [WalletManager] SIMULATION_MODE enabled")
                self.client = None
                self.keypair = None
                self.address = "Dev1111111111111111111111111111111111111111"
            else:
                self.client = Client(self.rpc_url)
                if not self.private_key:
                    raise ValueError("❌ WALLET_PRIVATE_KEY not set.")
                pk_bytes = base58.b58decode(self.private_key)
                self.keypair = Keypair.from_bytes(pk_bytes) if len(pk_bytes) == 64 else Keypair.from_seed(pk_bytes)
                self.address = str(self.keypair.pubkey())
                print(f"✅ [WalletManager] Connected. Wallet: {self.address}")

        async def get_balances(self):
            """Returns a dict with usdc and wsol balances for the autonomous loop pre-flight check."""
            usdc = await self.get_token_balance('USDC')
            wsol = await self.get_token_balance('WSOL')
            return {'usdc': usdc, 'wsol': wsol}

        async def get_token_balance(self, token='USDC'):
            """The agent calls this with await, so it must be async."""
            try:
                if self.simulation_mode:
                    return 950.0 if token == 'USDC' else 0.5

                mint_str = self.usdc_mint if token == 'USDC' else (self.wsol_mint if token == 'WSOL' else token)
                mint_pubkey = Pubkey.from_string(mint_str)
                ata = get_associated_token_address(self.keypair.pubkey(), mint_pubkey)
                res = self.client.get_token_account_balance(ata)
                if res.value is None: return 0.0
                balance = float(res.value.ui_amount)
                # Reserve buffers so agent doesn't try to spend dust
                if token == 'USDC': return max(0.0, balance - 5.0)
                if token == 'WSOL': return max(0.0, balance - 0.05)
                return balance
            except Exception as e:
                print(f"❌ [WalletManager] Balance Error: {e}")
                return 0.0

        def transfer_usdc(self, destination, amount):
            """Internal method for x402 payments."""
            if self.simulation_mode:
                tx = uuid.uuid4().hex
                add_spend(amount)
                return tx

            try:
                dest_pubkey = Pubkey.from_string(destination)
                mint_pubkey = Pubkey.from_string(self.usdc_mint)
                sender_ata = get_associated_token_address(self.keypair.pubkey(), mint_pubkey)
                dest_ata = get_associated_token_address(dest_pubkey, mint_pubkey)
                decimals = self._get_token_decimals(self.usdc_mint)
                amount_lamports = int(amount * (10 ** decimals))

                ix = transfer_checked(
                    TransferCheckedParams(
                        program_id=TOKEN_PROGRAM_ID,
                        source=sender_ata,
                        mint=mint_pubkey,
                        dest=dest_ata,
                        owner=self.keypair.pubkey(),
                        amount=amount_lamports,
                        decimals=decimals
                    )
                )

                recent_blockhash = self.client.get_latest_blockhash().value.blockhash
                message = MessageV0.try_compile(
                    payer=self.keypair.pubkey(),
                    instructions=[ix],
                    address_lookup_table_accounts=[],
                    recent_blockhash=recent_blockhash
                )

                transaction = VersionedTransaction(message, [self.keypair])
                resp = self.client.send_raw_transaction(bytes(transaction))
                tx_hash = str(resp.value)
                print(f"✅ [x402] Paid {amount} USDC. Hash: {tx_hash}")
                add_spend(amount)
                return tx_hash

            except Exception as e:
                print(f"❌ [WalletManager] Transfer failed: {e}")
                return None

        def _get_token_decimals(self, mint_address):
            # Direct return for common tokens to save RPC calls
            if mint_address == self.usdc_mint: return 6
            if mint_address == self.wsol_mint: return 9
            return 6

        def execute_swap(self, token_in, token_out, amount):
            # This is called by PredictiveAgent during run_cycle
            print(f"🔄 Executing swap via TradingEngine...")
            # TradingEngine handles this logic
            return None