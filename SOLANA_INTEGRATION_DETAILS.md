# Solana Integration Architecture

## 1. x402 Payment Protocol

### What is x402?
HTTP 402 is a "Payment Required" status code. The x402 protocol uses it to implement micropayments for data and services.

### How it's integrated:
```
Agent                    x402 Facilitator              Data Provider
  |                          |                              |
  +---(Payment Request)------>|                              |
  |                          |---(Forward Request)----------->|
  |                          |                              |
  |                          |<---(Service Response)---------|
  |<---(Sign Response)--------|                              |
  |                          |                              |
```

### Configuration:
- **Facilitator URL**: `https://x402.org/facilitator`
- **Payment Token**: USDC (Solana SPL)
- **Wallet**: Solana keypair in `WalletManager`

### Usage Example:
```python
# From wallet_manager.py
facilitator_url = os.getenv("X402_FACILITATOR_URL")
# Uses transfer_usdc() for micropayments to data providers
```

## 2. Raydium DEX Integration

### What is Raydium?
Raydium is a Uniswap V2-compatible automated market maker (AMM) on Solana, providing low-cost, high-speed trading.

### Trading Pair
- **Pool**: WSOL ⟷ USDC
- **Fee**: 0.25% (standard)
- **Devnet Pool**: Exists on Solana Devnet for testing

### Program IDs (Same on Devnet & Mainnet)
```
RAYDIUM_PROGRAM_ID    = 675kPX9MHTjS2zt1qLCXVJ4JSaqE1sgE4wcaxNac4c8
RAYDIUM_AUTHORITY     = 5Q544fKrFoe6tsEbD7K5QKLCvCL7BXh4VzvGLwAa1p1s
```

### Integration Points

#### 1. Token Mints
```python
USDC_MINT  = EPjFWaJmqxiGAW9HfqLj3hRpB8kJqEHrL35JGBaYEPs
WSOL_MINT  = So11111111111111111111111111111111111111112
```

#### 2. Swap Instruction Flow
```
TradingEngine.execute_swap()
    ↓
WalletManager.execute_swap()
    ↓
Raydium Program (Via Seahorse)
    ├─ Get Pool Account
    ├─ Calculate amounts out
    ├─ Build swap instruction
    ├─ Sign transaction
    └─ Send to Solana Devnet/Mainnet
```

#### 3. Seahorse Implementation (Coming Soon)
```rust
// Pseudo-code for Seahorse program
#[derive(Accounts)]
pub struct Swap<'info> {
    pub user: Signer<'info>,
    pub user_token_in: Account<'info, TokenAccount>,
    pub user_token_out: Account<'info, TokenAccount>,
    pub pool_state: Account<'info, PoolState>,
    pub token_program: Program<'info, Token>,
}

pub fn swap(ctx: Context<Swap>, amount_in: u64) -> Result<()> {
    // Call Raydium swap logic
    // Update pool reserves
    // Transfer tokens
    Ok(())
}
```

## 3. SPL Token Integration

### SPL (Solana Program Library) Tokens
Unlike ERC20 (Ethereum), Solana tokens follow the SPL standard.

### Key Differences
| Aspect | ERC20 | SPL |
|--------|-------|-----|
| Storage | Contract state | Token Accounts |
| Balance Query | `balanceOf(address)` | Account data parsing |
| Transfer | `transfer()` function | `transfer_checked` instruction |
| Decimals | Contract metadata | Mint account data |
| Approvals | `approve()` → `transferFrom()` | Direct owner signature |

### Integration in WalletManager
```python
# Get SPL token balance
from spl.token.instructions import get_associated_token_address

ata = get_associated_token_address(
    owner=keypair.pubkey(),
    mint=Pubkey.from_string(usdc_mint)
)

account_info = client.get_account_info(ata)
# Parse token amount from account data
amount = parse_token_amount(account_info.data)
```

## 4. Trading Flow

### LONG Trade (Buy WSOL with USDC)
```
1. User sends LONG signal with confidence
2. AI calculates USDC amount to spend
3. TradingEngine.execute_long(usdc_amount)
4. WalletManager queries USDC balance
5. Raydium swap:
   - Input:  usdc_amount USDC
   - Output: calculated WSOL
   - Fee:    0.25% of input
6. Transaction signed with Solana keypair
7. Sent to Solana Devnet RPC
8. Balance updated after confirmation
```

### SHORT Trade (Sell WSOL for USDC)
```
1. User sends SHORT signal with confidence
2. AI calculates WSOL amount to sell
3. TradingEngine.execute_short(wsol_amount)
4. WalletManager queries WSOL balance
5. Raydium swap:
   - Input:  wsol_amount WSOL
   - Output: calculated USDC
   - Fee:    0.25% of input
6. Transaction signed with Solana keypair
7. Sent to Solana Devnet RPC
8. Balance updated after confirmation
```

## 5. Configuration Map

### Environment Variables
```bash
# Wallet
WALLET_PRIVATE_KEY=<base58_private_key>

# Network
RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
CHAIN_ID=103

# Tokens
USDC_CONTRACT=EPjFWaJmqxiGAW9HfqLj3hRpB8kJqEHrL35JGBaYEPs
WSOL_CONTRACT=So11111111111111111111111111111111111111112

# Raydium
RAYDIUM_PROGRAM_ID=675kPX9MHTjS2zt1qLCXVJ4JSaqE1sgE4wcaxNac4c8
RAYDIUM_AUTHORITY=5Q544fKrFoe6tsEbD7K5QKLCvCL7BXh4VzvGLwAa1p1s

# x402 Payment
X402_FACILITATOR_URL=https://x402.org/facilitator

# Testing
SIMULATION_MODE=true|false
```

## 6. Price Calculation

### Raydium Price Formula (Uniswap V2)
```
amount_out = (amount_in * 997 * reserve_out) / (reserve_in * 1000 + amount_in * 997)
```

Where:
- `997/1000` = 0.3% fee deduction (Raydium standard)
- `reserve_in`, `reserve_out` = Pool liquidity reserves
- `amount_in` = User input amount (in smallest units)

### Slippage Protection
```python
# Calculate minimum output with slippage tolerance
min_amount_out = amount_out * (1 - slippage_percent / 100)
```

## 7. Devnet Testing Checklist

- [ ] Generate Solana keypair
- [ ] Request SOL from faucet (`solana airdrop`)
- [ ] Get USDC from SPL token faucet
- [ ] Verify USDC token account created
- [ ] Test balance queries
- [ ] Execute mock swap with SIMULATION_MODE=true
- [ ] Execute real swap with real tokens
- [ ] Verify pool reserves updated
- [ ] Test x402 payment flow

## 8. Production Deployment

### Switch to Mainnet
```bash
# Update .env
RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_CLUSTER=mainnet-beta
CHAIN_ID=101  # Mainnet chain ID

# Token mints are the same!
USDC_CONTRACT=EPjFWaJmqxiGAW9HfqLj3hRpB8kJqEHrL35JGBaYEPs
WSOL_CONTRACT=So11111111111111111111111111111111111111112
```

### Fund Mainnet Wallet
1. Get real SOL from exchange
2. Get real USDC from exchange
3. Update WALLET_PRIVATE_KEY with mainnet keypair
4. Run agent - trades will execute on real mainnet liquidity

## Files Using These Integrations

- `wallet_manager.py` - SPL token handling, x402 transfers
- `trading_engine.py` - WSOL/USDC trading logic
- `tools.py` - Raydium program configuration
- `main.py` - Wallet initialization
- `predictive_agent.py` - Trading signal execution
- `node_connector.py` - Data provider payment (x402)

---

**Status**: Framework complete, Seahorse implementation pending
**Last Updated**: March 4, 2026
