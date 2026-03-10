#!/bin/bash

# Mint USDC and WSOL using Python scripts if balances are low

echo "Checking and minting USDC and WSOL if needed..."

# Mint USDC
echo "Minting USDC..."
python3 contract/mint_usdc.py

# Mint WSOL
echo "Minting WSOL..."
python3 contract/mint_wsol.py

echo "✅ Done! USDC and WSOL minting scripts executed."
