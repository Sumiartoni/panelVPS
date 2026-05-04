module.exports = {
  apps: [
    {
      name: "vps-dashboard",
      script: "server.js",
      cwd: "/opt/vps-dashboard",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3007
      }
    }
  ]
};
