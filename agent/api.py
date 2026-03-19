# ...existing code...


# ...existing code...



# --- Ensure .env is loaded for environment variables ---
from dotenv import load_dotenv
from pathlib import Path
from pydantic import BaseModel

project_root = Path(__file__).parent.parent
env_default = project_root / '.env'

# Load Solana configuration
load_dotenv(env_default)

# Expose optimization graph data for dashboard (must be after app is defined)


from fastapi import FastAPI, Query
from contextlib import asynccontextmanager
import threading
import os
import sys



# --- GitHub Models Client Setup ---
import os
import httpx
GITHUB_MODELS_API_KEY = os.getenv("GITHUB_MODELS_API_KEY")
GITHUB_MODELS_ENDPOINT = os.getenv("GITHUB_MODELS_ENDPOINT")

client = None
if GITHUB_MODELS_API_KEY and GITHUB_MODELS_ENDPOINT:
    import openai
    openai.api_key = GITHUB_MODELS_API_KEY
    openai.base_url = GITHUB_MODELS_ENDPOINT
    client = openai

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from agent.main import IntelligentAgent
from agent.predictive_agent import PredictiveAgent
from agent.autonomous_loop import run_autonomous_loop



@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent_instance
    print("\n⚡ [API] Booting...")
    try:
        agent_instance = IntelligentAgent()
        if os.getenv("DISABLE_API_AUTONOMOUS_LOOP", "1").lower() in ("1", "true", "yes"):
            print("ℹ️ [API] Autonomous loop disabled in API process (managed by standalone agent.main).")
        else:
            t = threading.Thread(target=run_autonomous_loop, args=(agent_instance, 60), daemon=True)
            t.start()
            print("✅ [API] Autonomous Loop Started.")
    except Exception as e:
        print(f"❌ [API] Error: {e}")
    yield

from agent.api_status import router as status_router
app = FastAPI(lifespan=lifespan)
app.include_router(status_router)
agent_instance = None

# --- INTENT PARSER USING GITHUB MODELS ---
import json
def parse_human_intent(user_message: str):
    # --- Local fallback for simple commands ---
    msg = user_message.strip().lower()

    # Only trigger PAUSE or RESUME on explicit commands
    if msg in ["pause", "pause trading", "pause all trading", "pause agent"]:
        return {"action": "PAUSE"}
    if msg in ["resume", "resume trading", "resume all trading", "resume agent", "unpause", "start trading", "continue trading"]:
        return {"action": "RESUME"}
    # Add more local rules as needed

    system_prompt = """
You are a trading assistant. Convert user speech into a JSON command.
Possible Actions: 
- TRADE (side: \"BUY\"/\"SELL\", amount: float)
- SET_LIMIT (limit: float)  <-- Extract numerical values for budget/cost/limit
- PAUSE ()
- RESUME ()
- IGNORE ()

Example: \"Change max cost to 0.4\" -> {\"action\": \"SET_LIMIT\", \"limit\": 0.4}
Example: \"Don't spend more than 1.5 per trade\" -> {\"action\": \"SET_LIMIT\", \"limit\": 1.5}
Return ONLY JSON.
    """
    if not client:
        return {"action": "IGNORE", "error": "GitHub Models client not configured"}
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            response_format={ "type": "json_object" },
            max_tokens=2048,
            temperature=0.2
        )
        content = response.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        return {"action": "IGNORE", "error": str(e)}

# Chat request model
class ChatRequest(BaseModel):
    message: str


# --- INTENT-DRIVEN CHAT ENDPOINT (GitHub Models) ---

# --- GEMINI-LIKE INTENT-DRIVEN CHAT ENDPOINT ---
@app.post("/agent/control/override")
async def apply_override(data: dict):
    """
    Real-time Human Override Endpoint
    Expected JSON: {"risk": 0.5, "bias": "SHORT"}
    Bias values: "LONG", "SHORT", "NEUTRAL", or "NONE" (clears override)
    Risk values: 0.0 - 1.0 (confidence threshold)
    """
    global agent_instance
    pred_agent = getattr(agent_instance, 'current_predictive_instance', None)
    if not pred_agent:
        return {"status": "error", "message": "Agent not initialized yet"}

    # Use the agent's method for real-time override
    risk = data.get("risk")
    bias = data.get("bias")
    try:
        pred_agent.apply_human_interference(risk=risk, bias=bias)
    except Exception as e:
        return {"status": "error", "message": f"Failed to apply override: {e}"}

    return {
        "status": "Override Applied Successfully",
        "current_config": {
            "risk_threshold": pred_agent.risk_threshold,
            "forced_bias": pred_agent.forced_bias or "AI Discretion",
            "paused": pred_agent.paused
        }
    }

@app.post("/chat")
async def handle_chat(request: ChatRequest):
    global agent_instance
    msg = request.message.lower()

    # Get the actual running instance from the loop
    pred_agent = getattr(agent_instance, 'current_predictive_instance', None)
    if not pred_agent:
        return {"reply": "🤖 Brain is still warming up. Try again in 5 seconds."}

    # 1. Use the LLM to get the Intent JSON
    intent = parse_human_intent(msg)
    print(f"[DEBUG] User message: {msg}")
    print(f"[DEBUG] Parsed intent: {intent}")


    # 2. IMPLEMENT THE INTENT
    action = intent.get("action")

    if action == "PAUSE":
        pred_agent.paused = True
        resp = intent.get("conversational_response")
        return {"reply": resp if resp and str(resp).strip() else "Trading paused as requested."}

    if action == "SET_LIMIT":
        # Support both legacy and new direct limit extraction
        new_limit = None
        if "limit" in intent and intent["limit"] is not None:
            try:
                new_limit = float(intent["limit"])
            except Exception:
                new_limit = None
        elif "limit_value" in intent and intent["limit_value"] is not None:
            try:
                new_limit = float(intent["limit_value"])
            except Exception:
                new_limit = None
        if new_limit is not None and pred_agent:
            pred_agent.max_cost = new_limit
            pred_agent.max_total_spend_per_trade = new_limit
            pred_agent.block_data_purchases = False
            return {"reply": f"✅ Budget Updated: I will now limit each trade cycle to {new_limit} USDC."}
        # fallback to legacy set_limit if present
        limit_type = intent.get("limit_type")
        limit_value = intent.get("limit_value")
        if hasattr(pred_agent, 'set_limit') and limit_type and limit_value is not None:
            pred_agent.set_limit(limit_type, limit_value)
            return {"reply": f"Limit set: {limit_type} = {limit_value}"}
        return {"reply": "❌ Could not update trade limit. Please try again."}

    if action == "SET_REFILL":
        refill_amount = intent.get("refill_amount")
        refill_threshold = intent.get("refill_threshold")
        if hasattr(pred_agent, 'set_refill_logic'):
            pred_agent.set_refill_logic(refill_threshold, refill_amount)
        resp = intent.get("conversational_response")
        if resp and str(resp).strip():
            return {"reply": resp}
        if refill_amount is not None and refill_threshold is not None:
            return {"reply": f"I'll auto-refill your wallet with {refill_amount} USDC whenever it drops below {refill_threshold} USDC."}
        return {"reply": "Refill logic set!"}

    # 3. UNIVERSAL FALLBACK: Always use AI's conversational response, or provide a generic friendly reply if missing/empty
    resp = intent.get("conversational_response")
    if resp and str(resp).strip():
        return {"reply": resp}
    if action == "SET_LIMIT":
        return {"reply": "Limit set as requested!"}
    if action == "SET_REFILL":
        return {"reply": "Refill logic set as requested!"}
    if action == "TRADE":
        return {"reply": "Trade command received!"}
    if action == "PAUSE":
        return {"reply": "Trading paused as requested."}
    if action == "RESUME":
        pred_agent.paused = False
        pred_agent.block_data_purchases = False  # <-- Clear spend block on resume
        resp = intent.get("conversational_response")
        return {"reply": resp if resp and str(resp).strip() else "▶️ Resuming! I have cleared spend blocks and am ready to trade."}
    return {"reply": "✅ Command received and processed!"}

@app.get("/agent/decision-log")
async def get_decision_log():
    """Fetch recent trade decisions from the database."""
    # Always query the database directly - it's faster and avoids agent instance locks
    try:
        from agent.agent_state_db import AgentStateDB
        db = AgentStateDB()
        decisions = db.get_trade_decisions(limit=50)
        return decisions
    except Exception as e:
        print(f"❌ Error fetching decisions: {e}")
        import traceback
        traceback.print_exc()
        return []

# Expose optimization graph data for dashboard
@app.get("/optimization-graph")
async def optimization_graph(
    situation: str = Query(..., description="Market situation, e.g. PARABOLIC_PUMP"),
    mode: str = Query("BALANCED", description="Node selection mode: BALANCED, ACCURATE, ECONOMY"),
    min_accuracy: int = Query(15, description="Minimum accuracy for node selection"),
    max_cost: float = Query(50.0, description="Maximum cost for node selection")
):
    agent = agent_instance or IntelligentAgent()
    all_nodes = await agent.pipeline.refresh_market_knowledge()
    # Use optimizer to get graph data for the situation
    graph_data = agent.get_optimization_graph_data(all_nodes, situation)
    return {"graph": graph_data, "situation": situation, "mode": mode}

# Expose cost-accuracy graph for dashboard
@app.get("/cost-accuracy-graph")
async def cost_accuracy_graph(
    situation: str = Query(..., description="Market situation, e.g. PARABOLIC_PUMP"),
    mode: str = Query("BALANCED", description="Node selection mode: BALANCED, ACCURATE, ECONOMY"),
    min_accuracy: int = Query(15, description="Minimum accuracy for node selection"),
    max_cost: float = Query(50.0, description="Maximum cost for node selection")
):
    agent = agent_instance or IntelligentAgent()
    all_nodes = await agent.pipeline.refresh_market_knowledge()
    # Use optimizer to get node list for the situation
    graph = agent.cost_accuracy_graph(all_nodes, situation)
    return {"graph": graph}

@app.get("/")
@app.get("/status")
def status():
    global agent_instance
    # Default to offline and unknown
    is_running = False
    network = "unknown"
    # Check if agent_instance is initialized and has a wallet
    if agent_instance and hasattr(agent_instance, 'wallet') and getattr(agent_instance, 'wallet', None) is not None:
        # Check if wallet is actually connected (has address and rpc_url)
        wallet = getattr(agent_instance, 'wallet')
        if hasattr(wallet, 'address') and wallet.address and hasattr(wallet, 'rpc_url') and wallet.rpc_url:
            is_running = True
            rpc_url = wallet.rpc_url
            if 'devnet' in rpc_url.lower() or 'solana' in rpc_url.lower():
                network = 'solana-devnet'
            elif 'mainnet' in rpc_url.lower():
                network = 'solana-mainnet'
            else:
                network = rpc_url
    return {"status": "online" if is_running else "offline", "network": network}