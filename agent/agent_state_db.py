import sqlite3
import os
import sys
from datetime import datetime
import json

class AgentStateDB:
    def record_node_purchase(self, node_title, cost=1.0, wallet_address="29btcGViz61Db5c1HTeEyw9p5rpDQG87VYNe1WupQnDL"):
        """Logs node purchase for the 'Data Stream' as an activity record."""
        import json
        from uuid import uuid4
        import time
        for attempt in range(3):
            try:
                conn = self._get_connection()
                cursor = conn.cursor()
                now = datetime.utcnow().isoformat(timespec='milliseconds') + 'Z'
                
                # Get node ID by title
                cursor.execute("SELECT id FROM AlphaNode WHERE title = ?", (node_title,))
                node_row = cursor.fetchone()
                if not node_row:
                    print(f"   ⚠️ [DB] Node '{node_title}' not found, skipping purchase record")
                    conn.close()
                    return
                
                node_id = node_row[0]
                
                # Update AlphaNode lastPurchaseTime
                cursor.execute("UPDATE AlphaNode SET lastPurchaseTime = ? WHERE title = ?", (now, node_title))
                
                # Insert into AgentActivity with required fields only, including id
                cursor.execute("""
                    INSERT INTO AgentActivity (id, type, title, description, nodePrice, timestamp, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    str(uuid4()),
                    "node_purchase",
                    f"Purchased {node_title}",
                    f"Bought {node_title} intelligence",
                    cost,
                    now,
                    json.dumps({"node": node_title, "cost": cost})
                ))
                conn.commit()
                conn.close()
                break
            except sqlite3.OperationalError as e:
                if 'database is locked' in str(e) and attempt < 2:
                    print(f"   ⚠️ [DB Locked] Retrying node purchase log...")
                    time.sleep(0.2)
                    continue
                print(f"   ❌ [DB Error] {e}")
                break
            except Exception as e:
                print(f"   ❌ [DB Error] {e}")
                break

    def record_trade_decision(self, context, trade_id=None, data_log_id=None, decided_at=None):
        """Logs a trade decision for the 'Decision Log'.
        Inserts all columns required by the Prisma schema, setting unused to NULL.
        """
        from uuid import uuid4
        from datetime import datetime
        import json
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            now = decided_at or (datetime.utcnow().isoformat(timespec='milliseconds') + 'Z')
            # If context is a dictionary (structured), convert to JSON string
            if isinstance(context, dict):
                context_str = json.dumps(context)
            else:
                context_str = context
            cursor.execute(
                """
                INSERT INTO TradeDecision (
                    id, tradeId, context, decidedAt
                ) VALUES (?, ?, ?, ?)
                """,
                (str(uuid4()), trade_id, context_str, now)
            )
            conn.commit()
            conn.close()
            print(f"   ✅ [DB] Trade decision recorded: {context_str[:50]}...")
            sys.stdout.flush()
        except Exception as e:
            print(f"   ❌ [DB Error] Failed to record trade: {e}")
            import traceback
            traceback.print_exc()
            sys.stdout.flush()
    def __init__(self, db_path="agent/agent_state.db"):
        # Match the path used in your start_all.sh/Prisma logs
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.db_path = os.path.join(project_root, db_path)
        print(f"   📂 [DB Connection] Standardized Path: {self.db_path}")

    def _get_connection(self):
        return sqlite3.connect(self.db_path)

    def get_performance_context(self):
        """Ensures the agent sees its history to break out of NEUTRAL loop."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT type, status FROM TradeDecision ORDER BY createdAt DESC LIMIT 5")
            trades = cursor.fetchall()
            conn.close()
            return f"Agent has executed {len(trades)} trades in current session."
        except: return "Session Initialized."

    def get_active_nodes_catalog(self):
        try:
            conn = self._get_connection()
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            # Fetch ALL nodes regardless of status to ensure the AI sees 'something'
            cursor.execute("SELECT id, title, category, reliabilityScore, description, lastPurchaseTime FROM AlphaNode")
            nodes = cursor.fetchall()
            conn.close()

            catalog = []
            for n in nodes:
                catalog.append({
                    "id": n['id'],
                    "title": n['title'],
                    "specialty": n['category'],
                    "description": n['description'] or "Market data provider",
                    "last_bought_at": n['lastPurchaseTime']
                })
            print(f"   📡 [DB Catalog] Found {len(catalog)} nodes in database.")
            return catalog
        except Exception as e:
            print(f"   ❌ [DB Error] {e}")
            return []

    def get_trade_decisions(self, limit=50):
        """Retrieve recent trade decisions from the database for the Decision Log."""
        try:
            conn = self._get_connection()
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, context, decidedAt FROM TradeDecision ORDER BY decidedAt DESC LIMIT ?",
                (limit,)
            )
            decisions = cursor.fetchall()
            conn.close()
            
            result = []
            for d in decisions:
                try:
                    # Parse JSON context if available
                    context = json.loads(d['context']) if d['context'] else {}
                    result.append({
                        "id": d['id'],
                        "action": context.get("action", "TRADE"),
                        "amount": context.get("amount", "N/A"),
                        "decidedAt": d['decidedAt']
                    })
                except:
                    # Fallback if context is not valid JSON
                    result.append({
                        "id": d['id'],
                        "action": "TRADE",
                        "amount": d['context'],
                        "decidedAt": d['decidedAt']
                    })
            
            return result
        except Exception as e:
            print(f"   ❌ [DB Error] {e}")
            return []
