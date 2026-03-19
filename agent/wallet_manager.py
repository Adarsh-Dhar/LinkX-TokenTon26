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
    from spl.token.instructions import (
        transfer_checked,
        TransferCheckedParams,
        get_associated_token_address,
        create_associated_token_account,
    )
    from solana.rpc.api import Client
    from solana.rpc.types import TxOpts
except ImportError as e:
    print(f"⚠️ [WalletManager] Required package not installed: {e}")
    raise


def get_daily_spend():
    spend_file = os.path.join(os.path.dirname(__file__), 'daily_spend.json')
    today = datetime.now().strftime('%Y-%m-%d')
    if not os.path.exists(spend_file):
        return 0.0
    try:
        with open(spend_file, 'r') as f:
            data = json.load(f)
        return float(data.get(today, 0.0))
    except:
        return 0.0


def add_spend(amount):
    spend_file = os.path.join(os.path.dirname(__file__), 'daily_spend.json')
    today = datetime.now().strftime('%Y-%m-%d')
    data = {}
    if os.path.exists(spend_file):
        try:
            with open(spend_file, 'r') as f:
                data = json.load(f)
        except:
            data = {}
    data[today] = float(data.get(today, 0.0)) + float(amount)
    with open(spend_file, 'w') as f:
        json.dump(data, f)


class WalletManager:

    def get_balance(self, token='USDC'):
        """Synchronous wrapper for legacy scripts."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                mint_str = self.usdc_mint if token == 'USDC' else self.wsol_mint
                return float(self.client.get_token_account_balance(
                    get_associated_token_address(
                        self.keypair.pubkey(),
                        Pubkey.from_string(mint_str)
                    )
                ).value.ui_amount or 0.0)
            else:
                return asyncio.run(self.get_token_balance(token))
        except:
            return 0.0

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
        self.usdc_mint = os.getenv("USDC_CONTRACT", "").strip()
        self.wsol_mint = os.getenv("WSOL_CONTRACT", "So11111111111111111111111111111111111111112").strip()

        if not self.usdc_mint:
            raise ValueError("❌ USDC_CONTRACT not set in .env")

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
            self.keypair = (
                Keypair.from_bytes(pk_bytes)
                if len(pk_bytes) == 64
                else Keypair.from_seed(pk_bytes)
            )
            self.address = str(self.keypair.pubkey())
            print(f"✅ [WalletManager] Connected. Wallet: {self.address}")
            print(f"   💎 USDC mint: {self.usdc_mint}")

    async def get_balances(self):
        usdc = await self.get_token_balance('USDC')
        wsol = await self.get_token_balance('WSOL')
        return {'usdc': usdc, 'wsol': wsol}

    async def get_token_balance(self, token='USDC'):
        try:
            if self.simulation_mode:
                return 950.0 if token == 'USDC' else 0.5

            mint_str = (
                self.usdc_mint if token == 'USDC'
                else (self.wsol_mint if token == 'WSOL' else token)
            )
            mint_pubkey = Pubkey.from_string(mint_str.strip())
            ata = get_associated_token_address(self.keypair.pubkey(), mint_pubkey)
            res = self.client.get_token_account_balance(ata)
            if res.value is None:
                return 0.0
            balance = float(res.value.ui_amount or 0.0)
            if token == 'USDC':
                return max(0.0, balance - 5.0)
            if token == 'WSOL':
                return max(0.0, balance - 0.05)
            return balance
        except Exception as e:
            print(f"❌ [WalletManager] Balance Error ({token}): {e}")
            return 0.0

    def transfer_usdc(self, destination, amount):
        """
        x402 payment: send USDC to a provider wallet.
        Automatically creates destination ATA if it doesn't exist.
        """
        if self.simulation_mode:
            tx = uuid.uuid4().hex
            add_spend(amount)
            return tx

        try:
            # Strip whitespace from all addresses to prevent decode errors
            dest_str = destination.strip()
            mint_str = self.usdc_mint.strip()

            dest_pubkey = Pubkey.from_string(dest_str)
            mint_pubkey = Pubkey.from_string(mint_str)
            sender_ata = get_associated_token_address(self.keypair.pubkey(), mint_pubkey)
            dest_ata = get_associated_token_address(dest_pubkey, mint_pubkey)
            decimals = self._get_token_decimals(mint_str)
            amount_lamports = int(amount * (10 ** decimals))

            print(f"   🔍 [x402] Sender ATA: {sender_ata}")
            print(f"   🔍 [x402] Dest ATA:   {dest_ata}")
            print(f"   🔍 [x402] Amount:     {amount} USDC = {amount_lamports} lamports")

            instructions = []

            # ── Check and create sender ATA if missing ────────────────────
            src_info = self.client.get_account_info(sender_ata)
            if src_info.value is None:
                print("   ⚠️  [x402] Sender ATA missing — creating it first")
                instructions.append(
                    create_associated_token_account(
                        payer=self.keypair.pubkey(),
                        owner=self.keypair.pubkey(),
                        mint=mint_pubkey,
                    )
                )

            # ── Check and create destination ATA if missing ───────────────
            dest_info = self.client.get_account_info(dest_ata)
            if dest_info.value is None:
                print(f"   ⚠️  [x402] Dest ATA missing for {dest_str} — creating it")
                instructions.append(
                    create_associated_token_account(
                        payer=self.keypair.pubkey(),
                        owner=dest_pubkey,
                        mint=mint_pubkey,
                    )
                )

            # ── Transfer instruction ──────────────────────────────────────
            instructions.append(
                transfer_checked(
                    TransferCheckedParams(
                        program_id=TOKEN_PROGRAM_ID,
                        source=sender_ata,
                        mint=mint_pubkey,
                        dest=dest_ata,
                        owner=self.keypair.pubkey(),
                        amount=amount_lamports,
                        decimals=decimals,
                    )
                )
            )

            recent_blockhash = self.client.get_latest_blockhash().value.blockhash
            message = MessageV0.try_compile(
                payer=self.keypair.pubkey(),
                instructions=instructions,
                address_lookup_table_accounts=[],
                recent_blockhash=recent_blockhash,
            )

            transaction = VersionedTransaction(message, [self.keypair])
            resp = self.client.send_raw_transaction(bytes(transaction))
            tx_hash = str(resp.value)
            print(f"✅ [x402] Paid {amount} USDC → {dest_str}. Hash: {tx_hash}")
            add_spend(amount)
            return tx_hash

        except Exception as e:
            print(f"❌ [WalletManager] Transfer failed: {e}")
            import traceback
            traceback.print_exc()
            return None

    def _get_token_decimals(self, mint_address):
        clean = (mint_address or "").strip()
        if clean == self.usdc_mint.strip():
            return 6
        if clean == self.wsol_mint.strip():
            return 9
        return 6

    def execute_swap(self, token_in, token_out, amount):
        print(f"🔄 Executing swap via TradingEngine...")
        return None