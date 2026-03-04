#!/bin/bash
# Get absolute path to ensure Python finds it
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
OVERRIDE_FILE="$SCRIPT_DIR/agent/override_state.json"

echo "📉 Injecting Bearish Scenario..."

cat <<EOF > "$OVERRIDE_FILE"
{
  "external_context": "MARKET ALERT: Institutional sell-off detected. Macro-economic downside risks increasing. Defensive positioning advised.",
  "priority": "HIGH",
  "forced_bias": "SHORT"
}
EOF

echo "✅ Bearish Signal Injected."
./start_all.sh