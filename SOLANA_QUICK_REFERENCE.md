# Solana Migration - Quick Reference

## What Changed?

### ✅ Token References
- **WCTC → WSOL** (wrapped SOL token)
- **CTC → SOL** (native Solana token)
- **USDC** stays the same (different mint address)

### ✅ Blockchain
- **Solana** (EVM-based) → **Solana Devnet** (parallel processing)
- **RPC**: https://api.devnet.solana.com → https://api.devnet.solana.com
- **Chain ID**: 1337 → 103

### ✅ DEX Integration  
- **VVS Router** (Cronos fork) → **Raydium** (Solana native)
- **Token Standard**: ERC20 → SPL (Solana Program Library)

### ✅ Wallet Format
- **Private Key**: Hex (0x...) → Base58 (Solana keypair)
- **Wallet Address**: Ethereum addresses → Solana public keys

### ✅ Payment Protocol
- **x402 Facilitator**: https://x402.org/facilitator
- Used for data node payments in USDC

## Files Modified (10+ files)

| File | Changes |
|------|---------|
| `.env` | Solana mints, RPC, Raydium program IDs |
| `wallet_manager.py` | Solana-py integration, SPL tokens |
| `trading_engine.py` | WSOL/USDC pair, trading logic |
| `main.py` | Solana wallet initialization |
| `predictive_agent.py` | Token references updated |
| `tools.py` | Raydium config, x402 URL |
| `api.py` | Solana network detection |
| `api_status.py` | Network name changed to "solana" |
| `requirements.txt` | Solana-py, Seahorse, base58 packages |
| `Dockerfile` | Solana dependencies |
| `docker-compose.yml` | Solana environment variables |
| `MAINNET_README.json` | Solana setup guide |

## Running the Agent

### 1. Setup Environment
```bash
cd /Users/adarsh/Documents/LinkX-TokenTon26/agent

# Enable simulation mode (no real transactions)
echo "SIMULATION_MODE=true" >> .env

# Or generate real wallet (see MAINNET_README.json)
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run Agent
```bash
# With simulation
python main.py

# Or start API server
uvicorn api:app --port 8080
```

## Key Integration Points

### Trading Flow
```
User Request
    ↓
AlphaStrategist (AI) → LONG/SHORT/NEUTRAL
    ↓
PredictiveAgent → Execute Trade
    ↓
TradingEngine → WSOL/USDC swap
    ↓
WalletManager → Raydium execution (via Seahorse)
    ↓
Solana Devnet → Transaction confirmed
```

### Token Handling
```
LONG:  USDC (source) → swap → WSOL (destination)
SHORT: WSOL (source) → swap → USDC (destination)
```

### x402 Payment
```
Data Node Request
    ↓
x402 Facilitator: https://x402.org/facilitator
    ↓
USDC Payment (via WalletManager)
    ↓
Transaction confirmed
```

## Testing Checklist

- [ ] Wallet initialization with SIMULATION_MODE=true
- [ ] Balance queries for WSOL and USDC
- [ ] Mock swap execution
- [ ] AI trading signals generation
- [ ] x402 payment protocol flow
- [ ] API endpoints responding
- [ ] Docker container builds
- [ ] Real Devnet swaps (with test tokens)

## Common Issues & Solutions

### Issue: "WALLET_PRIVATE_KEY not set"
**Solution**: Either set the key in .env or enable SIMULATION_MODE=true

### Issue: "solana-py not installed"
**Solution**: `pip install solana-py seahorse-lang base58`

### Issue: "Invalid RPC URL"
**Solution**: Check RPC_URL in .env points to valid Solana endpoint

### Issue: "Token account not found"
**Solution**: Needs airdrop or swap to create SPL token account first

## Next Steps

1. ✅ **Done**: Full Solana migration
2. ⏳ **Next**: Implement Seahorse program for swaps
3. ⏳ **Then**: Test on Solana Devnet
4. ⏳ **Finally**: Deploy to Mainnet when ready

## Important Notes

- **All WCTC references** have been replaced with WSOL
- **All VVS references** have been replaced with Raydium
- **All RPC calls** now use Solana JSON-RPC format
- **Token approvals** now use SPL token instructions
- **Simulation mode** works without a real private key
- **Production** requires real SOL, USDC, or devnet testnet tokens
