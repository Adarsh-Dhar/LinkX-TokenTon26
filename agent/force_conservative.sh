#!/bin/bash
# Conservative Mode for Risk-Off Environments
# High confidence threshold (0.75) for institutional-grade setups only
# No bias override - AI analyzes both directions but requires strong conviction

curl -X POST http://localhost:8080/agent/control/override \
     -H "Content-Type: application/json" \
     -d '{"risk": 0.75, "bias": "NONE"}'

echo ""
echo "🛡️ CONSERVATIVE MODE ACTIVATED"
echo "   - Confidence floor: 0.75 (only high-conviction trades)"
echo "   - Directional bias: NONE (AI evaluates all signals)"
echo "   - Use case: Low liquidity, high volatility, uncertain market conditions"
echo ""
