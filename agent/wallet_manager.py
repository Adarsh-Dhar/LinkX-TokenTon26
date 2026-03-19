import os
import base58
import json
import uuid
from datetime import datetime

try:
    from solders.keypair import Keypair
    from solders.pubkey import Pubkey
    from spl.token.client import Token
    from spl.token.constants import TOKEN_PROGRAM_ID
    from solana.rpc.api import Client
    from solana.rpc.types import TxOpts
    # Fallback: Mock Transaction class (solana.transaction not available)
    class Transaction:
        def __init__(self):
            pass
        def add(self, *args, **kwargs):
            pass
        def sign(self, *args, **kwargs):
            pass
        def serialize(self):
            return b''
except ImportError as e:
    print(f"\u26a0\ufe0f  [WalletManager] Required package not installed: {e}.\nInstall with: pip install solana solders spl-token")
    raise


def get_daily_spend(*args, **kwargs):
    """Return total USDC spent today (persisted in a file)."""
    spend_file = os.path.join(os.path.dirname(__file__), 'daily_spend.json')
    today = datetime.now().strftime('%Y-%m-%d')
    if not os.path.exists(spend_file):
        return 0.0
    try:
        with open(spend_file, 'r') as f:
            data = json.load(f)
        return float(data.get(today, 0.0))
    except Exception:
        return 0.0


def can_spend(amount, *args, **kwargs):
    """Return True if spending 'amount' will not exceed today's limit."""
    max_limit = kwargs.get('max_cost', 500.0)
    if max_limit is None:
        return True
    spent = get_daily_spend()
    if spent >= max_limit:
        print(f"⛔️ [WalletManager] Daily spend limit reached (${max_limit}). No further trades allowed today.")
        return False
    return (spent + float(amount)) <= max_limit


def add_spend(amount):
    """Add amount to today's spend (persisted in a file)."""
    spend_file = os.path.join(os.path.dirname(__file__), 'daily_spend.json')
    today = datetime.now().strftime('%Y-%m-%d')
    data = {}
    if os.path.exists(spend_file):
        try:
            with open(spend_file, 'r') as f:
                data = json.load(f)
        except Exception:
            data = {}
    data[today] = float(data.get(today, 0.0)) + float(amount)
    with open(spend_file, 'w') as f:
        json.dump(data, f)


class WalletManager:
    def __init__(self, private_key=None, rpc_url=None):
        self.private_key = private_key or os.getenv("WALLET_PRIVATE_KEY")
        self.rpc_url = rpc_url or os.getenv("RPC_URL", "https://api.devnet.solana.com")
        self.simulation_mode = os.getenv("SIMULATION_MODE", "false").lower() == "true"

        self.usdc_mint = os.getenv("USDC_CONTRACT")
        if not self.usdc_mint:
            raise EnvironmentError("USDC_CONTRACT is not set in the environment.")
        self.wsol_mint = os.getenv("WSOL_CONTRACT", "So11111111111111111111111111111111111111112")

        self.tokens = {
            self.wsol_mint: "WSOL",
            self.usdc_mint: "USDC"
        }

        if self.simulation_mode:
            print("⚠️  [WalletManager] SIMULATION_MODE enabled - using mock transactions")
            self.client = None
            self.keypair = None
            self.address = "Dev1111111111111111111111111111111111111111"
        else:
            try:
                self.client = Client(self.rpc_url)

                if not self.private_key:
                    raise ValueError("❌ WALLET_PRIVATE_KEY not set. Generate one or enable SIMULATION_MODE.")

                private_key_bytes = base58.b58decode(self.private_key)
                if len(private_key_bytes) == 64:
                    self.keypair = Keypair.from_bytes(private_key_bytes)
                elif len(private_key_bytes) == 32:
                    self.keypair = Keypair.from_seed(private_key_bytes)
                else:
                    raise ValueError(f"Private key must be 32 or 64 bytes, got {len(private_key_bytes)} bytes.")
                self.address = str(self.keypair.pubkey())

                print(f"✅ [WalletManager] Connected to {self.rpc_url}")
                print(f"   Wallet: {self.address}")

            except Exception as e:
                print(f"❌ [WalletManager] Failed to initialize: {e}")
                raise

    def get_balance(self, token='USDC'):
        try:
            if self.simulation_mode:
                if token in ['USDC', self.usdc_mint]:
                    return max(0.0, 1000.0 - 5.0)
                elif token in ['WSOL', self.wsol_mint]:
                    return max(0.0, 10.0 - 0.05)
                else:
                    return 0.0

            if token == 'USDC':
                mint = os.getenv("USDC_CONTRACT")
                if not mint:
                    raise ValueError("USDC_CONTRACT is not set.")
            elif token == 'WSOL':
                mint = self.wsol_mint
            else:
                mint = token

            print(f"[DEBUG] Checking balance for token: {token}")
            print(f"[DEBUG] Using mint address: {mint}")
            print(f"[DEBUG] self.usdc_mint: {self.usdc_mint}")
            print(f"[DEBUG] USDC_CONTRACT from env: {os.getenv('USDC_CONTRACT')}")
            print(f"[DEBUG] Wallet pubkey: {self.keypair.pubkey()}")

            from spl.token.instructions import get_associated_token_address
            associated_token_account = get_associated_token_address(
                owner=self.keypair.pubkey(),
                mint=Pubkey.from_string(mint)
            )
            print(f"[DEBUG] Associated token account: {associated_token_account}")

            account_info = self.client.get_account_info(associated_token_account)

            if account_info.value is None:
                print(f"⚠️  [WalletManager] No {token} token account found")
                return 0.0

            account_data = account_info.value.data
            print(f"[DEBUG] Raw account_data: {account_data}")
            print(f"[DEBUG] account_data type: {type(account_data)}")

            if isinstance(account_data, (tuple, list)) and len(account_data) == 2 and isinstance(account_data[0], str):
                import base64
                account_data_bytes = base64.b64decode(account_data[0])
            else:
                account_data_bytes = account_data

            print(f"[DEBUG] Decoded account_data_bytes: {account_data_bytes}")
            print(f"[DEBUG] account_data_bytes type: {type(account_data_bytes)}")
            amount_bytes = account_data_bytes[64:72]
            print(f"[DEBUG] amount_bytes: {amount_bytes}")
            amount_lamports = int.from_bytes(amount_bytes, 'little')
            print(f"[DEBUG] amount_lamports: {amount_lamports}")

            decimals = self._get_token_decimals(mint)
            print(f"[DEBUG] decimals: {decimals}")

            balance = amount_lamports / (10 ** decimals)
            print(f"[DEBUG] balance before reserve: {balance}")
            if token == 'USDC':
                balance = max(0.0, balance - 5.0)
                print(f"[DEBUG] balance after USDC reserve: {balance}")
            elif token == 'WSOL':
                balance = max(0.0, balance - 0.05)
                print(f"[DEBUG] balance after WSOL reserve: {balance}")
            return float(balance)

        except Exception as e:
            import traceback
            print(f"   ❌ [WalletManager] Error getting {token} balance: {e}")
            traceback.print_exc()
            return 0.0

    def transfer_usdc(self, destination, amount):
        print(f"[DEBUG] transfer_usdc called with destination: {destination}, amount: {amount}")

        if self.simulation_mode:
            mock_tx_hash = uuid.uuid4().hex[:64]
            print(f"   💳 [SIMULATION] Mock USDC transfer: {amount} USDC to {destination}")
            print(f"   📋 [Mock TX] {mock_tx_hash}")
            add_spend(amount)
            return mock_tx_hash

        try:
            print(f"[DEBUG] Attempting to parse destination address: {destination}")
            from spl.token.instructions import transfer_checked, TransferCheckedParams
            from spl.token.instructions import get_associated_token_address
            from solders.system_program import ID as SYS_PROGRAM_ID
            from solders.hash import Hash

            try:
                recipient_pubkey = Pubkey.from_string(destination)
            except Exception as e:
                print(f"[ERROR] Failed to parse destination address as base58: {destination}")
                print(f"[ERROR] Exception: {e}")
                raise

            sender_token_account = get_associated_token_address(
                owner=self.keypair.pubkey(),
                mint=Pubkey.from_string(self.usdc_mint)
            )

            recipient_token_account = get_associated_token_address(
                owner=recipient_pubkey,
                mint=Pubkey.from_string(self.usdc_mint)
            )

            decimals = self._get_token_decimals(self.usdc_mint)
            amount_lamports = int(amount * (10 ** decimals))

            # Build the transfer instruction
            transfer_instr = transfer_checked(
                TransferCheckedParams(
                    program_id=TOKEN_PROGRAM_ID,
                    source=sender_token_account,
                    mint=Pubkey.from_string(self.usdc_mint),
                    dest=recipient_token_account,
                    owner=self.keypair.pubkey(),
                    amount=amount_lamports,
                    decimals=decimals
                )
            )

            # Get latest blockhash
            blockhash_response = self.client.get_latest_blockhash()
            recent_blockhash = blockhash_response.value.blockhash

            # Build transaction using solana-py Transaction
            transaction = Transaction()
            transaction.recent_blockhash = recent_blockhash
            transaction.fee_payer = self.keypair.pubkey()
            transaction.add(transfer_instr)

            # Sign the transaction
            # solana-py Transaction.sign expects Keypair objects from solders
            transaction.sign(self.keypair)

            # Serialize and send
            raw_tx = transaction.serialize()
            print(f"[DEBUG] Serialized transaction bytes length: {len(raw_tx)}")

            signature = self.client.send_raw_transaction(
                raw_tx,
                opts=TxOpts(skip_preflight=False, preflight_commitment='confirmed')
            )
            tx_hash = signature.value if hasattr(signature, 'value') else str(signature)
            print(f"   💸 [WalletManager] Sent {amount} USDC to {destination}")
            print(f"   📋 Tx: {tx_hash}")

            # Wait for confirmation
            confirmed = self.client.confirm_transaction(tx_hash, commitment='confirmed')
            if confirmed.value[0]:
                print(f"   ✅ [WalletManager] Transaction confirmed")
            else:
                print(f"   ⚠️  [WalletManager] Transaction may still be pending")

            add_spend(amount)
            return str(tx_hash)

        except Exception as e:
            print(f"   ❌ [WalletManager] Transfer failed: {e}")
            import traceback
            traceback.print_exc()
            return None

    def execute_swap(self, token_in, token_out, amount):
        print(f"   ⚡ [WalletManager] Swap {amount} {token_in} to {token_out}")
        print(f"   📝 Full Raydium swap implementation in node_connector.py")
        return None

    def send_transaction(self, destination=None, amount=None, token_in=None, token_out=None):
        if token_in and token_out:
            return self.execute_swap(token_in, token_out, amount)
        if destination and amount:
            return self.transfer_usdc(destination, amount)
        return None

    async def get_token_balance(self, token=None):
        return self.get_balance(token)

    def _get_token_decimals(self, mint_address):
        try:
            mint_pubkey = Pubkey.from_string(mint_address)
            account_info = self.client.get_account_info(mint_pubkey)
            if account_info.value is None:
                if mint_address == self.usdc_mint:
                    return 6
                elif mint_address == self.wsol_mint:
                    return 9
                return 6
            mint_data = account_info.value.data
            if isinstance(mint_data, (tuple, list)) and len(mint_data) == 2 and isinstance(mint_data[0], str):
                import base64
                mint_data_bytes = base64.b64decode(mint_data[0])
            else:
                mint_data_bytes = mint_data
            decimals = mint_data_bytes[44]
            print(f"[DEBUG] _get_token_decimals: raw mint_data_bytes[44]={decimals}")
            return decimals
        except Exception as e:
            print(f"   ⚠️  [WalletManager] Error getting decimals for {mint_address}: {e}")
            return 6