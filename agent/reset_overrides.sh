#!/bin/bash
# Reset All Overrides
# Returns agent to default institutional settings:
# - 0.15 confidence threshold (15% minimum)
# - No directional bias (AI uses market signals)

curl -X POST http://localhost:8080/agent/control/override \
     -H "Content-Type: application/json" \
     -d '{"risk": 0.15, "bias": "NONE"}'

echo ""
echo "🔄 OVERRIDES RESET TO DEFAULTS"
echo "   - Confidence floor: 0.15 (default institutional)"
echo "   - Directional bias: NONE (AI discretion)"
echo ""
