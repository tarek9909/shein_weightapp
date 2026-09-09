from __future__ import annotations

import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "service-logs"
PID_FILE = LOG_DIR / "service-pids.json"


def stop_pid(name: str, pid: int) -> tuple[bool, str]:
    try:
        completed = subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception as exc:  # pragma: no cover
        return False, f"{name}: {exc}"

    if completed.returncode == 0:
        return True, f"Stopped {name} (PID {pid})"

    error = (completed.stderr or completed.stdout).strip()
    if "not found" in error.lower() or "no running instance" in error.lower():
        return True, f"{name} was already stopped (PID {pid})"

    return False, f"{name}: {error or 'taskkill failed'}"


def main() -> int:
    if not PID_FILE.exists():
        print(f"No PID file found at {PID_FILE}")
        print("Start the services with start_services.py or start_services_hidden.vbs first.")
        return 1

    try:
        services = json.loads(PID_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"Could not read PID file: {exc}")
        return 1

    failures: list[str] = []

    for name, pid in services.items():
        ok, message = stop_pid(str(name), int(pid))
        print(message)
        if not ok:
            failures.append(message)

    if not failures:
        PID_FILE.unlink(missing_ok=True)
        print("\nAll tracked services are stopped.")
        return 0

    print("\nSome services could not be stopped cleanly.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
