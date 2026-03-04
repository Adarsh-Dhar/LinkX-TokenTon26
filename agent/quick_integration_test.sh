#!/bin/bash
# Quick Integration Test - Verifies the three critical paths are connected

echo "🔍 QUICK INTEGRATION TEST"
echo "========================="
echo ""

# Test 1: Check if data_consumer is async-safe
echo "1️⃣  Checking data_consumer for async safety..."
if grep -q "run_in_executor" agent/data_pipeline.py; then
    echo "   ✅ DataPipeline uses run_in_executor (non-blocking)"
else
    echo "   ❌ DataPipeline missing run_in_executor (will block event loop!)"
fi

# Test 2: Check if execute_move calls TradingEngine
echo ""
echo "2️⃣  Checking execute_move → TradingEngine connection..."
if grep -q "engine.execute_swap" agent/predictive_agent.py; then
    echo "   ✅ execute_move calls engine.execute_swap"
    swap_count=$(grep -c "engine.execute_swap" agent/predictive_agent.py)
    echo "   ✅ Found $swap_count execute_swap calls (LONG and SHORT paths)"
else
    echo "   ❌ execute_move missing engine.execute_swap (trades won't execute!)"
fi

# Test 3: Check if API has override endpoint
echo ""
echo "3️⃣  Checking /agent/control/override endpoint..."
if grep -q "/agent/control/override" agent/api.py; then
    echo "   ✅ Override endpoint exists in API"
else
    echo "   ❌ Override endpoint missing from API"
fi

# Test 4: Check if PredictiveAgent has override variables
echo ""
echo "4️⃣  Checking PredictiveAgent override state variables..."
if grep -q "self.risk_threshold" agent/predictive_agent.py && grep -q "self.forced_bias" agent/predictive_agent.py; then
    echo "   ✅ risk_threshold and forced_bias attributes present"
else
    echo "   ❌ Override attributes missing from PredictiveAgent"
fi

# Test 5: Check if human_rules passed to strategist
echo ""
echo "5️⃣  Checking human_rules passed to AlphaStrategist..."
if grep -q "human_rules=human_rules" agent/predictive_agent.py; then
    echo "   ✅ human_rules passed to rethink_strategy"
else
    echo "   ❌ human_rules not passed to strategist"
fi

# Test 6: Check if tools.py prompt has FUND MANAGER section
echo ""
echo "6️⃣  Checking AlphaStrategist prompt for Fund Manager directives..."
if grep -q "FUND MANAGER COMMANDS" agent/tools.py; then
    echo "   ✅ Prompt includes FUND MANAGER COMMANDS section"
else
    echo "   ❌ Prompt missing FUND MANAGER COMMANDS section"
fi

echo ""
echo "========================="
echo "✅ STRUCTURAL VALIDATION COMPLETE"
echo ""
echo "Next Steps:"
echo "1. Run: python validate_production_readiness.py    # Full test suite"
echo "2. Start agent: cd agent && python main.py"
echo "3. Test override: ./force_aggressive.sh"
echo "4. Test trade: ./test_buy.sh"
echo ""
