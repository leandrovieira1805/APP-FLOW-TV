module.exports = {
  apps: [
    {
      name: 'flowtv-backend',
      script: '/root/APP-FLOW-TV/backend/src/server.js',
      interpreter: 'node',
      interpreter_args: '--max-old-space-size=256',
      cwd: '/root/APP-FLOW-TV/backend',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'flowtv-ssr',
      script: '/root/APP-FLOW-TV/dist/server/server.js',
      interpreter: 'node',
      interpreter_args: '--max-old-space-size=384',
      cwd: '/root/APP-FLOW-TV',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '450M',
      restart_delay: 2000,
      max_restarts: 10,
    }
  ]
};
