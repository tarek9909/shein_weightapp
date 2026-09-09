const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory() && !["node_modules", ".git"].includes(entry.name)) return collect(target);
    return target.endsWith(".js") ? [target] : [];
  });
}

for (const file of collect(path.join(__dirname, ".."))) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
console.log("Node syntax OK");
