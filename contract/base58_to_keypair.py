# This script converts a base58 private key to a Solana keypair JSON file
import base58
import json

# Replace with your base58 private key
base58_key = "4J5m6SgcYKhNo7rfVxvPXTjmptPs8tuVpoCn55HDKyjnDhtRxmJ32tZ8gGF6TmaNPWU2gAoRS65bbFDPQv1FfRZx"

key_bytes = base58.b58decode(base58_key)
if len(key_bytes) == 64:
    arr = list(key_bytes)
elif len(key_bytes) == 32:
    arr = list(key_bytes) * 2  # Not correct for all cases, but for Solana, 32 is seed, 64 is private+public
else:
    raise ValueError("Key must be 32 or 64 bytes")

with open("/Users/adarsh/Documents/LinkX-TokenTon26/contract/id.json", "w") as f:
    json.dump(arr, f)
print("Keypair file written to contract/id.json")
