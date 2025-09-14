# QuantraPay Website Manager

## Professional Website Deployment

### Quick Start
```bash
node website-manager.cjs
```

### Features
- ✅ Continuous operation - keeps running even when browser closed
- ✅ Auto-restart if any dashboard crashes  
- ✅ Real-time health monitoring
- ✅ Professional process management
- ✅ Graceful shutdown with Ctrl+C
- ✅ Live status dashboard in terminal

### Dashboard Access URLs
- **Merchant Dashboard**: http://localhost:3001
- **DAO Governance**: http://localhost:3002  
- **Payer Interface**: http://localhost:3003
- **System Analytics**: http://localhost:3004
- **Settlement Operations**: http://localhost:3005

### How It Works
1. Automatically installs all dependencies
2. Starts all 5 dashboards simultaneously
3. Monitors health every 30 seconds
4. Auto-restarts crashed processes (up to 3 attempts)
5. Provides live status updates
6. Runs continuously until manually stopped

### Professional Features
- Process monitoring and auto-recovery
- Graceful shutdown handling
- Colored terminal output for better visibility
- Uptime tracking for each dashboard
- Error logging and restart attempts
- Clean status display with real-time updates

### Stopping the Website
Press `Ctrl+C` to gracefully shutdown all dashboards.

### Troubleshooting
- If a dashboard fails to start, check the error logs in terminal
- Each dashboard auto-restarts up to 3 times before giving up
- Health checks run every 30 seconds to detect issues
- All processes are properly cleaned up on exit