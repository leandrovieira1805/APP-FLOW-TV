module.exports = {
  apps: [
    {
      name: 'flowtv-proxy',
      script: './app.js',
      cwd: '/root/APP-FLOW-TV',
      env: {
        PORT: 80,
        NODE_ENV: 'production'
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      watch: false
    }
  ]
};
