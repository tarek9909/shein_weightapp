from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import time
from urllib.request import urlopen
from pathlib import Path


ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "service-logs"
PID_FILE = LOG_DIR / "service-pids.json"


SERVICES = [
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
            "127.0.0.1",
            "--port",
            "8000",
        ],
        "env": {
            "PLAYWRIGHT_HEADLESS": "1",
        },
        "log_file": "api-server.log",
    },
    {
        "name": "Frontend",
        "cwd": ROOT / "shein-frontend",
        "command": ["cmd.exe", "/c", "set HOST=127.0.0.1&&set BROWSER=none&&npm start"],
        "env": {
            "BROWSER": "none",
            "HOST": "127.0.0.1",
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
            creationflags = subprocess.CREATE_NO_WINDOW
        else:
            creationflags = subprocess.CREATE_NEW_CONSOLE

    if hidden:
        LOG_DIR.mkdir(exist_ok=True)
        log_path = LOG_DIR / str(service["log_file"])
        log_handle = log_path.open("wb")
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


def port_is_free(port: int) -> bool:
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def wait_ready(
    url: str,
    process: subprocess.Popen[bytes],
    timeout: float = 60,
    check_process: bool = True,
) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check_process and process.poll() is not None:
            return False
        try:
            with urlopen(url, timeout=2) as response:  # nosec B310 - local configured service URL
                if response.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


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

    for port, service in ((8081, "Node backend"), (8000, "API server"), (3000, "Frontend")):
        if not port_is_free(port):
            failures.append(f"{service}: port {port} is already in use")
    if failures:
        for failure in failures:
            print(failure)
        return 1

    for service in SERVICES:
        name = service["name"]
        cwd = Path(service["cwd"])

        if not cwd.exists():
            failures.append(f"{name}: missing directory {cwd}")
            continue

        try:
            executable = str(service["command"][0])  # type: ignore[index]
            if not Path(executable).exists() and shutil.which(executable) is None:
                failures.append(f"{name}: command not found: {executable}")
                continue
            process = launch_service(service, hidden=args.hidden)
            started[str(name)] = process.pid
            print(f"Started {name} (PID {process.pid})")
            if name in {"Node backend", "API server", "Frontend"}:
                url = {"Node backend": "http://127.0.0.1:8081/ready", "API server": "http://127.0.0.1:8000/ping", "Frontend": "http://127.0.0.1:3000"}[str(name)]
                if not wait_ready(url, process, check_process=True):
                    failures.append(f"{name}: process did not become ready")
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
        for pid in started.values():
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, check=False)
        try:
            PID_FILE.unlink(missing_ok=True)
        except OSError:
            pass
        return 1

    if args.hidden:
        print(f"\nAll services were launched in the background. Logs: {LOG_DIR}")
    else:
        print("\nAll services were launched in separate windows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
