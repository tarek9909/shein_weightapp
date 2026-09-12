const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const venvPython = process.platform === "win32"
  ? path.join(projectRoot, ".venv", "Scripts", "python.exe")
  : path.join(projectRoot, ".venv", "bin", "python");
const pythonExecutable = process.env.PYTHON_EXECUTABLE
  || (fs.existsSync(venvPython) ? venvPython : (process.platform === "win32" ? "python" : "python3"));

module.exports = {
  apps: [
    {
      name: "shein-node-backend",
      script: "backend/server.js",
      cwd: projectRoot,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 8081,
        HOST: process.env.HOST || "0.0.0.0",
      },
      error_file: "service-logs/node-error.log",
      out_file: "service-logs/node-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "shein-scraper-api",
      script: pythonExecutable,
      args: "-m uvicorn app:app --host 127.0.0.1 --port 8000",
      cwd: path.join(projectRoot, "api"),
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1500M",
      env: {
        PLAYWRIGHT_HEADLESS: "1",
        PYTHONUNBUFFERED: "1",
      },
      error_file: "service-logs/api-error.log",
      out_file: "service-logs/api-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
