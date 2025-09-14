#!/usr/bin/env node

/**
 * QuantraPay Website Manager
 * 
 * Professional deployment script that:
 * - Deploys all website dashboards
 * - Keeps them running continuously
 * - Auto-restarts if any dashboard crashes
 * - Provides monitoring and status updates
 * 
 * Usage: node website-manager.cjs
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Configuration
const CONFIG = {
  dashboards: {
    merchant: { port: 3001, name: 'Merchant Dashboard', dir: 'frontend/merchant' },
    dao: { port: 3002, name: 'DAO Governance', dir: 'frontend/dao' },
    payer: { port: 3003, name: 'Payer Interface', dir: 'frontend/payer' },
    system: { port: 3004, name: 'System Analytics', dir: 'frontend/system' },
    settler: { port: 3005, name: 'Settlement Operations', dir: 'frontend/settler' }
  },
  monitoring: {
    healthCheckInterval: 30000, // 30 seconds
    restartDelay: 5000, // 5 seconds
    maxRestartAttempts: 3
  }
};

class WebsiteManager {
  constructor() {
    this.processes = new Map();
    this.restartCounts = new Map();
    this.isShuttingDown = false;
    this.startTime = new Date();
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      warning: '\x1b[33m',
      error: '\x1b[31m',
      reset: '\x1b[0m'
    };
    console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
  }

  async checkPrerequisites() {
    this.log('🔍 Checking prerequisites...', 'info');
    
    // Check Node.js and npm
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      this.log(`Node.js: ${nodeVersion}, npm: ${npmVersion}`, 'success');
    } catch (error) {
      throw new Error('Node.js or npm not found');
    }

    // Check frontend directories
    for (const [key, config] of Object.entries(CONFIG.dashboards)) {
      if (!fs.existsSync(config.dir)) {
        throw new Error(`Directory not found: ${config.dir}`);
      }
      if (!fs.existsSync(path.join(config.dir, 'package.json'))) {
        throw new Error(`package.json not found in ${config.dir}`);
      }
    }

    this.log('✅ All prerequisites satisfied', 'success');
  }

  async installDependencies() {
    this.log('📦 Installing dependencies...', 'info');
    
    for (const [key, config] of Object.entries(CONFIG.dashboards)) {
      try {
        this.log(`Installing ${config.name} dependencies...`, 'info');
        execSync('npm install', { 
          cwd: config.dir, 
          stdio: 'pipe' 
        });
        this.log(`✅ ${config.name} dependencies installed`, 'success');
      } catch (error) {
        this.log(`❌ Failed to install ${config.name} dependencies`, 'error');
        throw error;
      }
    }
  }

  async startDashboard(key, config) {
    if (this.processes.has(key)) {
      this.log(`${config.name} is already running`, 'warning');
      return;
    }

    this.log(`🚀 Starting ${config.name} on port ${config.port}...`, 'info');

    const child = spawn('npm', ['start'], {
      cwd: config.dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: false
    });

    // Store process info
    this.processes.set(key, {
      process: child,
      config: config,
      startTime: new Date(),
      status: 'starting'
    });

    // Handle process output
    child.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output.includes('webpack compiled') || output.includes('Local:') || output.includes('development server')) {
        this.processes.get(key).status = 'running';
        this.log(`✅ ${config.name} is running on http://localhost:${config.port}`, 'success');
      }
    });

    child.stderr.on('data', (data) => {
      const error = data.toString().trim();
      if (error && !error.includes('Warning')) {
        this.log(`⚠️ ${config.name} error: ${error}`, 'warning');
      }
    });

    // Handle process exit
    child.on('exit', (code, signal) => {
      this.processes.delete(key);
      
      if (!this.isShuttingDown) {
        this.log(`💥 ${config.name} exited with code ${code}`, 'error');
        this.handleProcessCrash(key, config);
      }
    });

    child.on('error', (error) => {
      this.log(`💥 ${config.name} process error: ${error.message}`, 'error');
      this.processes.delete(key);
      this.handleProcessCrash(key, config);
    });

    // Wait a moment for startup
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  async handleProcessCrash(key, config) {
    if (this.isShuttingDown) return;

    const restartCount = this.restartCounts.get(key) || 0;
    
    if (restartCount < CONFIG.monitoring.maxRestartAttempts) {
      this.restartCounts.set(key, restartCount + 1);
      this.log(`🔄 Restarting ${config.name} (attempt ${restartCount + 1}/${CONFIG.monitoring.maxRestartAttempts})...`, 'warning');
      
      setTimeout(() => {
        this.startDashboard(key, config);
      }, CONFIG.monitoring.restartDelay);
    } else {
      this.log(`💀 ${config.name} failed too many times, giving up`, 'error');
    }
  }

  async startAllDashboards() {
    this.log('🚀 Starting all dashboards...', 'info');
    
    const startPromises = Object.entries(CONFIG.dashboards).map(([key, config]) => 
      this.startDashboard(key, config)
    );
    
    await Promise.all(startPromises);
    this.log('✅ All dashboards startup initiated', 'success');
  }

  async checkHealth() {
    for (const [key, processInfo] of this.processes.entries()) {
      const { config } = processInfo;
      
      try {
        await this.pingServer(config.port);
        processInfo.status = 'healthy';
      } catch (error) {
        this.log(`🏥 Health check failed for ${config.name}`, 'warning');
        processInfo.status = 'unhealthy';
      }
    }
  }

  pingServer(port) {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        resolve(res.statusCode);
      });
      
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  }

  startMonitoring() {
    this.log('👁️ Starting health monitoring...', 'info');
    
    setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.checkHealth();
        this.printStatus();
      }
    }, CONFIG.monitoring.healthCheckInterval);
  }

  printStatus() {
    console.clear();
    console.log('\n' + '='.repeat(80));
    console.log('🌐 QuantraPay Website Manager - Live Status');
    console.log('='.repeat(80));
    console.log(`Started: ${this.startTime.toLocaleString()}`);
    console.log(`Uptime: ${this.getUptime()}`);
    console.log();
    
    console.log('📱 Dashboard Status:');
    for (const [key, processInfo] of this.processes.entries()) {
      const { config, status, startTime } = processInfo;
      const statusIcon = status === 'healthy' ? '🟢' : status === 'running' ? '🟡' : '🔴';
      const uptime = this.getProcessUptime(startTime);
      console.log(`${statusIcon} ${config.name}: http://localhost:${config.port} (${status}) - ${uptime}`);
    }
    
    console.log();
    console.log('🔗 Quick Access URLs:');
    for (const [key, config] of Object.entries(CONFIG.dashboards)) {
      console.log(`   ${config.name}: http://localhost:${config.port}`);
    }
    
    console.log();
    console.log('💡 Press Ctrl+C to gracefully shutdown all dashboards');
    console.log('='.repeat(80));
  }

  getUptime() {
    const uptime = Date.now() - this.startTime.getTime();
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  getProcessUptime(startTime) {
    const uptime = Date.now() - startTime.getTime();
    const minutes = Math.floor(uptime / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  async gracefulShutdown() {
    this.isShuttingDown = true;
    this.log('🛑 Initiating graceful shutdown...', 'warning');
    
    const shutdownPromises = [];
    
    for (const [key, processInfo] of this.processes.entries()) {
      const { process, config } = processInfo;
      this.log(`Stopping ${config.name}...`, 'info');
      
      shutdownPromises.push(new Promise((resolve) => {
        process.on('exit', resolve);
        process.kill('SIGTERM');
        
        // Force kill after 10 seconds
        setTimeout(() => {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
          resolve();
        }, 10000);
      }));
    }
    
    await Promise.all(shutdownPromises);
    this.log('✅ All dashboards stopped gracefully', 'success');
    process.exit(0);
  }

  setupSignalHandlers() {
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('uncaughtException', (error) => {
      this.log(`💥 Uncaught exception: ${error.message}`, 'error');
      this.gracefulShutdown();
    });
  }

  async run() {
    try {
      console.log('\n🌐 QuantraPay Website Manager Starting...\n');
      
      await this.checkPrerequisites();
      await this.installDependencies();
      await this.startAllDashboards();
      
      // Wait for all processes to be ready
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      this.startMonitoring();
      this.setupSignalHandlers();
      
      this.log('🎉 QuantraPay Website Manager is fully operational!', 'success');
      this.log('All dashboards are running continuously...', 'info');
      
    } catch (error) {
      this.log(`💥 Failed to start website manager: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// Main execution
if (require.main === module) {
  const manager = new WebsiteManager();
  manager.run();
}

module.exports = WebsiteManager;