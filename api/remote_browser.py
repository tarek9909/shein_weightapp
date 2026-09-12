import os
import errno
import re
import signal
import subprocess
import time
from pathlib import Path
from threading import Lock


VNC_PASSWORD_FILE = Path(os.getenv("SHEIN_VNC_PASSWORD_FILE", "/run/vnc-data/password"))
VNC_BASIC_AUTH_FILE = Path(os.getenv("SHEIN_VNC_BASIC_AUTH_FILE", "/run/vnc-auth/.htpasswd"))
VNC_DISPLAY = os.getenv("DISPLAY", ":99")
VNC_RUNTIME_PASSWORD_FILE = Path(os.getenv("SHEIN_VNC_RUNTIME_PASSWORD_FILE", "/root/.vnc/passwd"))
_VNC_LOCK = Lock()


def _validate_credentials(username: str, password: str) -> tuple[str, str]:
    clean_username = str(username or "").strip()
    clean_password = str(password or "")
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", clean_username):
        raise ValueError("VNC username must use only letters, numbers, dot, underscore, or hyphen")
    if len(clean_password) < 8:
        raise ValueError("VNC password must be at least 8 characters")
    if "\n" in clean_password or "\r" in clean_password:
        raise ValueError("VNC password cannot contain line breaks")
    return clean_username, clean_password


def _write_file(path: Path, contents: str, mode: int, group: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    try:
        temporary.write_text(contents, encoding="utf-8")
        os.chmod(temporary, mode)
        if group is not None and hasattr(os, "chown"):
            try:
                os.chown(temporary, 0, group)
            except OSError:
                pass
        try:
            os.replace(temporary, path)
        except OSError as exc:
            # A single-file Docker bind mount can reject an atomic rename at
            # the mount point. Fall back to an in-place write for that case;
            # the caller holds _VNC_LOCK so updates remain serialized.
            if exc.errno not in (errno.EBUSY, errno.EXDEV, errno.EPERM):
                raise
            path.write_text(contents, encoding="utf-8")
            os.chmod(path, mode)
            if group is not None and hasattr(os, "chown"):
                try:
                    os.chown(path, 0, group)
                except OSError:
                    pass
    finally:
        if temporary.exists():
            temporary.unlink(missing_ok=True)


def _apr1_hash(password: str) -> str:
    try:
        result = subprocess.run(
            ["openssl", "passwd", "-apr1", "-stdin"],
            input=f"{password}\n",
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise RuntimeError("OpenSSL is required to update VNC HTTP authentication") from exc
    value = result.stdout.strip()
    if not value.startswith("$apr1$"):
        raise RuntimeError("OpenSSL did not generate a valid VNC HTTP authentication hash")
    return value


def _store_x11vnc_password(password: str) -> None:
    VNC_RUNTIME_PASSWORD_FILE.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["x11vnc", "-storepasswd", password, str(VNC_RUNTIME_PASSWORD_FILE)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
        timeout=10,
    )
    os.chmod(VNC_RUNTIME_PASSWORD_FILE, 0o600)


def _stop_existing_x11vnc() -> None:
    proc_root = Path("/proc")
    if not proc_root.is_dir():
        return
    for proc_dir in proc_root.iterdir():
        if not proc_dir.name.isdigit():
            continue
        try:
            command = (proc_dir / "cmdline").read_bytes().replace(b"\x00", b" ").decode("utf-8", "ignore")
        except OSError:
            continue
        if "x11vnc" not in command or "-rfbport 5900" not in command:
            continue
        try:
            os.kill(int(proc_dir.name), signal.SIGTERM)
        except (OSError, ValueError):
            pass
    time.sleep(0.4)


def _start_x11vnc() -> None:
    process = subprocess.Popen(
        [
            "x11vnc",
            "-display",
            VNC_DISPLAY,
            "-localhost",
            "-forever",
            "-shared",
            "-rfbport",
            "5900",
            "-rfbauth",
            str(VNC_RUNTIME_PASSWORD_FILE),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    time.sleep(0.5)
    if process.poll() is not None:
        raise RuntimeError("x11vnc did not restart")


def get_vnc_username() -> str:
    try:
        first_line = VNC_BASIC_AUTH_FILE.read_text(encoding="utf-8").splitlines()[0]
        username = first_line.split(":", 1)[0].strip()
        return username or "admin"
    except (OSError, IndexError):
        return "admin"


def update_vnc_credentials(username: str, password: str) -> str:
    clean_username, clean_password = _validate_credentials(username, password)
    with _VNC_LOCK:
        auth_hash = _apr1_hash(clean_password)
        _write_file(VNC_PASSWORD_FILE, clean_password, 0o600)
        _store_x11vnc_password(clean_password)
        _write_file(
            VNC_BASIC_AUTH_FILE,
            f"{clean_username}:{auth_hash}\n",
            0o640,
            group=33,
        )
        _stop_existing_x11vnc()
        _start_x11vnc()
    return clean_username
