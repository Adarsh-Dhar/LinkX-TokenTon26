# 📊 Transaction Logging Guide

## Overview
The system now logs **all x402 payments and swap transactions** with full transaction hashes and details.

---

## 📁 Transaction Log Files

### Main Transaction Log
**File**: `agent/transaction_log.json`

Contains all x402 payments and swaps with full details:
```json
{
  "x402_payments": [
    {
      "timestamp": "2026-03-02T17:55:52.123456",
      "tx_hash": "0x123abc...",
      "amount_usdc": 0.5,
      "recipient_wallet": "0xABC123...",
      "node_id": "sentiment-node-1",
      "node_name": "Alternative Intelligence & Sentiment",
      "data_type": "sentiment",
      "status": "confirmed"
    }
  ],
  "swaps": [
    {
      "timestamp": "2026-03-02T17:55:52.654321",
      "tx_hash": "0x456def...",
      "token_in": "USDC",
      "token_out": "WSOL",
      "amount_in": 0.004987,
      "amount_out": 0,
      "price_impact": null,
      "status": "confirmed"
    }
  ]
}
```

### Daily Budget Tracking
**File**: `agent/daily_spend.json`

Tracks total x402 USDC spent per day:
```json
{
  "2026-03-02": 2.5,
  "2026-03-01": 1.8,
  "2026-02-28": 0.0
}
```

---

## 📋 Viewing Transactions

### View all transactions (full JSON):
```bash
cat agent/transaction_log.json | jq .
```

### View only x402 payments:
```bash
cat agent/transaction_log.json | jq '.x402_payments'
```

### View only swaps:
```bash
cat agent/transaction_log.json | jq '.swaps'
```

### Count transactions today:
```bash
cat agent/transaction_log.json | jq '.x402_payments | length'
cat agent/transaction_log.json | jq '.swaps | length'
```

### View latest x402 payment:
```bash
cat agent/transaction_log.json | jq '.x402_payments[-1]'
```

### View latest swap:
```bash
cat agent/transaction_log.json | jq '.swaps[-1]'
```

### Filter x402 payments by node:
```bash
cat agent/transaction_log.json | jq '.x402_payments[] | select(.node_name | contains("Sentiment"))'
```

### Total x402 spent today:
```bash
cat agent/transaction_log.json | jq '[.x402_payments[] | select(.timestamp | startswith("2026-03-02"))] | map(.amount_usdc) | add'
```

---

## 🔍 Logs Output Format

### When Agent Buys Data (x402)

**Console Output**:
```
💳 [Procurement] Buying intelligence from Alternative Intelligence & Sentiment
   💸 Paid research fees to Alternative Intelligence & Sentiment
   ✅ [x402 Tx Hash] 0x123abc...
   📝 [x402 TX] 0x123abc... | 0.5 USDC → 0xABC123... | Data: sentiment
   📊 [TX LOG] x402 Payment recorded:
      TX: 0x123abc...
      Amount: 0.5 USDC → 0xABC123...
      Node: Alternative Intelligence & Sentiment (sentiment)
```

**Transaction Log Entry**:
```json
{
  "timestamp": "2026-03-02T17:55:52.123456",
  "tx_hash": "0x123abc...",
  "amount_usdc": 0.5,
  "recipient_wallet": "0xABC123...",
  "node_id": "sentiment-node-1",
  "node_name": "Alternative Intelligence & Sentiment",
  "data_type": "sentiment",
  "status": "confirmed"
}
```

### When Agent Executes Swap

**Console Output**:
```
🚀 [Executing] Attempting LONG swap...
   💱 [SWAP TX] 0x456def... | 0.004987 usdc → wsol
   📊 [TX LOG] Swap recorded:
      TX: 0x456def...
      Direction: USDC → WSOL
      Amount: 0.004987 USDC
usdc -> wsol 0.004987 02/03/2026, 17:55:52
```

**Transaction Log Entry**:
```json
{
  "timestamp": "2026-03-02T17:55:52.654321",
  "tx_hash": "0x456def...",
  "token_in": "USDC",
  "token_out": "WSOL",
  "amount_in": 0.004987,
  "amount_out": 0,
  "price_impact": null,
  "status": "confirmed"
}
```

---

## 🔗 Blockchain Explorer Links

To verify transactions on Solana testnet explorer:

Replace `{TX_HASH}` with the actual hash:

```
https://explorer.solana.com/tx/{TX_HASH}?cluster=devnet
```

Example x402 payment verification:
```
https://explorer.solana.com/tx/0x123abc...?cluster=devnet
```

Example swap verification:
```
https://explorer.solana.com/tx/0x456def...?cluster=devnet
```

---

## 📊 Real-Time Monitoring

### Watch all x402 payments in real-time:
```bash
tail -f /tmp/agent.log | grep -E "\[x402\]|\[TX\]|\[Procurement\]"
```

### Watch all swaps in real-time:
```bash
tail -f /tmp/agent.log | grep -E "\[SWAP TX\]|Attempting.*swap"
```

### Monitor transaction log updates:
```bash
watch -n 2 'cat agent/transaction_log.json | jq -c ".x402_payments[-3:], .swaps[-3:]"'
```

### Count transactions since startup:
```bash
echo "x402 payments:" && cat agent/transaction_log.json | jq '.x402_payments | length'
echo "Swaps:" && cat agent/transaction_log.json | jq '.swaps | length'
```

---

## 📈 Analysis Commands

### Total x402 spending:
```bash
cat agent/transaction_log.json | jq '[.x402_payments[]] | map(.amount_usdc) | add'
```

### Average x402 payment:
```bash
cat agent/transaction_log.json | jq '[.x402_payments[]] | map(.amount_usdc) | add / length'
```

### Nodes with most purchases:
```bash
cat agent/transaction_log.json | jq '[.x402_payments[] | .node_name] | group_by(.) | map({node: .[0], count: length}) | sort_by(.count) | reverse'
```

### Swap volume (count):
```bash
cat agent/transaction_log.json | jq '.swaps | length'
```

### LONG swaps (USDC → WSOL):
```bash
cat agent/transaction_log.json | jq '[.swaps[] | select(.token_in == "USDC")] | length'
```

### SHORT swaps (WSOL → USDC):
```bash
cat agent/transaction_log.json | jq '[.swaps[] | select(.token_in == "WSOL")] | length'
```

---

## 🎯 Summary

The system now provides:

✅ **Complete x402 Payment Logging**
- TX hash for every payment
- Amount and recipient
- Node details
- Timestamp

✅ **Complete Swap Logging**
- TX hash for every swap
- Token pair
- Amount in
- Timestamp

✅ **Budget Tracking**
- Daily spend limit enforcement
- Daily spend persistence

✅ **Transaction History**
- Full JSON log file
- Easy filtering and analysis
- Blockchain explorer links

All transactions are logged to `agent/transaction_log.json` and also displayed in console with full details!
