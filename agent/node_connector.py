"""
Node Connector Service - Connects to the 48 simulated data providers
Uses the local registry (port 3999) to discover providers and aggregates data
Replaces JSON-RPC calls with HTTP endpoints and simulated payment flow
"""

import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
import aiohttp
import time
from enum import Enum

# Local ecosystem registry
REGISTRY_URL = "http://localhost:3999/directory"


class NodeStatus(Enum):
    """Node health status"""
    ONLINE = "online"
    OFFLINE = "offline"
    SLOW = "slow"



@dataclass
class NodeInfo:
    """Information about a simulated data provider node"""
    node_id: int
    name: str
    rpc_url: str  # points to /data endpoint of the provider
    provider_type: str  # "premium" or "budget"
    category: str  # e.g., "price", "volume", "sentiment", etc.
    status: NodeStatus = NodeStatus.ONLINE
    last_updated: datetime = None
    response_time_ms: float = 0.0
    data_freshness_ms: float = 0.0
    is_primary: bool = False
    expiry_ms: int = 60000  # default 60s, will be set per category
    last_value: Any = None
    last_fetch_time: Optional[float] = None  # epoch seconds

    def to_dict(self) -> Dict:
        return {
            "node_id": self.node_id,
            "name": self.name,
            "rpc_url": self.rpc_url,
            "provider_type": self.provider_type,
            "category": self.category,
            "status": self.status.value,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
            "response_time_ms": self.response_time_ms,
            "data_freshness_ms": self.data_freshness_ms,
            "is_primary": self.is_primary,
            "expiry_ms": self.expiry_ms,
            "last_fetch_time": self.last_fetch_time,
        }


class NodeConnector:
    """
    Manages connections to multiple simulated data providers.
    Implements discovery via registry, health checking, and data aggregation.
    """
    
    def __init__(self):
        """Initialize node connector with predefined nodes"""
        self.nodes: Dict[int, NodeInfo] = {}
        self.session: Optional[aiohttp.ClientSession] = None
        self.health_check_interval = 30  # seconds
        self.max_response_time = 5000  # ms - mark as slow if slower
        self.cache = {}
        self.cache_ttl = 10  # seconds
        self.registry_loaded = False
        # Placeholders until registry is loaded
        self.nodes: Dict[int, NodeInfo] = {}

    def get_available_nodes(self, category: Optional[str] = None) -> list:
        """Return a list of available nodes (online or slow) optionally filtered by category."""
        nodes = self._select_nodes(category)
        return [n for n in nodes if n.status in (NodeStatus.ONLINE, NodeStatus.SLOW)]
    
    # Expiry/freshness per category (ms)
    CATEGORY_EXPIRY_MS = {
        "price": 5000,
        "volume": 10000,
        "spread": 5000,
        "depth": 10000,
        "mcap": 60000,
        "funding": 60000,
        "inflows": 20000,
        "outflows": 20000,
        "whales": 30000,
        "active_addr": 60000,
        "fees": 60000,
        "age": 300000,
        "social_vol": 60000,
        "sentiment": 60000,
        "search": 120000,
        "dominance": 60000,
        "devs": 300000,
        "tvl": 300000,
        "unlocks": 300000,
        "burn": 300000,
        "rsi": 10000,
        "ma": 10000,
        "volatility": 20000,
        "correlation": 60000,
    }

    async def _initialize_nodes(self):
        """Initialize nodes by discovering providers from the local registry"""
        if not self.session:
            # Session required to fetch registry
            self.session = aiohttp.ClientSession()
        
        try:
            async with self.session.get(REGISTRY_URL, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 200:
                    providers = await resp.json()
                    self.nodes.clear()
                    for idx, p in enumerate(providers):
                        # Provider fields from registry: id, category, name, port, url, price, tier
                        self.nodes[idx] = NodeInfo(
                            node_id=idx,
                            name=p.get("name", p.get("id", f"provider_{idx}")),
                            rpc_url=p.get("url"),
                            provider_type=(p.get("tier", "Budget")).lower(),
                            category=p.get("category", "unknown"),
                            is_primary=(idx % 2 == 0)  # Premium/Budget alternation
                        )
                    self.registry_loaded = True
                    return
        except Exception:
            # Fall back to static mapping if registry not reachable
            pass
        
        # Fallback: construct static mapping identical to DataPipeline
        base = 4000
        categories = [
            ("price", 0), ("price", 1),
            ("volume", 2), ("volume", 3),
            ("spread", 4), ("spread", 5),
            ("depth", 6), ("depth", 7),
            ("mcap", 8), ("mcap", 9),
            ("funding", 10), ("funding", 11),
            ("inflows", 12), ("inflows", 13),
            ("outflows", 14), ("outflows", 15),
            ("whales", 16), ("whales", 17),
            ("active_addr", 18), ("active_addr", 19),
            ("fees", 20), ("fees", 21),
            ("age", 22), ("age", 23),
            ("social_vol", 24), ("social_vol", 25),
            ("sentiment", 26), ("sentiment", 27),
            ("search", 28), ("search", 29),
            ("dominance", 30), ("dominance", 31),
            ("devs", 32), ("devs", 33),
            ("tvl", 34), ("tvl", 35),
            ("unlocks", 36), ("unlocks", 37),
            ("burn", 38), ("burn", 39),
            ("rsi", 40), ("rsi", 41),
            ("ma", 42), ("ma", 43),
            ("volatility", 44), ("volatility", 45),
            ("correlation", 46), ("correlation", 47),
        ]
        
        self.nodes.clear()
        for idx, (cat, offset) in enumerate(categories):
            port = base + offset
            tier = "premium" if idx % 2 == 0 else "budget"
            expiry = self.CATEGORY_EXPIRY_MS.get(cat, 60000)
            self.nodes[idx] = NodeInfo(
                node_id=idx,
                name=f"{cat} ({'Premium' if tier=='premium' else 'Budget'})",
                rpc_url=f"http://localhost:{port}/data",
                provider_type=tier,
                category=cat,
                is_primary=(tier == "premium"),
                expiry_ms=expiry
            )
        self.registry_loaded = False
    
    async def connect(self):
        """Establish async HTTP session"""
        if self.session is None:
            self.session = aiohttp.ClientSession()
        
        # Load registry and initialize nodes
        await self._initialize_nodes()
        
        # Start health check task
        asyncio.create_task(self._health_check_loop())
    
    async def disconnect(self):
        """Close async HTTP session"""
        if self.session:
            await self.session.close()
            self.session = None
    
    async def _health_check_loop(self):
        """Periodic health check for all nodes"""
        while True:
            await asyncio.sleep(self.health_check_interval)
            await self._perform_health_checks()
    
    async def _perform_health_checks(self):
        """Check health of all nodes"""
        if not self.session:
            return
        
        tasks = []
        for node_id, node in self.nodes.items():
            tasks.append(self._check_node_health(node))
        
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _check_node_health(self, node: NodeInfo):
        """Check if a provider node responds to /data (expects 402 or 200)"""
        if not self.session:
            return
        
        try:
            start_time = time.time()
            async with self.session.get(
                node.rpc_url,
                timeout=aiohttp.ClientTimeout(total=5)
            ) as response:
                response_time = (time.time() - start_time) * 1000
                node.response_time_ms = response_time
                node.last_updated = datetime.now()
                
                if response.status in (200, 402):
                    node.status = (
                        NodeStatus.SLOW if response_time > self.max_response_time
                        else NodeStatus.ONLINE
                    )
                    node.data_freshness_ms = 0
                else:
                    node.status = NodeStatus.OFFLINE
        except asyncio.TimeoutError:
            node.status = NodeStatus.SLOW
            node.last_updated = datetime.now()
        except Exception:
            node.status = NodeStatus.OFFLINE
            node.last_updated = datetime.now()
    
    async def get_data(self, method: str = "fetch", params: List = None, category: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetch data from provider nodes using HTTP + payment flow, with expiry/freshness logic.
        """
        if not self.session:
            await self.connect()
        if params is None:
            params = []
        nodes_to_try = self._select_nodes(category)
        primary_nodes = [n for n in nodes_to_try if n.is_primary and n.status == NodeStatus.ONLINE]
        fallback_nodes = [n for n in nodes_to_try if not n.is_primary and n.status in (NodeStatus.ONLINE, NodeStatus.SLOW)]
        all_nodes_to_try = primary_nodes + fallback_nodes

        now = time.time()
        for node in all_nodes_to_try:
            # Check expiry/freshness
            if node.last_value is not None and node.last_fetch_time is not None:
                if now - node.last_fetch_time < (node.expiry_ms / 1000.0):
                    # Use cached value
                    return {
                        "data": node.last_value,
                        "node_used": node.to_dict(),
                        "timestamp": datetime.now().isoformat(),
                        "method": method,
                        "response_time_ms": node.response_time_ms,
                        "success": True,
                        "cached": True,
                    }
            try:
                start_time = time.time()
                # Step 1: GET /data (expect 402)
                async with self.session.get(node.rpc_url, timeout=aiohttp.ClientTimeout(total=3)) as resp:
                    response_time = (time.time() - start_time) * 1000
                    if resp.status == 402:
                        invoice = await resp.json()
                        pay_url = node.rpc_url.replace('/data', '/data/payment')
                        # Step 2: POST payment (simulated)
                        async with self.session.post(
                            pay_url,
                            json={"tx_hash": "0xsimulated_payment"},
                            timeout=aiohttp.ClientTimeout(total=3)
                        ) as pay_resp:
                            if pay_resp.status == 200:
                                result = await pay_resp.json()
                                data = result.get('data', {})
                                node.response_time_ms = response_time
                                node.last_updated = datetime.now()
                                node.data_freshness_ms = 0
                                node.last_value = data
                                node.last_fetch_time = time.time()
                                return {
                                    "data": data,
                                    "node_used": node.to_dict(),
                                    "timestamp": datetime.now().isoformat(),
                                    "method": method,
                                    "response_time_ms": response_time,
                                    "success": True,
                                    "cached": False,
                                }
                    elif resp.status == 200:
                        result = await resp.json()
                        data = result.get('data', result)
                        node.response_time_ms = response_time
                        node.last_updated = datetime.now()
                        node.data_freshness_ms = 0
                        node.last_value = data
                        node.last_fetch_time = time.time()
                        return {
                            "data": data,
                            "node_used": node.to_dict(),
                            "timestamp": datetime.now().isoformat(),
                            "method": method,
                            "response_time_ms": response_time,
                            "success": True,
                            "cached": False,
                        }
            except Exception:
                continue
        return {
            "data": None,
            "node_used": None,
            "timestamp": datetime.now().isoformat(),
            "method": method,
            "success": False,
            "error": "All nodes failed",
        }
    
    def _select_nodes(self, category: Optional[str] = None) -> List[NodeInfo]:
        """Select nodes for querying"""
        if category:
            return [n for n in self.nodes.values() if n.category == category]
        return list(self.nodes.values())
    
    def get_nodes_status(self, category: Optional[str] = None) -> Dict[str, Any]:
        """Get status of all nodes"""
        nodes_list = self._select_nodes(category)
        nodes_data = [n.to_dict() for n in nodes_list]
        
        online_count = sum(1 for n in nodes_data if n["status"] == "online")
        
        return {
            "total_nodes": len(nodes_data),
            "connected_nodes": online_count,
            "nodes": nodes_data,
            "timestamp": datetime.now().isoformat(),
        }
    
    async def execute_batch(self, requests: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Execute multiple provider fetches in parallel, supporting multiple categories and simulating 402 payment loop for each node.
        Each request can specify a method, params, and category. Results are returned in the same order as requests.
        Enhanced: Adds per-node logging and ensures payment/data flows are non-blocking.
        """
        if not self.session:
            await self.connect()

        async def fetch_one(req):
            method = req.get("method", "fetch")
            params = req.get("params", [])
            category = req.get("category")
            node_name = req.get("node_name", "unknown")
            try:
                result = await self.get_data(method, params, category)
                if result and result.get("data") is not None:
                    print(f"   ✅ [BATCH] Node '{node_name}' ({category}) fetch succeeded.")
                    return {**result, "success": True, "node_name": node_name}
                else:
                    print(f"   ❌ [BATCH] Node '{node_name}' ({category}) fetch failed: No data returned.")
                    return {"data": None, "error": "No data returned", "success": False, "node_name": node_name}
            except Exception as e:
                print(f"   ❌ [BATCH] Node '{node_name}' ({category}) fetch error: {e}")
                return {"data": None, "error": str(e), "success": False, "node_name": node_name}

        tasks = [fetch_one(req) for req in requests]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        # All results are dicts with success/error fields
        return results

    async def get_feature_vector(self) -> Dict[str, Any]:
        """Fetch from all nodes and return a normalized 48-feature vector"""
        if not self.session:
            await self.connect()
        
        nodes = list(self.nodes.values())
        # Build fetch tasks for each node
        tasks = [self.get_data(category=n.category) for n in nodes]
        results = await asyncio.gather(*tasks)
        
        # Extract a numeric value per node for normalization
        import numpy as np
        values = []
        used = []
        for r in results:
            data = r.get("data")
            used.append(r.get("node_used", {}).get("name"))
            # Try common numeric fields
            num = None
            if isinstance(data, dict):
                # Prefer 'value' then first numeric field
                if "value" in data and isinstance(data["value"], (int, float)):
                    num = float(data["value"])
                else:
                    for k, v in data.items():
                        if isinstance(v, (int, float)):
                            num = float(v)
                            break
            elif isinstance(data, (int, float)):
                num = float(data)
            values.append(num if num is not None else 0.0)
        
        vec = np.array(values, dtype=np.float32)
        vmin, vmax = float(vec.min()), float(vec.max())
        if vmax - vmin > 0:
            norm = (vec - vmin) / (vmax - vmin)
        else:
            norm = np.full_like(vec, 0.5)
        
        return {
            "vector": norm,
            "raw": values,
            "nodes": used,
            "timestamp": datetime.now().isoformat(),
        }


# Global connector instance
_connector: Optional[NodeConnector] = None


async def get_connector() -> NodeConnector:
    """Get or create global connector instance"""
    global _connector
    if _connector is None:
        _connector = NodeConnector()
        await _connector.connect()
    return _connector


async def close_connector():
    """Close global connector instance"""
    global _connector
    if _connector:
        await _connector.disconnect()
        _connector = None
