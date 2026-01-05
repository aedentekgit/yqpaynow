/**
 * PM2 Ecosystem Configuration
 * Cluster mode for multi-core CPU utilization
 * Run from backend directory: pm2 start optimization/ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      name: 'yqpaynow-backend',
      script: './server.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster', // Cluster mode for load balancing
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      // Auto restart on crash
      autorestart: true,
      watch: false, // Disable in production
      max_memory_restart: '1G', // Restart if memory exceeds 1GB
      
      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Advanced settings
      min_uptime: '10s', // Minimum uptime before considering stable
      max_restarts: 10, // Max restarts in 1 minute
      restart_delay: 4000, // Delay between restarts
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Instance management
      instance_var: 'INSTANCE_ID',
      
      // Health monitoring
      health_check_grace_period: 3000,
      health_check_fatal_exceptions: true
    }
  ]
};

