# Alpha Consumer System - Quick Start Guide

## 🚀 System Status: FULLY OPERATIONAL

### Running Services

| Service | URL | Port | Status |
|---------|-----|------|--------|
| Frontend (Next.js) | http://localhost:3600 | 3600 | ✅ Running |
| Sentiment Node | http://localhost:4002 | 4002 | ✅ Running |
| Macro Node | http://localhost:4003 | 4003 | ✅ Running |
| Microstructure Node | http://localhost:4001 | 4001 | ✅ Running |
| Demo Providers | (background) | 5000-5047 | ✅ Running |

---

## ⚡ Quick Start

### 1. Start the Complete System

```bash
cd /Users/adarsh/Documents/LinkX-buidl-sol
./start_all.sh
```

This will automatically start:
- Demo providers (data simulation)
- Prisma database setup
- Frontend (Next.js)

### 2. Start Node Services (Separately)

After the main system is running, start the nodes in another terminal:

```bash
cd /Users/adarsh/Documents/LinkX-buidl-sol
./start_nodes.sh
```

This will start all three Alpha Nodes:
- Sentiment Node (port 4002)
- Macro Node (port 4003)
- Microstructure Node (port 4001)

---

## 📊 System Components

### `start_all.sh` - Main Startup Script

Handles:
- Port cleanup (prevents EADDRINUSE errors)
- Process termination from previous runs
- Demo provider initialization
- Database seeding (Prisma)
- Frontend startup (Next.js on port 3600)
- Graceful error handling for Python dependencies

**Key Improvements:**
- ✅ Automatically kills stale processes on ports 4001-4004
- ✅ Skips Backend API if uvicorn not available (non-critical)
- ✅ Avoids sudo prompts during startup
- ✅ Streamlined dependency installation

### `start_nodes.sh` - Node Services Script

Starts the three Alpha Nodes with proper sequencing:

1. **Sentiment Node** - Alternative Intelligence & Sentiment Analysis
   - Port: 4002
   - Endpoint: http://localhost:4002/api/sentiment

2. **Macro Node** - Supply Chain & Global Macro
   - Port: 4003
   - Endpoint: http://localhost:4003/api/macro

3. **Microstructure Node** - Market Microstructure & Execution
   - Port: 4001
   - Endpoint: http://localhost:4001/api/microstructure

---

## 🛑 Stopping Services

### Stop Everything
```bash
pkill -f "node.*node_" && pkill -f pnpm && pkill -f "start_demo"
```

### Stop Only Nodes
```bash
pkill -f "node_sentiment\|node_macro\|node_microstructure"
```

### Stop Frontend
```bash
pkill -f pnpm
```

---

## 📋 Service Logs

Monitor individual service output:

```bash
# View frontend logs (tail the current terminal where start_all.sh runs)

# View Sentiment Node
tail -f /tmp/sentiment.log

# View Macro Node
tail -f /tmp/macro.log

# View Microstructure Node
tail -f /tmp/microstructure.log

# View Demo Providers
tail -f /tmp/demo_providers.log

# View Backend API (if running)
tail -f /tmp/backend_api.log
```

---

## 🔧 Troubleshooting

### Port Already in Use
If you get "EADDRINUSE" errors on startup, the scripts now automatically handle this by killing stale processes. If issues persist:

```bash
# Manually kill process on specific port
lsof -ti:4001 | xargs kill -9  # Port 4001 (Microstructure)
lsof -ti:4002 | xargs kill -9  # Port 4002 (Sentiment)
lsof -ti:4003 | xargs kill -9  # Port 4003 (Macro)
lsof -ti:3600 | xargs kill -9  # Port 3600 (Frontend)
```

### Backend API Not Starting
The Backend API (Python uvicorn) is **optional** and skipped if dependencies aren't available. The system works fine without it. To enable:

```bash
cd /Users/adarsh/Documents/LinkX-buidl-sol/agent
pip install -r requirements.txt
```

### Node Services Not Responding
1. Check logs: `tail -f /tmp/sentiment.log`
2. Verify frontend is running on port 3600
3. Check port availability: `lsof -i :4001,:4002,:4003`
4. Restart nodes: `./start_nodes.sh`

---

## 📱 Frontend Access

Once running, access the system at:

**http://localhost:3600**

The frontend will automatically redirect to the dashboard. Here you can:
- View system status and node health
- Monitor Alpha Node activity
- Check trading signals and analytics
- View historical data from providers

---

## 🔌 API Endpoints

### Frontend
- **Base**: http://localhost:3600
- **Dashboard**: http://localhost:3600/dashboard
- **API**: http://localhost:3600/api/*

### Nodes
- **Sentiment**: http://localhost:4002/api/sentiment
- **Macro**: http://localhost:4003/api/macro
- **Microstructure**: http://localhost:4001/api/microstructure

---

## 📊 Architecture

```
┌─────────────────────────────────────────┐
│         Frontend (Next.js 3600)         │
│     (Dashboard, UI, Data Display)       │
└─────────────────────────────────────────┘
           ↓              ↓            ↓
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │Sentiment │  │  Macro   │  │Microstr. │
    │(4002)    │  │ (4003)   │  │ (4001)   │
    └──────────┘  └──────────┘  └──────────┘
           ↓              ↓            ↓
    ┌──────────────────────────────────────┐
    │      Demo Providers (5000-5047)      │
    │      (Market Data Simulation)        │
    └──────────────────────────────────────┘
           ↓
    ┌──────────────────────────────────────┐
    │   Prisma Database (agent_state.db)   │
    └──────────────────────────────────────┘
```

---

## 🎯 Next Steps

1. **Run the system**: `./start_all.sh`
2. **In another terminal, start nodes**: `./start_nodes.sh`
3. **Open browser**: http://localhost:3600
4. **Monitor logs**: `tail -f /tmp/*.log`
5. **View node status**: Check the frontend dashboard

---

## ✅ System Features

- ✅ Automatic port cleanup on startup
- ✅ Graceful error handling
- ✅ Multi-service coordination
- ✅ Log file output for debugging
- ✅ SIGINT/SIGTERM trap for clean shutdown
- ✅ Node auto-registration with frontend
- ✅ Database seeding with Alpha Nodes
- ✅ Demo data providers simulation

---

**Last Updated**: March 1, 2026
**System Version**: Alpha Consumer v1.0
