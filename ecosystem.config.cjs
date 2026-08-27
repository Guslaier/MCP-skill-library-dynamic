module.exports = {
  apps: [
    {
      name: "skill-library-mcp",
      script: "dist/index.js",
      args: "--http",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 8787,
        MCP_TRANSPORT: "http",
        SKILL_LIBRARY_DATA_DIR: "./.data",
      },
    },
  ],
};
