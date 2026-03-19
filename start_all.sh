#!/bin/bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# --- AGENT CONFIGURATION ---
export AGENT_MODE="BALANCED"
export AGENT_MIN_ACCURACY=10
export AGENT_MAX_COST=0.4
export AGENT_LOOP_INTERVAL_SEC=30
export AI_CALL_GAP_SEC=30
export CONTINUOUS_TRADING=true
export MIN_TRADE_INTERVAL_SEC=10

echo "🚀 STARTING ALPHA CONSUMER"
echo "------------------------------------------------"

# Log file paths
FRONTEND_LOG="/tmp/frontend.log"
DEMO_PROVIDERS_LOG="/tmp/demo_providers.log"
BACKEND_API_LOG="/tmp/backend_api.log"
AGENT_LOG="/tmp/agent.log"
SENTIMENT_LOG="/tmp/sentiment.log"
MACRO_LOG="/tmp/macro.log"
MICROSTRUCTURE_LOG="/tmp/microstructure.log"
LOG_TAIL_PIDS=()
AGENT_PY=""

# Resolve Python interpreter from venv
ensure_agent_python() {
    if [ -x "$SCRIPT_DIR/.venv/bin/python3" ]; then
        AGENT_PY="$SCRIPT_DIR/.venv/bin/python3"
        return 0
    fi
    if [ -x "$SCRIPT_DIR/agent/venv/bin/python3" ]; then
        AGENT_PY="$SCRIPT_DIR/agent/venv/bin/python3"
        return 0
    fi
    AGENT_PY=""
    return 1
}

# ── 1. CLEANUP ────────────────────────────────────────────────────────────────
echo "🧹 Cleaning up..."
rm -f agent/override_state.json /tmp/linkx_agent_autonomous_loop.lock
pkill -f "python3.*agent"         2>/dev/null || true
pkill -f "[Pp]ython.*agent.main"  2>/dev/null || true
pkill -f "[Uu]vicorn.*agent.api"  2>/dev/null || true
pkill -f "tail.*\.log"            2>/dev/null || true
pkill -f "node.*server"           2>/dev/null || true
pkill -f "node.*provider.js"      2>/dev/null || true
pkill -f "next-server"            2>/dev/null || true
pkill -f "node_sentiment"         2>/dev/null || true
pkill -f "node_macro"             2>/dev/null || true
pkill -f "node_microstructure"    2>/dev/null || true
for port in 8080 3050 3999 4001 4002 4003 4004; do
    lsof -ti:$port 2>/dev/null | xargs -r kill -9 2>/dev/null || true
done

# ── 2. DOCKER NODE SERVICES ───────────────────────────────────────────────────
if docker info >/dev/null 2>&1; then
    echo "🐳 Starting node services via Docker..."
    docker compose -f "$SCRIPT_DIR/docker-compose.nodes.yml" down 2>/dev/null || true
    docker compose -f "$SCRIPT_DIR/docker-compose.nodes.yml" up -d
    NODES_IN_DOCKER=true
else
    echo "⚠️  Docker not running — nodes will start directly"
    NODES_IN_DOCKER=false
fi

# ── 3. DEMO NODE PROVIDERS ────────────────────────────────────────────────────
echo "📡 Starting Demo Node Providers..."
node "$SCRIPT_DIR/server/start_demo_providers.js" > "$DEMO_PROVIDERS_LOG" 2>&1 &
DEMO_PROVIDERS_PID=$!
echo "   ✅ Demo Providers PID: $DEMO_PROVIDERS_PID"
sleep 5

# ── 4. DATABASE SETUP ─────────────────────────────────────────────────────────
# DATABASE_URL is read from frontend/.env — never overridden here
echo "🗄️  Setting up Database..."
cd "$SCRIPT_DIR/frontend"
npx prisma db push --accept-data-loss
npx prisma db seed
cd "$SCRIPT_DIR"

# ── 5. PYTHON ENVIRONMENT ─────────────────────────────────────────────────────
ensure_agent_python || true

# ── 6. BACKEND API ────────────────────────────────────────────────────────────
echo "🔌 Starting Backend API..."
if lsof -i:8080 | grep -q LISTEN; then
    echo "   ⚠️  Port 8080 already in use — skipping"
elif [ -n "$AGENT_PY" ] && "$AGENT_PY" -c "import uvicorn" 2>/dev/null; then
    export PYTHONUNBUFFERED=1
    export DISABLE_API_AUTONOMOUS_LOOP=1
    "$AGENT_PY" -m uvicorn agent.api:app --host 0.0.0.0 --port 8080 > "$BACKEND_API_LOG" 2>&1 &
    AGENT_API_PID=$!
    echo "   ✅ Backend API PID: $AGENT_API_PID"
    sleep 3
else
    echo "   ⏭️  Skipping Backend API (uvicorn not available)"
fi

# ── 7. TRADING AGENT ──────────────────────────────────────────────────────────
echo "🤖 Starting Trading Agent..."
if [ -n "$AGENT_PY" ] && "$AGENT_PY" -c "import web3" 2>/dev/null; then
    "$AGENT_PY" -m agent.main > "$AGENT_LOG" 2>&1 &
    AGENT_PID=$!
    echo "   ✅ Trading Agent PID: $AGENT_PID"
    sleep 3
else
    echo "   ❌ Trading Agent not started (web3 missing)"
    echo "      Fix: source .venv/bin/activate && pip install web3"
fi

# ── 8. LIQUIDITY & FUNDING ────────────────────────────────────────────────────
echo "💰 Auto-funding and liquidity setup..."
export WALLET_PRIVATE_KEY="4J5m6SgcYKhNo7rfVxvPXTjmptPs8tuVpoCn55HDKyjnDhtRxmJ32tZ8gGF6TmaNPWU2gAoRS65bbFDPQv1FfRZx"
CONTRACT_PY="$SCRIPT_DIR/.venv/bin/python3"
[ ! -x "$CONTRACT_PY" ] && CONTRACT_PY="$AGENT_PY"

if [ -n "$CONTRACT_PY" ]; then
    cd "$SCRIPT_DIR/contract"
    "$CONTRACT_PY" mint_usdc.py               && echo "   ✅ USDC minted"        || echo "   ❌ USDC mint failed"
    "$CONTRACT_PY" mint_WSOL.py 1000          && echo "   ✅ WSOL minted"        || echo "   ❌ WSOL mint failed"
    "$CONTRACT_PY" check_and_add_liquidity.py && echo "   ✅ Liquidity checked"  || echo "   ❌ Liquidity setup failed"
    cd "$SCRIPT_DIR"
else
    echo "   ⚠️  Python not available — skipping funding"
    echo "      Run manually: cd contract && python3 mint_usdc.py && python3 mint_WSOL.py && python3 check_and_add_liquidity.py"
fi

# ── 9. FRONTEND ───────────────────────────────────────────────────────────────
# DATABASE_URL is NOT exported here — Next.js reads it from frontend/.env
echo "🖥️  Starting Frontend..."
cd "$SCRIPT_DIR/frontend"
pnpm run dev > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"
echo "   ✅ Frontend PID: $FRONTEND_PID"
echo "   ⏳ Waiting 15s for Frontend to boot..."
sleep 15
echo "   ✅ Frontend online at http://localhost:3600"

# ── 10. NODE SERVICES (if not in Docker) ─────────────────────────────────────
SENTIMENT_PID=""
MACRO_PID=""
MICROSTRUCTURE_PID=""

if [ "$NODES_IN_DOCKER" = "false" ]; then
    echo "📡 Starting Node Services..."
    cd "$SCRIPT_DIR/server"
    node node_sentiment.js      > "$SENTIMENT_LOG"      2>&1 & SENTIMENT_PID=$!;      sleep 2
    node node_macro.js          > "$MACRO_LOG"          2>&1 & MACRO_PID=$!;           sleep 2
    node node_microstructure.js > "$MICROSTRUCTURE_LOG" 2>&1 & MICROSTRUCTURE_PID=$!; sleep 2
    cd "$SCRIPT_DIR"
    echo "   ✅ Sentiment (4002), Macro (4003), Microstructure (4001) started"
else
    echo "   ✅ Nodes running in Docker"
fi

# ── 11. LOG STREAMING ─────────────────────────────────────────────────────────
stream_log() {
    local file="$1" label="$2" pattern="$3"
    touch "$file"
    ( tail -n 0 -F "$file" 2>/dev/null | awk -v lbl="$label" "/$pattern/ { print lbl\" \"\$0; fflush() }" ) &
    LOG_TAIL_PIDS+=("$!")
}

AGENT_PATTERN='\[Scout\]|\[Procurement\]|\[Strategist\]|\[Position Change\]|\[Scale In\]|\[Hold\]|\[Executing\]|\[TradingEngine\]|\[x402\]|429 Too Many|Traceback|Exception|Error|failed|revert'
TX_PATTERN='\[x402 TX\]|\[x402 Tx Hash\]|\[SWAP TX\]|Swap Confirmed|Tx: 0x|Hash: 0x|0x[0-9a-fA-F]{64}'

stream_log "$AGENT_LOG" "[AGENT]" "$AGENT_PATTERN"
stream_log "$AGENT_LOG" "[TX]"    "$TX_PATTERN"

# ── STATUS ────────────────────────────────────────────────────────────────────
echo ""
echo "🟢 ALPHA CONSUMER FULLY OPERATIONAL"
echo ""
echo "   Frontend:            http://localhost:3600"
echo "   Microstructure Node: http://localhost:4001"
echo "   Sentiment Node:      http://localhost:4002"
echo "   Macro Node:          http://localhost:4003"
echo "   Demo Providers:      ports 5000–5047"
echo ""
echo "   Logs: /tmp/*.log"
echo "🛑 Stop: Ctrl+C"
echo ""

# ── SHUTDOWN ──────────────────────────────────────────────────────────────────
shutdown_all() {
    echo ""
    echo "🛑 Shutting down..."
    kill ${DEMO_PROVIDERS_PID:-} ${FRONTEND_PID:-} ${AGENT_API_PID:-} \
         ${AGENT_PID:-} ${SENTIMENT_PID:-} ${MACRO_PID:-} \
         ${MICROSTRUCTURE_PID:-} "${LOG_TAIL_PIDS[@]:-}" 2>/dev/null || true
    pkill -f provider.js 2>/dev/null || true
    echo "✅ All services stopped"
    exit 0
}

trap shutdown_all SIGINT SIGTERM
wait