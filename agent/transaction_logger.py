"""
Transaction Logger for LinkX
Logs all x402 payments and swap transactions with full details
"""

import json
import os
from datetime import datetime
from pathlib import Path

import requests

class TransactionLogger:
    def __init__(self):
        self.log_dir = Path(__file__).parent
        self.tx_log_file = self.log_dir / "transaction_log.json"
        self.tx_ingest_url = os.getenv("TX_INGEST_URL", "http://localhost:3600/api/transactions/ingest")
        self.ensure_log_file()

    def _push_to_frontend(self, payload):
        """Best-effort push to frontend transaction ingest API (idempotent by txHash)."""
        try:
            requests.post(self.tx_ingest_url, json=payload, timeout=2)
        except Exception as e:
            print(f"   ⚠️  [TX LOG] Failed to push tx to frontend API: {e}")
    
    def ensure_log_file(self):
        """Create transaction log file if it doesn't exist"""
        if not self.tx_log_file.exists():
            with open(self.tx_log_file, 'w') as f:
                json.dump({"x402_payments": [], "swaps": []}, f, indent=2)
    
    def log_x402_payment(self, tx_hash, amount, recipient, node_id, node_name, data_type):
        """Log an x402 payment transaction"""
        try:
            with open(self.tx_log_file, 'r') as f:
                data = json.load(f)

            normalized_tx_hash = str(tx_hash).strip().lower()
            
            payment = {
                "timestamp": datetime.now().isoformat(),
                "tx_hash": normalized_tx_hash,
                "amount_usdc": float(amount),
                "recipient_wallet": recipient,
                "node_id": node_id,
                "node_name": node_name,
                "data_type": data_type,
                "status": "confirmed"
            }
            
            data["x402_payments"].append(payment)
            
            with open(self.tx_log_file, 'w') as f:
                json.dump(data, f, indent=2)
            
            # Print summary
            print(f"   📊 [TX LOG] x402 Payment recorded:")
            print(f"      TX: {normalized_tx_hash}")
            print(f"      Amount: {amount} USDC → {recipient}")
            print(f"      Node: {node_name} ({data_type})")

            self._push_to_frontend({
                "txHash": normalized_tx_hash,
                "txType": "X402_PAYMENT",
                "status": "CONFIRMED",
                "tokenIn": "USDC",
                "amountIn": float(amount),
                "toAddress": recipient,
                "nodeId": node_id,
                "nodeName": node_name,
                "dataType": data_type,
                "timestamp": payment["timestamp"],
                "metadata": {
                    "source": "agent.transaction_logger",
                    "kind": "x402_payment"
                }
            })
            
        except Exception as e:
            print(f"   ⚠️  [TX LOG] Failed to log x402 payment: {e}")
    
    def log_swap(self, tx_hash, token_in, token_out, amount_in, amount_out, price_impact, status="confirmed"):
        """Log a swap transaction"""
        try:
            with open(self.tx_log_file, 'r') as f:
                data = json.load(f)

            normalized_tx_hash = str(tx_hash).strip().lower()
            normalized_status = str(status).upper() if status else "PENDING"
            
            swap = {
                "timestamp": datetime.now().isoformat(),
                "tx_hash": normalized_tx_hash,
                "token_in": token_in,
                "token_out": token_out,
                "amount_in": float(amount_in),
                "amount_out": float(amount_out),
                "price_impact": float(price_impact) if price_impact else None,
                "status": normalized_status
            }
            
            data["swaps"].append(swap)
            
            with open(self.tx_log_file, 'w') as f:
                json.dump(data, f, indent=2)
            
            # Print summary
            direction = f"{token_in} → {token_out}"
            print(f"   📊 [TX LOG] Swap recorded:")
            print(f"      TX: {normalized_tx_hash}")
            print(f"      Direction: {direction}")
            print(f"      Amount: {amount_in} {token_in}")

            self._push_to_frontend({
                "txHash": normalized_tx_hash,
                "txType": "SWAP",
                "status": normalized_status,
                "tokenIn": token_in,
                "tokenOut": token_out,
                "amountIn": float(amount_in),
                "amountOut": float(amount_out),
                "priceImpact": float(price_impact) if price_impact else None,
                "timestamp": swap["timestamp"],
                "metadata": {
                    "source": "agent.transaction_logger",
                    "kind": "swap"
                }
            })
            
        except Exception as e:
            print(f"   ⚠️  [TX LOG] Failed to log swap: {e}")
    
    def get_daily_summary(self):
        """Get summary of today's transactions"""
        try:
            with open(self.tx_log_file, 'r') as f:
                data = json.load(f)
            
            today = datetime.now().strftime("%Y-%m-%d")
            today_x402 = [tx for tx in data.get("x402_payments", []) 
                         if tx["timestamp"].startswith(today)]
            today_swaps = [tx for tx in data.get("swaps", []) 
                          if tx["timestamp"].startswith(today)]
            
            total_x402_spent = sum(tx["amount_usdc"] for tx in today_x402)
            
            return {
                "date": today,
                "x402_payments_count": len(today_x402),
                "x402_total_spent": total_x402_spent,
                "swaps_count": len(today_swaps),
                "x402_payments": today_x402,
                "swaps": today_swaps
            }
        except Exception as e:
            print(f"   ⚠️  [TX LOG] Failed to get summary: {e}")
            return None

# Global instance
_transaction_logger = None

def get_logger():
    global _transaction_logger
    if _transaction_logger is None:
        _transaction_logger = TransactionLogger()
    return _transaction_logger
