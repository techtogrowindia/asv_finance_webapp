// pm2 process definition for the ASV Finance API.
//   pm2 start ecosystem.config.js
// Reads env from the server-only .env (via @nestjs/config in the app).
module.exports = {
  apps: [
    {
      name: 'asvfinance-api',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '300M',
    },
  ],
};
