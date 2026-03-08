#!/bin/bash

# Mint tokens using Solana CLI and SPL Token

RECIPIENT="29btcGViz61Db5c1HTeEyw9p5rpDQG87VYNe1WupQnDL"
AMOUNT="1000000000" # 1 billion tokens (with 9 decimals)
DECIMALS=9

# Create mint
echo "Creating new mint..."
MINT=$(solana-keygen new --no-passphrase --silent --outfile /tmp/mint_keypair.json | grep "pubkey" | awk '{print $NF}' || solana address --keypair /tmp/mint_keypair.json 2>/dev/null)

# If mint file exists, use it
if [ -f ".mint_keypair.json" ]; then
    echo "Using existing mint..."
    MINT=$(solana address --keypair .mint_keypair.json)
else
    echo "Generating new mint keypair..."
    solana-keygen new --no-passphrase --silent --outfile .mint_keypair.json
    MINT=$(solana address --keypair .mint_keypair.json)
fi

echo "Mint address: $MINT"

# Create token account for recipient
echo "Creating token account for recipient..."
RECIPIENT_ATA=$(spl-token create-account $MINT $RECIPIENT --owner $RECIPIENT 2>&1 | grep "Creating account" | awk '{print $NF}' || spl-token address $MINT $RECIPIENT 2>/dev/null)

if [ -z "$RECIPIENT_ATA" ]; then
    RECIPIENT_ATA=$(spl-token address $MINT --owner $RECIPIENT)
fi

echo "Recipient ATA: $RECIPIENT_ATA"

# Mint tokens
echo "Minting $AMOUNT tokens (with $DECIMALS decimals) to $RECIPIENT..."
spl-token mint $MINT $AMOUNT --owner .mint_keypair.json --recipient-owner $RECIPIENT

echo "✅ Done! Tokens minted to $RECIPIENT"
