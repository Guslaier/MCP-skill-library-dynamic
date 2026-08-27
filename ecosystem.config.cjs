module.exports = {
  apps: [
    {
      name: "skill-library-mcp",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 8787,
        SKILLS_DIR: "./.agents/skills",
        SKILL_LIBRARY_DATA_DIR: "./.data",
      },
    },
  ],
};
