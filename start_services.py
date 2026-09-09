from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "service-logs"
PID_FILE = LOG_DIR / "service-pids.json"


SERVICES = [
    {
        "name": "Ampps",
        "cwd": Path(r"C:\Program Files\Ampps"),
        "command": [r"C:\Program Files\Ampps\Ampps.exe"],
        "env": {},
        "log_file": "ampps.log",
    },
    {
        "name": "Node backend",
        "cwd": ROOT,
        "command": ["node", "backend/server.js"],
        "env": {},
        "log_file": "node-backend.log",
    },
    {
        "name": "API server",
        "cwd": ROOT / "api",
        "command": [
            str(ROOT / ".venv" / "Scripts" / "python.exe"),
            "-m",
            "uvicorn",
            "app:app",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
            "--reload",
        ],
        "env": {
            "PLAYWRIGHT_HEADLESS": "0",
        },
        "log_file": "api-server.log",
    },
    {
        "name": "Frontend",
        "cwd": ROOT / "shein-frontend",
        "command": ["npm.cmd", "start"],
        "env": {
            "BROWSER": "none",
            "HOST": "0.0.0.0",
        },
        "log_file": "frontend.log",
    },
]


def launch_service(
    service: dict[str, object], hidden: bool
) -> subprocess.Popen[bytes]:
    env = os.environ.copy()
    env.update(service["env"])  # type: ignore[arg-type]

    creationflags = 0
    stdout = None
    stderr = None

    if os.name == "nt":
        if hidden:
            creationflags = (
                subprocess.DETACHED_PROCESS
                | subprocess.CREATE_NEW_PROCESS_GROUP
                | subprocess.CREATE_NO_WINDOW
            )
        else:
            creationflags = subprocess.CREATE_NEW_CONSOLE

    if hidden:
        LOG_DIR.mkdir(exist_ok=True)
        log_path = LOG_DIR / str(service["log_file"])
        log_handle = log_path.open("ab")
        stdout = log_handle
        stderr = log_handle
    else:
        log_handle = None

    try:
        return subprocess.Popen(
            service["command"],  # type: ignore[arg-type]
            cwd=service["cwd"],
            env=env,
            creationflags=creationflags,
            stdin=subprocess.DEVNULL,
            stdout=stdout,
            stderr=stderr,
        )
    finally:
        if log_handle is not None:
            log_handle.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--hidden",
        action="store_true",
        help="Start services in the background without opening console windows.",
    )
    args = parser.parse_args()

    failures: list[str] = []
    started: dict[str, int] = {}

    for service in SERVICES:
        name = service["name"]
        cwd = Path(service["cwd"])

        if not cwd.exists():
            failures.append(f"{name}: missing directory {cwd}")
            continue

        try:
            process = launch_service(service, hidden=args.hidden)
            started[str(name)] = process.pid
            print(f"Started {name} (PID {process.pid})")
        except FileNotFoundError as exc:
            failures.append(f"{name}: command not found: {exc.filename}")
        except Exception as exc:  # pragma: no cover
            failures.append(f"{name}: {exc}")

    if started:
        LOG_DIR.mkdir(exist_ok=True)
        PID_FILE.write_text(json.dumps(started, indent=2), encoding="utf-8")

    if failures:
        print("\nSome services did not start:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    if args.hidden:
        print(f"\nAll services were launched in the background. Logs: {LOG_DIR}")
    else:
        print("\nAll services were launched in separate windows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
