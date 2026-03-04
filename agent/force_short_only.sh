#!/bin/bash
# Force Short-Only Trading Mode
# Mandates SHORT bias - agent can ONLY sell, no buying allowed
# Maintains institutional-grade 0.85 confidence threshold

curl -X POST http://localhost:8080/agent/control/override \
     -H "Content-Type: application/json" \
     -d '{"risk": 0.85, "bias": "SHORT"}'

echo ""
echo "📉 SHORT-ONLY MODE ACTIVATED"
echo "   - Mandated bias: SHORT (LONG trades forbidden)"
echo "   - Confidence floor: 0.85 (institutional-grade)"
echo "   - Agent will only look for sell opportunities"
echo ""
