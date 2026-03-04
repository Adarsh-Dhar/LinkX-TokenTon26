#!/bin/bash
# force_long_situation.sh
# Creates a situation that strongly encourages the agent to go LONG

OVERRIDE_FILE="./agent/override_state.json"

echo "🚀 Creating BULLISH situation for the agent..."

# Inject human intelligence into the agent's memory via override_state.json
cat <<EOF > "$OVERRIDE_FILE"
{
  "external_context": "MARKET ALERT: Positive ecosystem expansion announced. On-chain data shows significant accumulation and net-positive capital inflows. Sentiment is strongly positive.",
  "priority": "HIGH",
  "forced_bias": "LONG"
}
EOF

echo "✅ intelligence injected. Starting all services..."
./start_all.sh