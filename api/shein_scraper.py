# shein_scraper.py
import os
import re
import json
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import time
import uuid
from functools import wraps
from pathlib import Path
from typing import Dict, Any, Optional, List

import anyio
from playwright.sync_api import sync_playwright, Page, TimeoutError

from gmail import get_latest_shein_code

PROFILES_DIR = os.getenv("SHEIN_PLAYWRIGHT_PROFILES_DIR", "profiles")
PLAYWRIGHT_BROWSER_CHANNEL = os.getenv("SHEIN_PLAYWRIGHT_CHANNEL", "chromium").strip() or None
DEFAULT_BASE_URL = os.getenv("SHEIN_BASE_URL", "https://ar.shein.com").strip().rstrip("/") or "https://ar.shein.com"
PROFILE_LOCK_TIMEOUT_SECONDS = float(os.getenv("SHEIN_PROFILE_LOCK_TIMEOUT_SECONDS", "5"))
MANUAL_LOGIN_TIMEOUT_SECONDS = max(60, int(os.getenv("SHEIN_MANUAL_LOGIN_TIMEOUT_SECONDS", "1800")))
MANUAL_BROWSER_MODE = os.getenv("SHEIN_MANUAL_BROWSER_MODE", "system").strip().lower()
MANUAL_BROWSER_EXECUTABLE = os.getenv("SHEIN_MANUAL_BROWSER_EXECUTABLE", "/usr/bin/google-chrome").strip()
# Chrome protects authenticated cookies against copying into another user-data
# directory. Keep syncing opt-in; a dedicated profile must be logged into once
# through normal Chrome, then Playwright can reuse that same directory.
AUTO_SYNC_CHROME_PROFILES = os.getenv("SHEIN_AUTO_SYNC_CHROME_PROFILES", "0").strip().lower() in ("1", "true", "yes")
# For actual Chrome profiles, use Chrome itself in headless dump-DOM mode.
# This keeps app-bound v20 SHEIN cookies in their original profile, where
# Chrome can decrypt them; no cookie is copied or exposed to the API process.
NORMAL_CHROME_PROFILE_ENABLED = os.getenv("SHEIN_NORMAL_CHROME_PROFILE", "1").strip().lower() in ("1", "true", "yes")
NORMAL_CHROME_TIMEOUT_SECONDS = int(os.getenv("SHEIN_NORMAL_CHROME_TIMEOUT_SECONDS", "75"))
_PROFILE_SYNC_LOCKS: dict[str, threading.Lock] = {}
_PROFILE_SYNC_LOCKS_GUARD = threading.Lock()
_PROFILE_RUNTIME_LOCKS: dict[str, threading.Lock] = {}
_PROFILE_RUNTIME_LOCKS_GUARD = threading.Lock()
_MANUAL_LOGIN_SESSIONS: dict[str, "ManualLoginSession"] = {}
_MANUAL_LOGIN_SESSIONS_GUARD = threading.Lock()


class ProfileBusyError(RuntimeError):
    """The selected browser profile is already being used by another job."""


class SessionExpiredError(RuntimeError):
    """The selected profile is no longer logged into SHEIN."""

    def __init__(self, profile_key: str):
        self.profile_key = profile_key
        super().__init__(f"SHEIN login required for profile {profile_key}.")


class ManualLoginSessionNotFoundError(RuntimeError):
    """A requested manual-login session does not exist."""


def normalize_profile_key(profile_key: str | None) -> str:
    value = (profile_key or "Default").strip()
    if not value:
        value = "Default"
    if value.lower() == "default":
        return "Default"
    if len(value) > 64 or value in {".", ".."} or "/" in value or "\\" in value:
        raise ValueError("Invalid profile_key")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._ -]*", value):
        raise ValueError("Invalid profile_key")
    return value


def _profile_sync_lock(profile_key: str) -> threading.Lock:
    with _PROFILE_SYNC_LOCKS_GUARD:
        return _PROFILE_SYNC_LOCKS.setdefault(profile_key, threading.Lock())


def _profile_runtime_lock(profile_key: str) -> threading.Lock:
    with _PROFILE_RUNTIME_LOCKS_GUARD:
        return _PROFILE_RUNTIME_LOCKS.setdefault(profile_key, threading.Lock())


class _ProfileRuntimeLock:
    def __init__(self, profile_key: str):
        self.profile_key = normalize_profile_key(profile_key)
        self.lock = _profile_runtime_lock(self.profile_key)
        self.acquired = False

    def __enter__(self):
        self.acquired = self.lock.acquire(timeout=PROFILE_LOCK_TIMEOUT_SECONDS)
        if not self.acquired:
            raise ProfileBusyError(
                f"Profile {self.profile_key} is busy. Try again after its current browser job finishes."
            )
        return self

    def __exit__(self, exc_type, exc, tb):
        if self.acquired:
            self.lock.release()


def _profile_runtime_locked(func):
    @wraps(func)
    def wrapped(profile_key, *args, **kwargs):
        with _ProfileRuntimeLock(profile_key):
            return func(profile_key, *args, **kwargs)

    return wrapped


class ManualLoginSession:
    """Keeps a visible persistent browser open while the user logs in remotely."""

    def __init__(self, profile_key: str, base_url: str):
        self.session_id = uuid.uuid4().hex
        self.profile_key = normalize_profile_key(profile_key)
        self.base_url = base_url.rstrip("/")
        self.status = "starting"
        self.error: Optional[str] = None
        self.page_url = ""
        self.started_at = time.time()
        self.finished_at: Optional[float] = None
        self._stop = threading.Event()
        self._done = threading.Event()
        self._runtime_lock = _profile_runtime_lock(self.profile_key)
        self._lock_acquired = False
        self._thread = threading.Thread(
            target=self._run,
            name=f"shein-manual-login-{self.profile_key}",
            daemon=True,
        )

    def start(self) -> None:
        if not self._runtime_lock.acquire(blocking=False):
            raise ProfileBusyError(
                f"Profile {self.profile_key} is busy. Finish its current browser job first."
            )
        self._lock_acquired = True
        self._thread.start()

    def _run(self) -> None:
        context = None
        browser_connection = None
        browser_process = None
        try:
            profile_path, chrome_profile_directory = _prepare_browser_profile(self.profile_key)
            self.status = "opening"

            # Google rejects OAuth from browsers exposing a remote-debugging
            # port.  The system Chrome path is intentionally completely
            # unmanaged while the user signs in; Finish performs verification
            # after Chrome has been closed.  The Playwright fallback remains
            # available for environments without system Chrome.
            if MANUAL_BROWSER_MODE == "system" and _manual_browser_path():
                browser_process = _launch_system_manual_browser(
                    profile_path,
                    chrome_profile_directory,
                    f"{self.base_url}/user/login",
                )
                self.status = "login_required"
                deadline = self.started_at + MANUAL_LOGIN_TIMEOUT_SECONDS
                while not self._stop.wait(0.5):
                    if time.time() >= deadline:
                        self.error = (
                            f"Manual login session expired after {MANUAL_LOGIN_TIMEOUT_SECONDS} seconds."
                        )
                        self.status = "expired"
                        break
                    if browser_process.poll() is not None:
                        self.error = "The remote login browser was closed."
                        self.status = "closed"
                        break
                return

            with sync_playwright() as playwright:
                context = _launch_shein_browser(
                    playwright,
                    profile_path,
                    headless=False,
                    chrome_profile_directory=chrome_profile_directory,
                    manual=True,
                )
                page = context.pages[0] if context.pages else context.new_page()
                page.goto(f"{self.base_url}/user/login", wait_until="domcontentloaded")
                self.status = "login_required"
                deadline = self.started_at + MANUAL_LOGIN_TIMEOUT_SECONDS

                while not self._stop.wait(0.5):
                    try:
                        if time.time() >= deadline:
                            self.error = (
                                f"Manual login session expired after {MANUAL_LOGIN_TIMEOUT_SECONDS} seconds."
                            )
                            self.status = "expired"
                            break
                        pages = [candidate for candidate in context.pages if not candidate.is_closed()]
                        if not pages:
                            self.error = "The remote login browser was closed."
                            self.status = "closed"
                            break
                        urls = [candidate.url for candidate in pages if candidate.url]
                        self.page_url = next(
                            (url for url in urls if DEFAULT_BASE_URL in url),
                            urls[0] if urls else "",
                        )
                        self.status = "logged_in" if _manual_pages_logged_in(urls, self.base_url) else "login_required"
                    except Exception as exc:
                        self.error = f"{type(exc).__name__}: {exc}"
                        self.status = "error"
                        break

                if self.status not in {"error", "closed"}:
                    self.status = "finished" if self.status == "logged_in" else "login_required"
        except Exception as exc:
            self.error = f"{type(exc).__name__}: {exc}"
            self.status = "error"
        finally:
            if context is not None:
                try:
                    context.close()
                except Exception:
                    pass
            if browser_connection is not None:
                try:
                    browser_connection.close()
                except Exception:
                    pass
            if browser_process is not None:
                try:
                    browser_process.terminate()
                    browser_process.wait(timeout=10)
                except Exception:
                    try:
                        browser_process.kill()
                    except Exception:
                        pass
            self.finished_at = time.time()
            if self._lock_acquired:
                self._runtime_lock.release()
                self._lock_acquired = False
            self._done.set()

    def stop(self, timeout: float = 30) -> dict[str, Any]:
        self._stop.set()
        self._done.wait(timeout=timeout)
        return self.snapshot()

    def snapshot(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "profile_key": self.profile_key,
            "status": self.status,
            "logged_in": self.status in {"logged_in", "finished"},
            "page_url": self.page_url,
            "error": self.error,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }

    def verify_saved_login(self) -> dict[str, Any]:
        """Verify the profile after normal Chrome has been closed."""
        if self.status in {"error", "expired"}:
            return self.snapshot()
        self.status = "checking"
        try:
            profile_path, chrome_profile_directory = _prepare_browser_profile(self.profile_key)
            logged_in = _verify_manual_profile(
                profile_path,
                chrome_profile_directory,
                self.base_url,
            )
            self.status = "finished" if logged_in else "login_required"
            if logged_in:
                self.error = None
            else:
                self.error = "SHEIN login was not detected. Complete the login, then press Finish again."
        except Exception as exc:
            self.status = "error"
            self.error = f"{type(exc).__name__}: {exc}"
        return self.snapshot()


def _get_manual_login_session(session_id: str) -> ManualLoginSession:
    with _MANUAL_LOGIN_SESSIONS_GUARD:
        session = _MANUAL_LOGIN_SESSIONS.get(session_id)
    if session is None:
        raise ManualLoginSessionNotFoundError("Manual login session not found or already expired.")
    return session


def start_manual_login(profile_key: str, base_url: str = DEFAULT_BASE_URL) -> dict[str, Any]:
    session = ManualLoginSession(profile_key, base_url)
    with _MANUAL_LOGIN_SESSIONS_GUARD:
        for active in _MANUAL_LOGIN_SESSIONS.values():
            if active.profile_key == session.profile_key and not active._done.is_set():
                raise ProfileBusyError(f"Profile {session.profile_key} already has a login session.")
        _MANUAL_LOGIN_SESSIONS[session.session_id] = session
    try:
        session.start()
    except Exception:
        with _MANUAL_LOGIN_SESSIONS_GUARD:
            _MANUAL_LOGIN_SESSIONS.pop(session.session_id, None)
        raise
    return session.snapshot()


def manual_login_status(session_id: str) -> dict[str, Any]:
    return _get_manual_login_session(session_id).snapshot()


def finish_manual_login(session_id: str) -> dict[str, Any]:
    session = _get_manual_login_session(session_id)
    session.stop()
    snapshot = session.verify_saved_login()
    with _MANUAL_LOGIN_SESSIONS_GUARD:
        _MANUAL_LOGIN_SESSIONS.pop(session_id, None)
    return snapshot


def cancel_manual_login(session_id: str) -> dict[str, Any]:
    session = _get_manual_login_session(session_id)
    snapshot = session.stop()
    with _MANUAL_LOGIN_SESSIONS_GUARD:
        _MANUAL_LOGIN_SESSIONS.pop(session_id, None)
    return snapshot


def list_profile_states() -> list[dict[str, Any]]:
    root = Path(PROFILES_DIR)
    profiles: dict[str, dict[str, Any]] = {}
    if root.is_dir():
        for child in root.iterdir():
            if child.is_dir():
                try:
                    key = normalize_profile_key(child.name)
                except ValueError:
                    continue
                profiles[key] = {
                    "profile_key": key,
                    "profile_exists": True,
                    "status": "saved_profile",
                    "session_active": False,
                }
    with _MANUAL_LOGIN_SESSIONS_GUARD:
        sessions = list(_MANUAL_LOGIN_SESSIONS.values())
    for session in sessions:
        current = profiles.setdefault(
            session.profile_key,
            {
                "profile_key": session.profile_key,
                "profile_exists": Path(PROFILES_DIR, session.profile_key).is_dir(),
            },
        )
        current.update(
            {
                "status": session.status,
                "session_active": not session._done.is_set(),
                "session_id": session.session_id,
                "logged_in": session.status in {"logged_in", "finished"},
            }
        )
    return sorted(profiles.values(), key=lambda item: item["profile_key"].lower())


def _chrome_user_data_dir() -> Path:
    configured = os.getenv("SHEIN_CHROME_USER_DATA_DIR", "").strip()
    if configured:
        return Path(configured)

    local_app_data = os.getenv("LOCALAPPDATA", "").strip()
    if not local_app_data:
        return Path()
    return Path(local_app_data) / "Google" / "Chrome" / "User Data"


def _is_chrome_profile_key(profile_key: str) -> bool:
    return profile_key == "Default" or bool(re.fullmatch(r"Profile \d+", profile_key))


def _source_chrome_profile(profile_key: str) -> Optional[tuple[Path, Path]]:
    if not AUTO_SYNC_CHROME_PROFILES or not _is_chrome_profile_key(profile_key):
        return None

    user_data_dir = _chrome_user_data_dir()
    source_profile = user_data_dir / profile_key
    if not user_data_dir.is_dir() or not source_profile.is_dir():
        return None
    return user_data_dir, source_profile


def _chrome_is_running() -> bool:
    if os.name != "nt":
        return False
    try:
        result = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq chrome.exe", "/NH"],
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return True
    return "chrome.exe" in result.stdout.lower()


def _chrome_executable() -> Optional[Path]:
    configured = os.getenv("SHEIN_CHROME_EXECUTABLE", "").strip()
    candidates = [Path(configured)] if configured else []
    for env_name in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
        base = os.getenv(env_name, "").strip()
        if base:
            candidates.append(Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe")
    return next((path for path in candidates if path.is_file()), None)


def _fetch_html_with_normal_chrome(profile_key: str, url: str) -> Optional[str]:
    """Load a page inside the selected real Chrome profile, without Playwright."""
    if (
        not NORMAL_CHROME_PROFILE_ENABLED
        or os.name != "nt"
        or not _is_chrome_profile_key(profile_key)
    ):
        return None
    if _chrome_is_running():
        raise RuntimeError(
            "Chrome must be closed before the API can use its selected normal profile."
        )

    chrome = _chrome_executable()
    user_data_dir = _chrome_user_data_dir()
    if chrome is None or not (user_data_dir / profile_key).is_dir():
        return None

    result = subprocess.run(
        [
            str(chrome),
            f"--user-data-dir={user_data_dir}",
            f"--profile-directory={profile_key}",
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--dump-dom",
            url,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
        timeout=NORMAL_CHROME_TIMEOUT_SECONDS,
    )
    html = result.stdout.decode("utf-8", errors="replace")
    if not html:
        raise RuntimeError(f"Normal Chrome did not return page HTML for {profile_key}.")
    if "continue-alias-input" in html:
        raise RuntimeError(f"The selected Chrome {profile_key} profile is not logged into SHEIN.")
    print(f"[NORMAL CHROME] Used the authenticated {profile_key} profile.")
    return html


def _cookie_db_path(profile_dir: Path) -> Optional[Path]:
    for candidate in (profile_dir / "Network" / "Cookies", profile_dir / "Cookies"):
        if candidate.is_file():
            return candidate
    return None


def _has_shein_cookie(profile_dir: Path) -> bool:
    cookie_db = _cookie_db_path(profile_dir)
    if cookie_db is None:
        return False

    try:
        connection = sqlite3.connect(f"{cookie_db.resolve().as_uri()}?mode=ro", uri=True)
        try:
            row = connection.execute(
                "SELECT 1 FROM cookies WHERE host_key LIKE ? LIMIT 1",
                ("%shein.com%",),
            ).fetchone()
            return row is not None
        finally:
            connection.close()
    except sqlite3.Error:
        return False


def _sync_fingerprint(user_data_dir: Path, profile_dir: Path) -> dict[str, int]:
    paths = [user_data_dir / "Local State", profile_dir / "Preferences"]
    cookie_db = _cookie_db_path(profile_dir)
    if cookie_db is not None:
        paths.append(cookie_db)

    fingerprint: dict[str, int] = {}
    for path in paths:
        if path.is_file():
            fingerprint[str(path.relative_to(user_data_dir))] = path.stat().st_mtime_ns
    return fingerprint


def _sync_marker_path(profile_path: Path) -> Path:
    return profile_path / ".shein-profile-sync.json"


def _read_sync_marker(profile_path: Path) -> dict[str, Any]:
    try:
        return json.loads(_sync_marker_path(profile_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _cached_chrome_profile_ready(profile_path: Path, profile_key: str) -> bool:
    return _cookie_db_path(profile_path / profile_key) is not None


def _safe_profile_name(profile_key: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", profile_key).strip("._") or "profile"


def _copy_chrome_profile(
    user_data_dir: Path,
    source_profile: Path,
    profile_key: str,
    profile_path: Path,
    fingerprint: dict[str, int],
) -> None:
    profile_root = profile_path.parent
    profile_root.mkdir(parents=True, exist_ok=True)
    stage_path = Path(tempfile.mkdtemp(prefix=f".{_safe_profile_name(profile_key)}-sync-", dir=profile_root))
    backup_path: Optional[Path] = None

    try:
        local_state = user_data_dir / "Local State"
        if not local_state.is_file():
            raise RuntimeError("Chrome Local State file was not found.")

        shutil.copy2(local_state, stage_path / "Local State")
        shutil.copytree(
            source_profile,
            stage_path / profile_key,
            ignore=shutil.ignore_patterns("Singleton*", "LOCK", "LOCKFILE"),
        )
        _sync_marker_path(stage_path).write_text(
            json.dumps(
                {
                    "profile_key": profile_key,
                    "source_fingerprint": fingerprint,
                    "synced_at": int(time.time()),
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        if profile_path.exists():
            backups_dir = profile_root / ".profile-backups"
            backups_dir.mkdir(exist_ok=True)
            backup_path = backups_dir / f"{_safe_profile_name(profile_key)}-{int(time.time())}"
            profile_path.replace(backup_path)

        stage_path.replace(profile_path)
    except Exception:
        if backup_path is not None and backup_path.exists() and not profile_path.exists():
            backup_path.replace(profile_path)
        raise
    finally:
        if stage_path.exists():
            shutil.rmtree(stage_path, ignore_errors=True)


def _prepare_browser_profile(profile_key: str) -> tuple[str, Optional[str]]:
    profile_key = normalize_profile_key(profile_key)
    profile_path = Path(PROFILES_DIR) / profile_key
    source = _source_chrome_profile(profile_key)

    if source is None:
        profile_path.mkdir(parents=True, exist_ok=True)
        return str(profile_path), None

    user_data_dir, source_profile = source
    with _profile_sync_lock(profile_key):
        cached_ready = _cached_chrome_profile_ready(profile_path, profile_key)

        if _chrome_is_running():
            if cached_ready:
                print(f"[PROFILE SYNC] Chrome is open; using cached {profile_key} session.")
                return str(profile_path), profile_key
            raise RuntimeError(
                f"Chrome is open and {profile_key} has not been synced yet. "
                "Close Chrome once to initialize the SHEIN session copy."
            )

        if not _has_shein_cookie(source_profile):
            if cached_ready:
                print(f"[PROFILE SYNC] No source SHEIN cookie found; using cached {profile_key} session.")
                return str(profile_path), profile_key
            raise RuntimeError(
                f"No SHEIN session cookie was found in Chrome {profile_key}. "
                "Sign in to SHEIN in that Chrome profile first."
            )

        fingerprint = _sync_fingerprint(user_data_dir, source_profile)
        marker = _read_sync_marker(profile_path)
        if not cached_ready or marker.get("source_fingerprint") != fingerprint:
            _copy_chrome_profile(user_data_dir, source_profile, profile_key, profile_path, fingerprint)
            print(f"[PROFILE SYNC] Synced SHEIN session from Chrome {profile_key}.")
        else:
            print(f"[PROFILE SYNC] Cached {profile_key} session is current.")

    return str(profile_path), profile_key


def _chrome_process_uses_profile(profile_path: Path) -> bool:
    """Return whether a live Chromium process owns this profile directory."""
    if os.name == "nt":
        return False
    target = str(profile_path.resolve())
    proc_root = Path("/proc")
    if not proc_root.is_dir():
        return False
    for proc_dir in proc_root.iterdir():
        if not proc_dir.name.isdigit():
            continue
        try:
            command_line = (proc_dir / "cmdline").read_bytes().replace(b"\x00", b" ").decode("utf-8", "ignore")
        except (OSError, UnicodeError):
            continue
        if "chrome" in command_line.lower() and f"--user-data-dir={target}" in command_line:
            return True
    return False


def _clear_stale_chrome_locks(profile_path: Path) -> None:
    """Remove Chromium singleton locks only after confirming no live owner."""
    if not profile_path.is_dir():
        return
    if _chrome_process_uses_profile(profile_path):
        raise ProfileBusyError(f"Profile {profile_path.name} is already open in Chromium.")
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        lock_path = profile_path / name
        if not (lock_path.exists() or lock_path.is_symlink()):
            continue
        try:
            lock_path.unlink()
            print(f"[PROFILE] Removed stale Chromium lock {lock_path}.")
        except OSError as exc:
            raise RuntimeError(f"Could not clear stale Chromium lock {lock_path}: {exc}") from exc


def _manual_browser_path() -> Optional[str]:
    candidates = [MANUAL_BROWSER_EXECUTABLE, "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"]
    for candidate in candidates:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return candidate
    return None


def _manual_pages_logged_in(urls: list[str], base_url: str) -> bool:
    base = base_url.rstrip("/").lower()
    for url in urls:
        normalized = url.lower()
        if normalized.startswith(base) and not any(marker in normalized for marker in ("/login", "/auth/")):
            return True
    return False


def _launch_system_manual_browser(
    profile_path: str,
    chrome_profile_directory: Optional[str],
    login_url: str,
):
    """Launch an unmanaged system Chrome window for the user's OAuth login."""
    _clear_stale_chrome_locks(Path(profile_path))
    args = [
        _manual_browser_path() or MANUAL_BROWSER_EXECUTABLE,
        f"--user-data-dir={Path(profile_path).resolve()}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-sandbox",
        "--password-store=basic",
        "--window-size=1280,800",
    ]
    if chrome_profile_directory:
        args.append(f"--profile-directory={chrome_profile_directory}")
    args.append(login_url)
    browser_process = subprocess.Popen(
        args,
        env={**os.environ, "DISPLAY": os.getenv("DISPLAY", ":99")},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1)
    if browser_process.poll() is not None:
        raise RuntimeError("The normal Chrome manual-login browser exited before it opened.")
    return browser_process


def _verify_manual_profile(
    profile_path: str,
    chrome_profile_directory: Optional[str],
    base_url: str,
) -> bool:
    """Check SHEIN login using normal Chrome after the interactive session ends."""
    executable = _manual_browser_path()
    if executable:
        _clear_stale_chrome_locks(Path(profile_path))
        args = [
            executable,
            f"--user-data-dir={Path(profile_path).resolve()}",
            "--headless=new",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--no-first-run",
            "--no-default-browser-check",
            "--password-store=basic",
            "--dump-dom",
            f"{base_url.rstrip('/')}/user/login",
        ]
        if chrome_profile_directory:
            args.insert(2, f"--profile-directory={chrome_profile_directory}")
        result = subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=NORMAL_CHROME_TIMEOUT_SECONDS,
            env={**os.environ, "DISPLAY": os.getenv("DISPLAY", ":99")},
        )
        html = result.stdout.decode("utf-8", errors="replace").lower()
        if not html:
            raise RuntimeError("Normal Chrome did not return the SHEIN login page.")
        return "continue-alias-input" not in html

    profile = Path(profile_path)
    with sync_playwright() as playwright:
        context = _launch_shein_browser(
            playwright,
            str(profile),
            headless=True,
            chrome_profile_directory=chrome_profile_directory,
        )
        try:
            page = context.pages[0] if context.pages else context.new_page()
            page.goto(f"{base_url.rstrip('/')}/user/login", wait_until="domcontentloaded")
            try:
                page.wait_for_load_state("load", timeout=10000)
            except TimeoutError:
                pass
            return _manual_pages_logged_in([page.url], base_url)
        finally:
            context.close()


def _launch_shein_browser(
    playwright,
    profile_path: str,
    headless: bool,
    chrome_profile_directory: Optional[str] = None,
    manual: bool = False,
):
    _clear_stale_chrome_locks(Path(profile_path))
    args = []
    if chrome_profile_directory:
        args.append(f"--profile-directory={chrome_profile_directory}")
    if os.name != "nt":
        for flag in ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]:
            if flag not in args:
                args.append(flag)

    launch_options = {
        "headless": headless,
        "locale": "ar",
        "viewport": {"width": 1280, "height": 800},
    }
    if PLAYWRIGHT_BROWSER_CHANNEL:
        launch_options["channel"] = PLAYWRIGHT_BROWSER_CHANNEL
    if manual:
        # Manual OAuth login runs in the visible VPS browser. Do not add
        # Playwright's automation banner to that session; scraping remains
        # unchanged and still uses the normal headless path.
        launch_options["ignore_default_args"] = ["--enable-automation"]
    if args:
        launch_options["args"] = args

    return playwright.chromium.launch_persistent_context(profile_path, **launch_options)


def _cookies_from_storage_state(storage_state: Any) -> list[dict[str, Any]]:
    """Accept the Playwright storage-state JSON already supported by the API."""
    if not storage_state:
        return []
    try:
        parsed = json.loads(storage_state) if isinstance(storage_state, str) else storage_state
    except json.JSONDecodeError:
        print("[SESSION] Ignoring invalid storage_state_json.")
        return []
    raw_cookies = parsed.get("cookies") if isinstance(parsed, dict) else None
    if not isinstance(raw_cookies, list):
        return []
    return [cookie for cookie in raw_cookies if isinstance(cookie, dict)]


def _session_cookies_for_profile(profile_key: str, storage_state: Any) -> list[dict[str, Any]]:
    return _cookies_from_storage_state(storage_state)


def _apply_shein_session(ctx, cookies: list[dict[str, Any]]) -> None:
    if cookies:
        ctx.add_cookies(cookies)


# =========================
# SSR extraction + parsing
# =========================
def _extract_ssr_block(html: str) -> Optional[str]:
    """
    Extract the JS object assigned to gbOrdersTrackSsrData.
    Most common:
      window.gbOrdersTrackSsrData = {...};
    """
    if not html:
        return None

    patterns = [
        r"window\.gbOrdersTrackSsrData\s*=\s*(\{.*?\})\s*;</script>",
        r"\bgbOrdersTrackSsrData\s*=\s*(\{.*?\})\s*;</script>",
        r"window\[['\"]gbOrdersTrackSsrData['\"]\]\s*=\s*(\{.*?\})\s*;</script>",
    ]

    for pat in patterns:
        m = re.search(pat, html, flags=re.DOTALL)
        if m:
            return m.group(1)

    # fallback: locate token then brace-scan from first "{"
    idx = html.find("gbOrdersTrackSsrData")
    if idx == -1:
        return None
    start = html.find("{", idx)
    if start == -1:
        return None

    depth = 0
    for i in range(start, len(html)):
        c = html[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return html[start : i + 1]
    return None


def _json_parse_ssr(ssr_text: str) -> Optional[dict]:
    """
    Best-effort parse. Often it's valid JSON.
    If it contains small JS quirks, apply safe fixes.
    """
    if not ssr_text:
        return None
    try:
        return json.loads(ssr_text)
    except Exception:
        pass

    fixed = ssr_text
    fixed = re.sub(r",\s*([}\]])", r"\1", fixed)  # trailing commas
    fixed = re.sub(r"\bundefined\b", "null", fixed)

    # Only attempt a quote swap if it looks safe-ish
    if "'" in fixed and '"' not in fixed:
        fixed = fixed.replace("'", '"')

    try:
        return json.loads(fixed)
    except Exception:
        return None


def _pull_pkg_from_json(ssr_json: dict) -> Optional[dict]:
    """
    Find a package/logistics dict that contains:
      track_num, carrier_name, logistics_tracks_list, track_url...
    """
    if not isinstance(ssr_json, dict):
        return None

    def deep_find(obj, depth=0):
        if depth > 7:
            return None
        if isinstance(obj, dict):
            if (
                "track_num" in obj
                or "logistics_tracks_list" in obj
                or "carrier_name" in obj
                or "track_url" in obj
            ):
                # ensure it looks like a logistics package
                if isinstance(obj.get("logistics_tracks_list", []), list) or "track_num" in obj:
                    return obj
            for v in obj.values():
                r = deep_find(v, depth + 1)
                if r:
                    return r
        elif isinstance(obj, list):
            for v in obj:
                r = deep_find(v, depth + 1)
                if r:
                    return r
        return None

    return deep_find(ssr_json)


def _regex_value(ssr_text: str, key: str) -> Optional[str]:
    if not ssr_text:
        return None
    m = re.search(rf'"{re.escape(key)}"\s*:\s*"([^"]+)"', ssr_text)
    return m.group(1) if m else None


def _regex_first_details(ssr_text: str) -> Optional[str]:
    if not ssr_text:
        return None
    m = re.search(r'"details"\s*:\s*"([^"]+)"', ssr_text)
    return m.group(1) if m else None


def _regex_first_timestamp(ssr_text: str) -> Optional[str]:
    if not ssr_text:
        return None
    m = re.search(r'"timestamp"\s*:\s*"([^"]+)"', ssr_text)
    return m.group(1) if m else None


def _clean_token(v: Any) -> str:
    s = str(v or "").strip()
    return s


def _detect_split_from_text(text: str) -> Optional[int]:
    if not text:
        return None
    low = text.lower()
    patterns = [
        r"(?:in|into)\s+(\d+)\s+(?:separate\s+)?(?:packages?|parcels?)",
        r"(\d+)\s+(?:separate\s+)?(?:packages?|parcels?)",
        r"(\d+)\s*(?:حزم|حزمة)",
        r"(\d+)\s*包裹",
    ]
    for pat in patterns:
        m = re.search(pat, low, flags=re.IGNORECASE)
        if m:
            try:
                n = int(m.group(1))
                if n >= 2:
                    return n
            except Exception:
                pass
    if any(k in low for k in ("separate packages", "split package", "split shipment", "حزم منفصلة", "包裹")):
        return 2
    return None


def _collect_split_info(ssr_json: Optional[dict], ssr_text: Optional[str], pkg: Optional[dict]) -> Dict[str, Any]:
    tracking_nos = set()
    package_refs = set()
    explicit_count = None

    if isinstance(pkg, dict):
        t = _clean_token(pkg.get("track_num"))
        if t:
            tracking_nos.add(t)
        p = _clean_token(pkg.get("package_no"))
        if p:
            package_refs.add(p)
        for e in pkg.get("logistics_tracks_list") or []:
            if isinstance(e, dict):
                n = _detect_split_from_text(str(e.get("details") or ""))
                if n and (explicit_count is None or n > explicit_count):
                    explicit_count = n

    def walk(obj, depth=0):
        nonlocal explicit_count
        if depth > 9:
            return
        if isinstance(obj, dict):
            if "shipping_no" in obj:
                t = _clean_token(obj.get("shipping_no"))
                if t:
                    tracking_nos.add(t)
            if "track_num" in obj:
                t = _clean_token(obj.get("track_num"))
                if t:
                    tracking_nos.add(t)
            if "package_no" in obj:
                p = _clean_token(obj.get("package_no"))
                if p:
                    package_refs.add(p)
            if "reference_number" in obj:
                p = _clean_token(obj.get("reference_number"))
                if p:
                    package_refs.add(p)
            if "details" in obj:
                n = _detect_split_from_text(str(obj.get("details") or ""))
                if n and (explicit_count is None or n > explicit_count):
                    explicit_count = n
            for v in obj.values():
                walk(v, depth + 1)
        elif isinstance(obj, list):
            for v in obj:
                walk(v, depth + 1)

    if isinstance(ssr_json, dict):
        walk(ssr_json)

    if ssr_text:
        n = _detect_split_from_text(ssr_text)
        if n and (explicit_count is None or n > explicit_count):
            explicit_count = n

    count_by_data = max(len(tracking_nos), len(package_refs))
    split_count = explicit_count or count_by_data
    is_split = bool(split_count and split_count >= 2)

    return {
        "is_split": is_split,
        "split_count": int(split_count if split_count else 0),
        "all_tracking_numbers": sorted(tracking_nos),
        "all_package_refs": sorted(package_refs),
    }


# =========================
# Weight sum helpers
# =========================
def _to_float(x) -> float:
    try:
        return float(x)
    except Exception:
        return 0.0


def _to_int(x) -> int:
    try:
        return int(float(x))
    except Exception:
        return 0


def _find_items_list(ssr_json: dict) -> List[dict]:
    """
    Items list location can vary. Try common paths, then a limited deep search.
    We want a list of dicts containing at least 'weight'/'quantity'.
    """
    if not isinstance(ssr_json, dict):
        return []

    paths = [
        ("data", "order_goods_list"),
        ("data", "orderGoodsList"),
        ("data", "goods_list"),
        ("data", "goodsList"),
        ("data", "order_detail", "order_goods_list"),
        ("data", "orderDetail", "orderGoodsList"),
        ("props", "pageProps", "data", "order_goods_list"),
        ("props", "pageProps", "data", "orderGoodsList"),
    ]

    def get_path(d, path):
        cur = d
        for k in path:
            if not isinstance(cur, dict) or k not in cur:
                return None
            cur = cur[k]
        return cur

    for path in paths:
        val = get_path(ssr_json, path)
        if isinstance(val, list) and val and isinstance(val[0], dict):
            if "weight" in val[0] or "quantity" in val[0]:
                return val

    def deep_find(obj, depth=0):
        if depth > 7:
            return None
        if isinstance(obj, dict):
            for v in obj.values():
                r = deep_find(v, depth + 1)
                if r is not None:
                    return r
        elif isinstance(obj, list):
            if obj and isinstance(obj[0], dict) and ("weight" in obj[0] or "quantity" in obj[0]):
                return obj
            for v in obj:
                r = deep_find(v, depth + 1)
                if r is not None:
                    return r
        return None

    found = deep_find(ssr_json)
    return found if isinstance(found, list) else []


def compute_total_weight(ssr_json: dict) -> Dict[str, Any]:
    """
    Sum total item weight = Σ(weight * quantity)
    Weight appears to be grams.
    """
    items = _find_items_list(ssr_json)
    total_g = 0.0
    counted = 0

    for it in items:
        if not isinstance(it, dict):
            continue
        w = _to_float(it.get("weight"))
        q = _to_int(it.get("quantity") or 1)
        if w <= 0 or q <= 0:
            continue
        total_g += w * q
        counted += 1

    total_g_int = int(round(total_g))
    return {
        "total_weight_g": total_g_int,
        "total_weight_kg": round(total_g_int / 1000.0, 3),
        "items_counted": counted,
    }


# =========================
# Delivery detection
# =========================
def _is_delivered_from_last_event(last: dict) -> bool:
    status = (last.get("status") or "").strip()
    mall_status = (last.get("mall_status") or "").strip()
    code = str(last.get("mall_status_code") or "").strip()
    detail_status = str(last.get("detail_status") or "").strip()
    details = (last.get("details") or "").strip()

    dlow = details.lower()
    slow = status.lower()

    return (
        detail_status == "7"
        and (
            code == "6"
            or "签收" in status
            or "签收" in mall_status
            or "delivered" in slow
            or "delivered" in dlow
            or "تم التسليم" in details
            or "تم تسليم" in details
            or "يتم تسليم طلبك" in details
        )
    )


# =========================
# Login (uses Gmail code)
# =========================
def ensure_logged_in(page: Page, base_url: str, acc: dict, fetch_url: Optional[str] = None) -> None:
    """
    Logs in. If verification dialog appears, reads code from Gmail and submits it.
    Uses persistent profile, so typically runs once per profile.
    """
    page.goto(f"{base_url}/user/login", wait_until="domcontentloaded")
    try:
        page.wait_for_load_state("load", timeout=30000)
    except TimeoutError:
        pass
    page.wait_for_timeout(1000)

    # If already logged in, /user/login often redirects away.
    if "login" not in page.url.lower():
        return

    if not (acc.get("shein_email") or "").strip() or not (acc.get("shein_password") or "").strip():
        raise SessionExpiredError(acc.get("profile_key") or "Default")

    # Step 1: email
    email_input = page.locator("input#continue-alias-input").first
    try:
        email_input.wait_for(state="visible", timeout=30000)
    except TimeoutError:
        # Render/headless can re-render the login form while the locator is already present.
        # If it is actually visible now, continue. Otherwise try a broader fallback selector.
        try:
            if not email_input.is_visible():
                email_input = page.locator(
                    'input#continue-alias-input, input[aria-label*="البريد"], input[type="text"]'
                ).first
                email_input.wait_for(state="visible", timeout=30000)
        except Exception:
            page.screenshot(path="debug_email_input_timeout.png", full_page=True)
            raise
    try:
        page.wait_for_load_state("load", timeout=10000)
    except TimeoutError:
        pass
    email_input.click()
    email_input.press("Control+A")
    email_input.type(acc["shein_email"], delay=40)

    # Ensure full email is set (some pages strip domain on fast fill)
    try:
        current_val = email_input.input_value()
        if current_val.strip() != acc["shein_email"]:
            page.evaluate(
                "(el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }",
                email_input,
                acc["shein_email"],
            )
    except Exception:
        pass

    cont = page.locator("button.page__login_mainButton:has-text('متابعة')").first
    if cont.count() == 0:
        cont = page.locator("button:has-text('متابعة')").first
    cont.wait_for(state="visible", timeout=10000)
    cont.click()
    try:
        if page.evaluate("() => navigator.webdriver === true"):
            os.makedirs("debug", exist_ok=True)
            page.screenshot(path=os.path.join("debug", "after_continue_headless.png"), full_page=True)
    except Exception:
        pass

    # Step 2: password
    password_input = page.locator(
        'input[type="password"], input[autocomplete="current-password"], input[name*="password"], input[id*="password"]'
    ).first
    try:
        password_input.wait_for(state="visible", timeout=8000)
    except TimeoutError:
        try:
            page.wait_for_function(
                """
                () => {
                    const hasPassword = !!document.querySelector(
                        'input[type="password"], input[autocomplete="current-password"], input[name*="password"], input[id*="password"]'
                    );
                    const hasRiskCode = !!document.querySelector('input.risk-dialog__Input');
                    const urlChanged = !location.href.toLowerCase().includes('/user/login');
                    return hasPassword || hasRiskCode || urlChanged;
                }
                """,
                timeout=7000,
            )
        except TimeoutError:
            try:
                cont.click(force=True)
            except Exception:
                pass
            page.wait_for_timeout(1500)
        password_input.wait_for(state="visible", timeout=30000)
    try:
        page.wait_for_load_state("load", timeout=10000)
    except TimeoutError:
        pass
    password_input.click()
    password_input.fill(acc["shein_password"])

    signin = page.locator("button.page__login_mainButton:has-text('تسجيل الدخول')").first
    if signin.count() == 0:
        signin = page.locator("button:has-text('تسجيل الدخول')").first
    signin.wait_for(state="visible", timeout=10000)
    signin.click()

    # Step 3: verification (if shown)
    try:
        code_input = page.locator("input.risk-dialog__Input").first
        code_input.wait_for(state="visible", timeout=12000)

        page.wait_for_timeout(4000)

        code = get_latest_shein_code(
            acc["gmail_email"],
            acc["gmail_app_password"],
            timeout_sec=180,
        )

        print("[GMAIL] SHEIN verification code received.")

        if not code:
            page.screenshot(path="debug_no_code_found.png", full_page=True)
            raise RuntimeError("Verification code not found. Saved debug_no_code_found.png")

        code_input.click()
        code_input.press("Control+A")
        code_input.type(code, delay=60)

        submit_btn = page.locator("button.risk-dialog__subtn:has-text('تقديم')").first
        submit_btn.wait_for(state="visible", timeout=10000)
        submit_btn.click()

        page.wait_for_timeout(6000)

    except TimeoutError:
        pass

    # Step 4: optional post-login popup (Skip)
    try:
        skip_btn = page.locator('[aria-label="تخطي"]').first
        if skip_btn.count() == 0:
            skip_btn = page.locator("button:has-text('تخطي')").first
        skip_btn.wait_for(state="visible", timeout=5000)
        skip_btn.click()
        page.wait_for_timeout(1000)
    except TimeoutError:
        pass
    except Exception:
        pass

    # confirm login by visiting fetch URL immediately when provided
    target_url = fetch_url or f"{base_url}/user/orders/list"
    page.goto(target_url, wait_until="domcontentloaded")
    page.wait_for_timeout(1000)


# =========================
# Tracking (SSR) — TRACK ONLY (NO WEIGHT)
# =========================
def fetch_one_order(page: Page, base_url: str, order_no: str) -> Dict[str, Any]:
    track_url = f"{base_url}/orders/track?billno={order_no}"
    page.goto(track_url, wait_until="domcontentloaded")
    page.wait_for_timeout(1200)

    print("[DEBUG] Track page final URL:", page.url)

    html = page.content()
    ssr_text = _extract_ssr_block(html)
    if not ssr_text:
        print(f"[DEBUG] SSR var not found for {order_no} → returning nulls")
        return {
            "carrier": None,
            "tracking_no": None,
            "status_text": None,
            "last_details": None,
            "last_timestamp": None,
            "delivered": False,
            "track_url": track_url,
            "_used": "ssr_missing",
        }

    ssr_json = _json_parse_ssr(ssr_text)
    if ssr_json:
        pkg = _pull_pkg_from_json(ssr_json)
        if pkg:
            carrier = pkg.get("carrier_name")
            tracking_no = pkg.get("track_num")
            carrier_track_url = pkg.get("track_url") or track_url
            tracks = pkg.get("logistics_tracks_list") or []
            split_info = _collect_split_info(ssr_json, ssr_text, pkg)

            def _ts(e: dict) -> int:
                try:
                    return int(str(e.get("timestamp") or "0").strip())
                except Exception:
                    return 0

            last = max(tracks, key=_ts) if tracks else {}
            status_text = last.get("details")
            last_timestamp = last.get("timestamp")
            delivered = _is_delivered_from_last_event(last) if last else False

            return {
                "carrier": carrier,
                "tracking_no": tracking_no,
                "status_text": status_text,
                "last_details": status_text,
                "last_timestamp": last_timestamp,
                "delivered": delivered,
                "track_url": carrier_track_url,
                "is_split": split_info["is_split"],
                "split_count": split_info["split_count"],
                "all_tracking_numbers": split_info["all_tracking_numbers"],
                "all_package_refs": split_info["all_package_refs"],
                "_used": "ssr_json",
            }

        split_info = _collect_split_info(ssr_json, ssr_text, None)
        return {
            "carrier": None,
            "tracking_no": None,
            "status_text": None,
            "last_details": None,
            "last_timestamp": None,
            "delivered": False,
            "track_url": track_url,
            "is_split": split_info["is_split"],
            "split_count": split_info["split_count"],
            "all_tracking_numbers": split_info["all_tracking_numbers"],
            "all_package_refs": split_info["all_package_refs"],
            "_used": "ssr_json_no_pkg",
        }

    # regex fallback
    carrier = _regex_value(ssr_text, "carrier_name")
    tracking_no = _regex_value(ssr_text, "track_num")
    status_text = _regex_first_details(ssr_text)
    last_timestamp = _regex_first_timestamp(ssr_text)

    delivered = False
    if status_text and (
        "签收" in status_text
        or "DELIVERED" in status_text.upper()
        or "تم التسليم" in status_text
        or "تم تسليم" in status_text
        or "يتم تسليم طلبك" in status_text
    ):
        delivered = True

    if not (carrier or tracking_no or status_text):
        split_info = _collect_split_info(None, ssr_text, None)
        return {
            "carrier": None,
            "tracking_no": None,
            "status_text": None,
            "last_details": None,
            "last_timestamp": None,
            "delivered": False,
            "track_url": track_url,
            "is_split": split_info["is_split"],
            "split_count": split_info["split_count"],
            "all_tracking_numbers": split_info["all_tracking_numbers"],
            "all_package_refs": split_info["all_package_refs"],
            "_used": "ssr_regex_failed",
        }

    split_info = _collect_split_info(None, ssr_text, None)
    return {
        "carrier": carrier,
        "tracking_no": tracking_no,
        "status_text": status_text,
        "last_details": status_text,
        "last_timestamp": last_timestamp,
        "delivered": delivered,
        "track_url": track_url,
        "is_split": split_info["is_split"],
        "split_count": split_info["split_count"],
        "all_tracking_numbers": split_info["all_tracking_numbers"],
        "all_package_refs": split_info["all_package_refs"],
        "_used": "ssr_regex",
    }


# =========================
# Weight-only fetch (SSR) — WEIGHT ONLY
# =========================
def fetch_one_order_weight(page: Page, base_url: str, order_no: str) -> Dict[str, Any]:
    track_url = f"{base_url}/orders/track?billno={order_no}"
    page.goto(track_url, wait_until="domcontentloaded")
    page.wait_for_timeout(1200)

    html = page.content()
    ssr_text = _extract_ssr_block(html)
    if not ssr_text:
        return {
            "order_no": order_no,
            "total_weight_g": None,
            "total_weight_kg": None,
            "items_counted": None,
            "is_split": False,
            "split_count": 0,
            "all_tracking_numbers": [],
            "all_package_refs": [],
            "_used": "ssr_missing",
        }

    ssr_json = _json_parse_ssr(ssr_text)
    if not ssr_json:
        split_info = _collect_split_info(None, ssr_text, None)
        return {
            "order_no": order_no,
            "total_weight_g": None,
            "total_weight_kg": None,
            "items_counted": None,
            "is_split": split_info["is_split"],
            "split_count": split_info["split_count"],
            "all_tracking_numbers": split_info["all_tracking_numbers"],
            "all_package_refs": split_info["all_package_refs"],
            "_used": "ssr_json_parse_failed",
        }

    weights = compute_total_weight(ssr_json)
    split_info = _collect_split_info(ssr_json, ssr_text, _pull_pkg_from_json(ssr_json))
    return {
        "order_no": order_no,
        "total_weight_g": weights["total_weight_g"],
        "total_weight_kg": weights["total_weight_kg"],
        "items_counted": weights["items_counted"],
        "is_split": split_info["is_split"],
        "split_count": split_info["split_count"],
        "all_tracking_numbers": split_info["all_tracking_numbers"],
        "all_package_refs": split_info["all_package_refs"],
        "_used": "ssr_weight",
    }


class _DumpedHtmlPage:
    """Small Page-compatible adapter for Chrome's --dump-dom output."""

    def __init__(self, url: str, html: str):
        self.url = url
        self._html = html

    def goto(self, url: str, **_kwargs) -> None:
        self.url = url

    def wait_for_timeout(self, _milliseconds: int) -> None:
        return

    def content(self) -> str:
        return self._html


@_profile_runtime_locked
def _fetch_weight_sync(
    profile_key: str,
    storage_state: Any,
    shein_email: str,
    shein_password: str,
    gmail_email: str,
    gmail_app_password: str,
    order_no: str,
    base_url: str,
    headless: bool,
) -> Dict[str, Any]:
    target_track_url = f"{base_url}/orders/track?billno={order_no}"
    normal_chrome_html = _fetch_html_with_normal_chrome(profile_key, target_track_url)
    if normal_chrome_html is not None:
        result = fetch_one_order_weight(_DumpedHtmlPage(target_track_url, normal_chrome_html), base_url, order_no)
        result["_used"] = f"normal_chrome_profile_{result.get('_used', 'ssr_weight')}"
        return result

    profile_path, chrome_profile_directory = _prepare_browser_profile(profile_key)
    session_cookies = _session_cookies_for_profile(profile_key, storage_state)

    acc = {
        "shein_email": shein_email,
        "shein_password": shein_password,
        "gmail_email": gmail_email,
        "gmail_app_password": gmail_app_password,
        "profile_key": profile_key,
    }
    target_track_url = f"{base_url}/orders/track?billno={order_no}"

    with sync_playwright() as p:
        print(
            f"[PLAYWRIGHT] weight profile={profile_path} "
            f"headless={headless} order_no={order_no}"
        )
        ctx = _launch_shein_browser(p, profile_path, headless, chrome_profile_directory)
        try:
            _apply_shein_session(ctx, session_cookies)
            page = ctx.new_page()
            ensure_logged_in(page, base_url, acc, fetch_url=target_track_url)
            return fetch_one_order_weight(page, base_url, order_no)
        finally:
            ctx.close()


async def fetch_weight_for_order(
    storage_state,
    shein_email,
    shein_password,
    gmail_email,
    gmail_app_password,
    order_no,
    profile_key="default",
    base_url=DEFAULT_BASE_URL,
    headless=False,
) -> Dict[str, Any]:
    return await anyio.to_thread.run_sync(
        _fetch_weight_sync,
        profile_key,
        storage_state,
        shein_email,
        shein_password,
        gmail_email,
        gmail_app_password,
        order_no,
        base_url,
        headless,
    )


# =========================
# Runner (persistent profile) — TRACK ONLY
# =========================
@_profile_runtime_locked
def _fetch_tracking_sync(
    profile_key: str,
    storage_state: Any,
    shein_email: str,
    shein_password: str,
    gmail_email: str,
    gmail_app_password: str,
    order_no: str,
    base_url: str,
    headless: bool,
) -> Dict[str, Any]:
    target_track_url = f"{base_url}/orders/track?billno={order_no}"
    normal_chrome_html = _fetch_html_with_normal_chrome(profile_key, target_track_url)
    if normal_chrome_html is not None:
        result = fetch_one_order(_DumpedHtmlPage(target_track_url, normal_chrome_html), base_url, order_no)
        result["_used"] = f"normal_chrome_profile_{result.get('_used', 'ssr_json')}"
        return result

    profile_path, chrome_profile_directory = _prepare_browser_profile(profile_key)
    session_cookies = _session_cookies_for_profile(profile_key, storage_state)

    acc = {
        "shein_email": shein_email,
        "shein_password": shein_password,
        "gmail_email": gmail_email,
        "gmail_app_password": gmail_app_password,
        "profile_key": profile_key,
    }
    target_track_url = f"{base_url}/orders/track?billno={order_no}"

    with sync_playwright() as p:
        print(
            f"[PLAYWRIGHT] track profile={profile_path} "
            f"headless={headless} order_no={order_no}"
        )
        ctx = _launch_shein_browser(p, profile_path, headless, chrome_profile_directory)
        try:
            _apply_shein_session(ctx, session_cookies)
            page = ctx.new_page()
            ensure_logged_in(page, base_url, acc, fetch_url=target_track_url)
            info = fetch_one_order(page, base_url, order_no)

            # exact keys app.py expects (TRACK ONLY)
            return {
                "carrier": info.get("carrier"),
                "tracking_no": info.get("tracking_no"),
                "status_text": info.get("status_text"),
                "last_details": info.get("last_details"),
                "last_timestamp": info.get("last_timestamp"),
                "delivered": bool(info.get("delivered")),
                "track_url": info.get("track_url"),
                "is_split": bool(info.get("is_split")),
                "split_count": int(info.get("split_count") or 0),
                "all_tracking_numbers": info.get("all_tracking_numbers") or [],
                "all_package_refs": info.get("all_package_refs") or [],
                "_used": info.get("_used") or "sync_playwright_persistent_profile",
            }
        finally:
            ctx.close()


# =========================
# Async wrapper (FastAPI) — TRACK ONLY
# =========================
async def fetch_tracking_for_order(
    storage_state,
    shein_email,
    shein_password,
    gmail_email,
    gmail_app_password,
    order_no,
    profile_key="default",
    base_url=DEFAULT_BASE_URL,
    headless=False,
) -> Dict[str, Any]:
    return await anyio.to_thread.run_sync(
        _fetch_tracking_sync,
        profile_key,
        storage_state,
        shein_email,
        shein_password,
        gmail_email,
        gmail_app_password,
        order_no,
        base_url,
        headless,
    )
