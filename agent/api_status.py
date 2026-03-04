from fastapi import APIRouter
from fastapi.responses import JSONResponse
import os

router = APIRouter()

def get_agent_status():
    # This should be replaced with actual agent status logic
    # For now, check for a lock file or env var, or return offline
    status = os.environ.get("AGENT_STATUS", "offline")
    network = os.environ.get("AGENT_NETWORK", "solana")
    return {
        "status": status,
        "network": network
    }

@router.get("/status")
def status():
    return JSONResponse(get_agent_status())
