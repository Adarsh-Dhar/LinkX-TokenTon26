"""x402 data consumer helpers."""

from typing import Any

from agent.transaction_logger import get_logger


default_value = 0.0


class Signal:
    def __init__(self, value: float = default_value):
        self.value = value


def fetch_node_data(*args, **kwargs) -> Any:
    """
    Synchronous wrapper for x402 payment and data fetch.
    Called through `run_in_executor` by `data_pipeline.py`.
    """
    import requests
    from agent.wallet_manager import WalletManager

    logger = get_logger()
    node_url = kwargs.get("node_url") or (args[0] if args else None)
    api_key = kwargs.get("api_key")
    price = kwargs.get("price")
    category = kwargs.get("category")
    node_id = kwargs.get("node_id", "unknown")
    node_name = kwargs.get("node_name", "unknown")

    if not node_url:
        print("   ❌ [fetch_node_data] No node URL provided")
        return None

    wallet = WalletManager()
    headers = {}
    if api_key:
        headers["x-api-key"] = api_key

    try:
        res = requests.get(node_url, headers=headers, timeout=5)

        if res.status_code == 402:
            target_wallet = (
                res.headers.get("X-Payment-Wallet")
                or res.headers.get("X-Payment-Recipient")
                or res.headers.get("x-payment-wallet")
            )
            challenge = None
            if not target_wallet:
                try:
                    challenge = res.json()
                    target_wallet = challenge.get("recipient") or challenge.get("to")
                except Exception:
                    challenge = None
            if not target_wallet:
                print("   ❌ [x402] No payment wallet in headers")
                return None

            actual_price = float(
                res.headers.get("X-Payment-Price")
                or ((challenge or {}).get("price"))
                or price
                or 0
            )
            print(f"   💸 [x402 Target] {target_wallet}")
            print(f"   💰 [x402 Payment] Sending {actual_price} USDC to {target_wallet}")

            tx_hash = wallet.transfer_usdc(target_wallet, actual_price)
            if not tx_hash:
                print("   ❌ [x402] Payment transaction failed")
                return None

            print(f"   ✅ [x402 Tx Hash] {tx_hash}")
            print(
                f"   📝 [x402 TX] {tx_hash} | {actual_price} USDC → {target_wallet} | Data: {category or 'unknown'}"
            )

            logger.log_x402_payment(
                tx_hash=tx_hash,
                amount=actual_price,
                recipient=target_wallet,
                node_id=node_id,
                node_name=node_name,
                data_type=category or "unknown",
            )

            headers["PAYMENT-SIGNATURE"] = tx_hash
            headers["X-402-Payment-Proof"] = tx_hash
            headers["x-payment-proof"] = tx_hash
            res = requests.get(node_url, headers=headers, timeout=5)

        if res.status_code == 200:
            data = res.json()
            signal_value = data.get("value") or data.get("signal", 0.5)
            from collections import namedtuple

            SignalTuple = namedtuple("Signal", ["value"])
            print(f"   ✅ [x402 Data] Received signal: {signal_value}")
            return SignalTuple(value=float(signal_value))

        print(f"   ⚠️  [x402] Unexpected status: {res.status_code}")
        return None

    except Exception as e:
        print(f"   ❌ [x402 Error] {e}")
        import traceback

        traceback.print_exc()
        return None


def normalize_data(category: str, data: dict) -> Signal:
    try:
        val = float(next(iter(data.values())))
    except Exception:
        val = default_value
    return Signal(val)
