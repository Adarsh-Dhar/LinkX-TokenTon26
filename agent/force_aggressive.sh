#!/bin/bash
# Force Aggressive Trading Mode
# Lowers confidence threshold to 0.1 (10%) to execute on weak signals
# Clears any directional bias to allow AI discretion

curl -X POST http://localhost:8080/agent/control/override \
     -H "Content-Type: application/json" \
     -d '{"risk": 0.1, "bias": "NONE"}'

echo ""
echo "🔥 AGGRESSIVE MODE ACTIVATED"
echo "   - Confidence floor lowered to 0.1 (will trade on noisy signals)"
echo "   - Directional bias cleared (AI has full discretion)"
echo ""
