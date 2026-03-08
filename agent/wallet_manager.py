import os
import base58
import json
import uuid
from datetime import datetime
# agent/wallet_manager.py

try:
    from solders.keypair import Keypair
    from solders.pubkey import Pubkey
    from solders.rpc.responses import RpcConfirmedTransactionStatusWithSignature
    from spl.token.client import Token
    from spl.token.constants import TOKEN_PROGRAM_ID
    from solana.rpc.api import Client
    from solana.rpc.types import TxOpts
    from solders.transaction import Transaction
except ImportError:
    print("\u26a0\ufe0f  [WalletManager] solders or solana not installed. Install with: pip install solders solana")
    Keypair = None
    Client = None


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
    # If no limit is set, always allow
    if max_limit is None:
        return True
    spent = get_daily_spend()
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
        """Initialize Solana wallet manager.
        
        Args:
            private_key: Base58-encoded Solana private key (or leave empty for devnet simulation)
            rpc_url: Solana RPC endpoint (defaults to devnet)
        """
        self.private_key = private_key or os.getenv("WALLET_PRIVATE_KEY")
        self.rpc_url = rpc_url or os.getenv("RPC_URL", "https://api.devnet.solana.com")
        self.simulation_mode = os.getenv("SIMULATION_MODE", "false").lower() == "true"
        
        # Solana token mints from environment
        self.usdc_mint = os.getenv("USDC_CONTRACT", "EPjFWaJmqxiGAW9HfqLj3hRpB8kJqEHrL35JGBaYEPs")
        self.wsol_mint = os.getenv("WSOL_CONTRACT", "So11111111111111111111111111111111111111112")
        
        # Token symbol to mint mapping
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
                # Initialize RPC client
                self.client = Client(self.rpc_url)
                
                # Parse private key and create keypair
                if not self.private_key:
                    raise ValueError("❌ WALLET_PRIVATE_KEY not set. Generate one or enable SIMULATION_MODE.")
                
                # Decode base58 private key to bytes
                private_key_bytes = base58.b58decode(self.private_key)
                if Keypair is None:
                    raise ImportError("solana package not available. Please install with: pip install solana")
                # solders Keypair.from_bytes expects 64 bytes (private + public)
                if len(private_key_bytes) == 64:
                    self.keypair = Keypair.from_bytes(private_key_bytes)
                elif len(private_key_bytes) == 32:
                    self.keypair = Keypair.from_seed(private_key_bytes)
                else:
                    raise ValueError(f"Private key must be 32 or 64 bytes, got {len(private_key_bytes)} bytes.")
                self.address = str(self.keypair.pubkey())
                
                print(f"✅ [WalletManager] Connected to {self.rpc_url}")
                print(f"   Wallet: {self.address}")
                
                # Test connection (removed get_health, not available in solana-py)
                # Optionally, you could do a simple get_balance or get_version call here if needed
                
            except Exception as e:
                print(f"❌ [WalletManager] Failed to initialize: {e}")
                raise

    def get_balance(self, token='USDC'):
        """Get current token balance for the wallet.
        
        Args:
            token: Token symbol ('USDC', 'WSOL') or mint address
            
        Returns:
            Balance as float (in decimal units, not lamports)
        """
        # In simulation mode, return mock balances
        if self.simulation_mode:
            if token in ['USDC', self.usdc_mint]:
                return 1000.0  # Mock 1000 USDC
            elif token in ['WSOL', self.wsol_mint]:
                return 10.0    # Mock 10 WSOL
            else:
                return 0.0
        
        try:
            # Resolve token symbol to mint address
            if token == 'USDC':
                mint = self.usdc_mint
            elif token == 'WSOL':
                mint = self.wsol_mint
            else:
                mint = token
            
            # Get associated token account
            from spl.token.instructions import get_associated_token_address
            
            associated_token_account = get_associated_token_address(
                owner=self.keypair.pubkey(),
                mint=Pubkey.from_string(mint)
            )
            
            # Fetch account info
            account_info = self.client.get_account_info(associated_token_account)
            
            if account_info.value is None:
                print(f"⚠️  [WalletManager] No {token} token account found")
                return 0.0
            
            # Parse SPL token account data
            # TokenAccount layout: mint (32) + owner (32) + amount (8) + ...
            account_data = account_info.value.data
            amount_bytes = account_data[64:72]  # Extract amount field
            amount_lamports = int.from_bytes(amount_bytes, 'little')
            
            # Get decimals for the token
            decimals = self._get_token_decimals(mint)
            
            # Convert lamports to decimal units
            balance = amount_lamports / (10 ** decimals)
            return float(balance)
            
        except Exception as e:
            print(f"   ❌ [WalletManager] Error getting {token} balance: {e}")
            return 0.0

    def transfer_usdc(self, destination, amount):
        """Transfer USDC to destination address using x402 protocol.
        
        Args:
            destination: Destination wallet address
            amount: Amount of USDC to transfer
            
        Returns:
            Transaction signature or None on failure
        """
        # Support simulation mode for testing
        if self.simulation_mode:
            mock_tx_hash = uuid.uuid4().hex[:64]
            print(f"   💳 [SIMULATION] Mock USDC transfer: {amount} USDC to {destination}")
            print(f"   📋 [Mock TX] {mock_tx_hash}")
            add_spend(amount)
            return mock_tx_hash
        
        try:
            from spl.token.instructions import transfer_checked
            from spl.token.instructions import get_associated_token_address
            
            # Recipient pubkey
            recipient_pubkey = Pubkey.from_string(destination)
            
            # Get sender's USDC token account
            sender_token_account = get_associated_token_address(
                owner=self.keypair.pubkey(),
                mint=Pubkey.from_string(self.usdc_mint)
            )
            
            # Get recipient's USDC token account (or create if needed)
            recipient_token_account = get_associated_token_address(
                owner=recipient_pubkey,
                mint=Pubkey.from_string(self.usdc_mint)
            )
            
            # Convert amount to lamports
            decimals = self._get_token_decimals(self.usdc_mint)
            amount_lamports = int(amount * (10 ** decimals))
            
            # Create transaction
            transaction = Transaction()
            
            # Add transfer instruction
            transfer_instr = transfer_checked(
                program_id=TOKEN_PROGRAM_ID,
                source=sender_token_account,
                mint=Pubkey.from_string(self.usdc_mint),
                dest=recipient_token_account,
                owner=self.keypair.pubkey(),
                amount=amount_lamports,
                decimals=decimals,
                signers=[]
            )
            
            transaction.add(transfer_instr)
            
            # Sign and send
            recent_blockhash = self.client.get_latest_blockhash().value.blockhash
            transaction.recent_blockhash = recent_blockhash
            transaction.sign([self.keypair])
            
            signature = self.client.send_raw_transaction(
                transaction.serialize(),
                opts=TxOpts(skip_preflight=False, preflight_commitment='confirmed')
            )
            
            print(f"   💸 [WalletManager] Sent {amount} USDC to {destination}")
            print(f"   📋 Tx: {signature.value}")
            
            # Wait for confirmation
            confirmed = self.client.confirm_transaction(signature.value, commitment='confirmed')
            if confirmed.value[0]:
                print(f"   ✅ [WalletManager] Transaction confirmed")
            else:
                print(f"   ⚠️  [WalletManager] Transaction may still be pending")
            
            add_spend(amount)
            return signature.value
            
        except Exception as e:
            print(f"   ❌ [WalletManager] Transfer failed: {e}")
            import traceback
            traceback.print_exc()
            return None

    def execute_swap(self, token_in, token_out, amount):
        """Execute a swap on Raydium DEX.
        
        Args:
            token_in: Input token symbol or address
            token_out: Output token symbol or address
            amount: Amount to swap
            
        Returns:
            Transaction signature or None
        """
        # Placeholder - will be implemented in node_connector.py
        print(f"   ⚡ [WalletManager] Swap {amount} {token_in} to {token_out}")
        print(f"   📝 Full Raydium swap implementation in node_connector.py")
        return None

    def send_transaction(self, destination=None, amount=None, token_in=None, token_out=None):
        """Route transaction to appropriate handler.
        
        Args:
            destination: For transfers
            amount: Transfer/swap amount
            token_in: For swaps
            token_out: For swaps
            
        Returns:
            Transaction signature or None
        """
        if token_in and token_out:
            return self.execute_swap(token_in, token_out, amount)
        if destination and amount:
            return self.transfer_usdc(destination, amount)
        return None

    async def get_token_balance(self, token=None):
        """Async wrapper for get_balance."""
        return self.get_balance(token)

    def _get_token_decimals(self, mint_address):
        """Get token decimals from Solana blockchain.
        
        Args:
            mint_address: Token mint public key
            
        Returns:
            Number of decimals (usually 6 for USDC, 9 for native SOL)
        """
        try:
            mint_pubkey = Pubkey.from_string(mint_address)
            account_info = self.client.get_account_info(mint_pubkey)
            
            if account_info.value is None:
                # Default decimals for common tokens
                if mint_address == self.usdc_mint:
                    return 6
                elif mint_address == self.wsol_mint:
                    return 9
                return 6
            
            # MintAccount layout: supply (8) + decimals (1) + is_initialized (1) + owner (32)
            decimals = account_info.value.data[8]
            return decimals
            
        except Exception as e:
            print(f"   ⚠️  [WalletManager] Error getting decimals for {mint_address}: {e}")
            # Default to 6 (USDC standard)
            return 6
