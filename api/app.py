# app.py
####
import os
import traceback
import anyio
from pathlib import Path
from typing import Any
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from db import SessionLocal, engine, Base
from models import User, Order
from crypto import encrypt_str, decrypt_str
from shein_scraper import (
    ManualLoginSessionNotFoundError,
    ProfileBusyError,
    SessionExpiredError,
    cancel_manual_login,
    finish_manual_login,
    fetch_tracking_for_order,
    fetch_weight_for_order,
    list_profile_states,
    manual_login_status,
    normalize_profile_key,
    start_manual_login,
)

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

APP_SECRET = os.getenv("APP_SECRET")
if not APP_SECRET or len(APP_SECRET.strip()) < 32:
    raise RuntimeError("APP_SECRET must be configured with at least 32 characters")
INTERNAL_API_TOKEN = os.getenv("SHEIN_LOCAL_API_TOKEN") or os.getenv("INTERNAL_API_TOKEN")
if not INTERNAL_API_TOKEN or len(INTERNAL_API_TOKEN.strip()) < 32:
    raise RuntimeError("SHEIN_LOCAL_API_TOKEN must be configured with at least 32 characters")

# Headless is the safe default for a VPS. Manual login uses a separate visible
# browser session started through the protected profile-login endpoints.
PLAYWRIGHT_HEADLESS = os.getenv("PLAYWRIGHT_HEADLESS", "1").strip().lower() in ("1", "true", "yes")
print(
    f"[STARTUP] SHEIN Python API pid={os.getpid()} "
    f"PLAYWRIGHT_HEADLESS={PLAYWRIGHT_HEADLESS} raw={os.getenv('PLAYWRIGHT_HEADLESS')!r}"
)

app = FastAPI(title="SHEIN Tracker API")


@app.middleware("http")
async def protect_api_routes(request, call_next):
    if request.url.path.startswith("/api/") and request.headers.get("x-internal-token") != INTERNAL_API_TOKEN:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Invalid internal API token"})
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/ping")
def ping():
    return {"ok": True, "msg": "pong"}

DB_AVAILABLE = True
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    DB_AVAILABLE = False
    print(f"[WARN] DB unavailable at startup: {type(e).__name__}: {e}")


def require_db():
    if not DB_AVAILABLE:
        raise HTTPException(503, "Persistence database is unavailable")


def require_internal_token(x_internal_token: str | None = Header(default=None)):
    if not x_internal_token or x_internal_token != INTERNAL_API_TOKEN:
        raise HTTPException(401, "Invalid internal API token")


def _profile_http_exception(exc: Exception, profile_key: str | None = None) -> HTTPException:
    if isinstance(exc, SessionExpiredError):
        return HTTPException(
            status_code=409,
            detail={
                "code": "SESSION_EXPIRED",
                "error": str(exc),
                "login_required": True,
                "profile_key": exc.profile_key,
            },
        )
    if isinstance(exc, ProfileBusyError):
        return HTTPException(
            status_code=409,
            detail={
                "code": "PROFILE_BUSY",
                "error": str(exc),
                "profile_key": profile_key,
            },
        )
    if isinstance(exc, ManualLoginSessionNotFoundError):
        return HTTPException(
            status_code=404,
            detail={"code": "LOGIN_SESSION_NOT_FOUND", "error": str(exc)},
        )
    if isinstance(exc, ValueError):
        return HTTPException(
            status_code=400,
            detail={"code": "INVALID_PROFILE", "error": str(exc)},
        )
    return HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


def _scrape_error_payload(exc: Exception, profile_key: str | None = None) -> dict[str, Any]:
    if isinstance(exc, SessionExpiredError):
        return {
            "error": str(exc),
            "code": "SESSION_EXPIRED",
            "login_required": True,
            "profile_key": exc.profile_key,
        }
    if isinstance(exc, ProfileBusyError):
        return {
            "error": str(exc),
            "code": "PROFILE_BUSY",
            "profile_key": profile_key,
        }
    return {"error": f"{type(exc).__name__}: {exc}"}


# =========================
# Request models
# =========================
class RegisterReq(BaseModel):
    email: str
    owner_user_id: int | None = None
    gmail_email: str
    gmail_app_password: str
    shein_email: str
    shein_password: str


class AddOrderReq(BaseModel):
    email: str
    owner_user_id: int | None = None
    order_no: str


class EmailReq(BaseModel):
    email: str


class TrackOneReq(BaseModel):
    email: str
    order_no: str


class WeightOneReq(BaseModel):
    email: str
    order_no: str


class WeightBatchReq(BaseModel):
    email: str
    # optional: only compute weights for not-delivered orders
    only_pending: bool = False


class UserListItem(BaseModel):
    email: str


class UserDetailReq(BaseModel):
    email: str
    owner_user_id: int | None = None


class DirectScrapeReq(BaseModel):
    order_no: str
    shein_email: str = ""
    shein_password: str = ""
    gmail_email: str = ""
    gmail_app_password: str = ""
    profile_key: str = "default"
    storage_state_json: str | None = None


class DirectScrapeBatchReq(BaseModel):
    order_nos: list[str]
    shein_email: str = ""
    shein_password: str = ""
    gmail_email: str = ""
    gmail_app_password: str = ""
    profile_key: str = "default"
    storage_state_json: str | None = None


class ProfileLoginStartReq(BaseModel):
    profile_key: str = "Default"


class ProfileLoginFinishReq(BaseModel):
    session_id: str
    profile_key: str | None = None


# ============================================================
# VPS profile management / manual login
# ============================================================

@app.get("/api/profiles", dependencies=[Depends(require_internal_token)])
def profiles():
    return {"ok": True, "profiles": list_profile_states()}


@app.post("/api/profiles/login/start", dependencies=[Depends(require_internal_token)])
def start_profile_login(req: ProfileLoginStartReq):
    try:
        profile_key = normalize_profile_key(req.profile_key)
        return {
            "ok": True,
            "remote_browser_required": True,
            "message": "Open the VPS browser, finish SHEIN login, then call the status endpoint.",
            "login": start_manual_login(profile_key),
        }
    except Exception as exc:
        raise _profile_http_exception(exc, req.profile_key)


@app.get("/api/profiles/login/{session_id}", dependencies=[Depends(require_internal_token)])
def profile_login_status(session_id: str):
    try:
        return {"ok": True, "login": manual_login_status(session_id)}
    except Exception as exc:
        raise _profile_http_exception(exc)


@app.post("/api/profiles/login/finish", dependencies=[Depends(require_internal_token)])
async def finish_profile_login(req: ProfileLoginFinishReq):
    try:
        if req.profile_key:
            expected_profile_key = normalize_profile_key(req.profile_key)
        else:
            expected_profile_key = None
        if expected_profile_key:
            current = await anyio.to_thread.run_sync(manual_login_status, req.session_id)
            if current.get("profile_key") != expected_profile_key:
                raise ValueError("Profile session mismatch")
        login = await anyio.to_thread.run_sync(finish_manual_login, req.session_id)
        return {
            "ok": True,
            "message": "Browser session closed and profile saved.",
            "login": login,
        }
    except Exception as exc:
        raise _profile_http_exception(exc, req.profile_key)


@app.delete("/api/profiles/login/{session_id}", dependencies=[Depends(require_internal_token)])
async def cancel_profile_login(session_id: str):
    try:
        login = await anyio.to_thread.run_sync(cancel_manual_login, session_id)
        return {"ok": True, "message": "Manual login session closed.", "login": login}
    except Exception as exc:
        raise _profile_http_exception(exc)


# =========================
# Helpers
# =========================
def _load_user_and_creds(db, email: str):
    u = db.query(User).filter(User.email == email).first()
    if not u:
        raise HTTPException(404, "User not found. Register first.")

    if not u.shein_email or not u.shein_password_enc:
        raise HTTPException(400, "Missing SHEIN credentials. Register again.")

    if not u.gmail_email or not u.gmail_app_password_enc:
        raise HTTPException(400, "Missing Gmail credentials. Register again.")

    def _normalize_email(val: str) -> str:
        v = (val or "").strip().lower()
        if "@" in v:
            local, domain = v.split("@", 1)
            if local and domain and "." not in domain:
                v = f"{local}@{domain}.com"
        return v

    try:
        shein_email = _normalize_email(u.shein_email)
        shein_password = decrypt_str(APP_SECRET, u.shein_password_enc)
        gmail_email = _normalize_email(u.gmail_email)
        gmail_app_password = decrypt_str(APP_SECRET, u.gmail_app_password_enc)
    except Exception as e:
        raise HTTPException(400, f"Failed to decrypt credentials: {type(e).__name__}")

    profile_key = f"user_{u.id}"  # one persistent profile per user
    return u, profile_key, shein_email, shein_password, gmail_email, gmail_app_password


def _require_order_belongs_to_user(db, user_id: int, order_no: str) -> Order:
    o = db.query(Order).filter(Order.user_id == user_id, Order.order_no == order_no).first()
    if not o:
        raise HTTPException(404, "Order not found for this user. Add it first.")
    return o


# =========================
# Auth + orders
# =========================
@app.post("/api/register", dependencies=[Depends(require_db)])
def register_user(req: RegisterReq):
    db = SessionLocal()
    try:
        def _normalize_email(val: str) -> str:
            v = (val or "").strip().lower()
            if "@" in v:
                local, domain = v.split("@", 1)
                if local and domain and "." not in domain:
                    v = f"{local}@{domain}.com"
            return v

        req.email = (req.email or "").strip().lower()
        req.gmail_email = _normalize_email(req.gmail_email)
        req.shein_email = _normalize_email(req.shein_email)
        req.gmail_app_password = (req.gmail_app_password or "").replace(" ", "")

        q = db.query(User).filter(User.email == req.email)
        if req.owner_user_id is not None:
            q = q.filter(User.owner_user_id == req.owner_user_id)
        u = q.first()
        if u:
            u.owner_user_id = req.owner_user_id
            u.gmail_email = req.gmail_email
            u.gmail_app_password_enc = encrypt_str(APP_SECRET, req.gmail_app_password)
            u.shein_email = req.shein_email
            u.shein_password_enc = encrypt_str(APP_SECRET, req.shein_password)
            db.commit()
            return {"ok": True, "message": "Updated credentials."}

        u = User(
            owner_user_id=req.owner_user_id,
            email=req.email,
            gmail_email=req.gmail_email,
            gmail_app_password_enc=encrypt_str(APP_SECRET, req.gmail_app_password),
            shein_email=req.shein_email,
            shein_password_enc=encrypt_str(APP_SECRET, req.shein_password),
        )
        db.add(u)
        db.commit()
        return {"ok": True, "message": "Registered."}
    finally:
        db.close()


@app.post("/api/orders", dependencies=[Depends(require_db)])
def add_order(req: AddOrderReq):
    db = SessionLocal()
    try:
        q = db.query(User).filter(User.email == req.email)
        if req.owner_user_id is not None:
            q = q.filter(User.owner_user_id == req.owner_user_id)
        u = q.first()
        if not u:
            raise HTTPException(404, "User not found. Register first.")

        existing = db.query(Order).filter(Order.user_id == u.id, Order.order_no == req.order_no).first()
        if existing:
            return {"ok": True, "message": "Order already exists."}

        o = Order(user_id=u.id, order_no=req.order_no)
        db.add(o)
        db.commit()
        return {"ok": True, "message": "Order added."}
    finally:
        db.close()


@app.get("/api/orders", dependencies=[Depends(require_db)])
def list_orders(email: str, owner_user_id: int | None = None):
    db = SessionLocal()
    try:
        q = db.query(User).filter(User.email == email)
        if owner_user_id is not None:
            q = q.filter(User.owner_user_id == owner_user_id)
        u = q.first()
        if not u:
            raise HTTPException(404, "User not found.")

        orders = db.query(Order).filter(Order.user_id == u.id).all()
        return {
            "ok": True,
            "orders": [
                {
                    "order_no": o.order_no,
                    "carrier": o.carrier,
                    "tracking_no": o.tracking_no,
                    "status_text": o.status_text,
                    "delivered": bool(o.delivered),
                    "last_details": o.last_details,
                    "last_timestamp": o.last_timestamp,
                }
                for o in orders
            ],
        }
    finally:
        db.close()


@app.get("/api/users", dependencies=[Depends(require_db)])
def list_users(email: str | None = None, owner_user_id: int | None = None):
    db = SessionLocal()
    try:
        q = db.query(User)
        if email:
            q = q.filter(User.email == email)
        if owner_user_id is not None:
            q = q.filter(User.owner_user_id == owner_user_id)
        users = q.all()
        return {
            "ok": True,
            "users": [{"email": u.email} for u in users],
        }
    finally:
        db.close()


@app.delete("/api/users", dependencies=[Depends(require_db)])
def delete_user(email: str, owner_user_id: int | None = None):
    db = SessionLocal()
    try:
        q = db.query(User).filter(User.email == email)
        if owner_user_id is not None:
            q = q.filter(User.owner_user_id == owner_user_id)
        u = q.first()
        if not u:
            raise HTTPException(404, "User not found.")
        db.delete(u)
        db.commit()
        return {"ok": True, "message": "User deleted."}
    finally:
        db.close()


@app.get("/api/users/detail", dependencies=[Depends(require_db)])
def user_detail(email: str, owner_user_id: int | None = None):
    db = SessionLocal()
    try:
        q = db.query(User).filter(User.email == email)
        if owner_user_id is not None:
            q = q.filter(User.owner_user_id == owner_user_id)
        u = q.first()
        if not u:
            raise HTTPException(404, "User not found.")

        return {
            "ok": True,
            "user": {
                "email": u.email,
                "owner_user_id": u.owner_user_id,
                "gmail_email": u.gmail_email,
                "gmail_app_password": decrypt_str(APP_SECRET, u.gmail_app_password_enc),
                "shein_email": u.shein_email,
                "shein_password": decrypt_str(APP_SECRET, u.shein_password_enc),
            },
        }
    finally:
        db.close()


# ============================================================
# TRACKING SCRAPE API (SEPARATE)
# ============================================================

@app.post("/api/track/one", dependencies=[Depends(require_db)])
async def scrape_track_one(req: TrackOneReq):
    """
    Scrape tracking for ONE order and return it (doesn't modify DB).
    """
    db = SessionLocal()
    try:
        u, profile_key, shein_email, shein_password, gmail_email, gmail_app_password = (
            _load_user_and_creds(db, req.email)
        )

        _require_order_belongs_to_user(db, u.id, req.order_no)

        result = await fetch_tracking_for_order(
            storage_state=None,
            shein_email=shein_email,
            shein_password=shein_password,
            gmail_email=gmail_email,
            gmail_app_password=gmail_app_password,
            order_no=req.order_no,
            profile_key=profile_key,
            headless=PLAYWRIGHT_HEADLESS,
        )

        # TRACK-ONLY response
        return {
            "ok": True,
            "order_no": req.order_no,
            "carrier": result.get("carrier"),
            "tracking_no": result.get("tracking_no"),
            "status_text": result.get("status_text"),
            "last_details": result.get("last_details"),
            "last_timestamp": result.get("last_timestamp"),
            "delivered": bool(result.get("delivered")),
            "track_url": result.get("track_url"),
            "is_split": bool(result.get("is_split")),
            "split_count": int(result.get("split_count") or 0),
            "all_tracking_numbers": result.get("all_tracking_numbers") or [],
            "all_package_refs": result.get("all_package_refs") or [],
            "_used": result.get("_used"),
        }
    except HTTPException:
        raise
    except Exception as e:
        if isinstance(e, (SessionExpiredError, ProfileBusyError)):
            raise _profile_http_exception(e, profile_key)
        print(
            f"[ERROR] /api/track/one email={req.email} order_no={req.order_no}: "
            f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        )
        raise HTTPException(500, f"{type(e).__name__}: {e}")
    finally:
        db.close()


@app.post("/api/track/refresh", dependencies=[Depends(require_db)])
async def refresh_not_delivered(req: EmailReq):
    """
    Refresh tracking for ALL not delivered orders, and SAVE results into DB.
    """
    print("Starting tracking refresh for:", req.email)

    db = SessionLocal()
    try:
        u, profile_key, shein_email, shein_password, gmail_email, gmail_app_password = (
            _load_user_and_creds(db, req.email)
        )

        pending = db.query(Order).filter(Order.user_id == u.id, Order.delivered == False).all()

        updated = []
        for o in pending:
            try:
                print("Refreshing order:", o.order_no)

                result = await fetch_tracking_for_order(
                    storage_state=None,
                    shein_email=shein_email,
                    shein_password=shein_password,
                    gmail_email=gmail_email,
                    gmail_app_password=gmail_app_password,
                    order_no=o.order_no,
                    profile_key=profile_key,
                    headless=PLAYWRIGHT_HEADLESS,
                )

                # save TRACKING ONLY
                o.carrier = result.get("carrier")
                o.tracking_no = result.get("tracking_no")
                o.status_text = result.get("status_text")
                o.last_details = result.get("last_details")
                o.last_timestamp = result.get("last_timestamp")
                o.delivered = bool(result.get("delivered"))

                db.flush()
                db.commit()
                db.refresh(o)

                updated.append(
                    {
                        "order_no": o.order_no,
                        "carrier": o.carrier,
                        "tracking_no": o.tracking_no,
                        "status_text": o.status_text,
                        "delivered": bool(o.delivered),
                        "track_url": result.get("track_url"),
                        "is_split": bool(result.get("is_split")),
                        "split_count": int(result.get("split_count") or 0),
                        "all_tracking_numbers": result.get("all_tracking_numbers") or [],
                        "all_package_refs": result.get("all_package_refs") or [],
                        "_used": result.get("_used"),
                    }
                )

            except Exception as e:
                db.rollback()
                updated.append({"order_no": o.order_no, **_scrape_error_payload(e, profile_key), "_used": "exception"})

        return {"ok": True, "updated": updated, "count": len(updated)}
    finally:
        db.close()


# ============================================================
# WEIGHT SCRAPE API (SEPARATE)
# ============================================================

@app.post("/api/weight/one", dependencies=[Depends(require_db)])
async def scrape_weight_one(req: WeightOneReq):
    """
    Scrape WEIGHT for ONE order and return it (doesn't modify DB).
    """
    db = SessionLocal()
    try:
        u, profile_key, shein_email, shein_password, gmail_email, gmail_app_password = (
            _load_user_and_creds(db, req.email)
        )

        _require_order_belongs_to_user(db, u.id, req.order_no)

        result = await fetch_weight_for_order(
            storage_state=None,
            shein_email=shein_email,
            shein_password=shein_password,
            gmail_email=gmail_email,
            gmail_app_password=gmail_app_password,
            order_no=req.order_no,
            profile_key=profile_key,
            headless=PLAYWRIGHT_HEADLESS,
        )

        # WEIGHT-ONLY response
        return {
            "ok": True,
            "order_no": req.order_no,
            "total_weight_g": result.get("total_weight_g"),
            "total_weight_kg": result.get("total_weight_kg"),
            "items_counted": result.get("items_counted"),
            "is_split": bool(result.get("is_split")),
            "split_count": int(result.get("split_count") or 0),
            "all_tracking_numbers": result.get("all_tracking_numbers") or [],
            "all_package_refs": result.get("all_package_refs") or [],
            "_used": result.get("_used"),
        }
    except HTTPException:
        raise
    except Exception as e:
        if isinstance(e, (SessionExpiredError, ProfileBusyError)):
            raise _profile_http_exception(e, profile_key)
        print(
            f"[ERROR] /api/weight/one email={req.email} order_no={req.order_no}: "
            f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        )
        raise HTTPException(500, f"{type(e).__name__}: {e}")
    finally:
        db.close()


@app.post("/api/weight/batch", dependencies=[Depends(require_db)])
async def scrape_weight_batch(req: WeightBatchReq):
    """
    Scrape weights for MANY orders (returns list).
    By default: all orders for user.
    If only_pending=True: only orders where delivered=False.
    """
    db = SessionLocal()
    try:
        u, profile_key, shein_email, shein_password, gmail_email, gmail_app_password = (
            _load_user_and_creds(db, req.email)
        )

        q = db.query(Order).filter(Order.user_id == u.id)
        if req.only_pending:
            q = q.filter(Order.delivered == False)

        orders = q.all()
        results = []

        for o in orders:
            try:
                r = await fetch_weight_for_order(
                    storage_state=None,
                    shein_email=shein_email,
                    shein_password=shein_password,
                    gmail_email=gmail_email,
                    gmail_app_password=gmail_app_password,
                    order_no=o.order_no,
                    profile_key=profile_key,
                    headless=PLAYWRIGHT_HEADLESS,
                )
                results.append(
                    {
                        "order_no": o.order_no,
                        "total_weight_g": r.get("total_weight_g"),
                        "total_weight_kg": r.get("total_weight_kg"),
                        "items_counted": r.get("items_counted"),
                        "is_split": bool(r.get("is_split")),
                        "split_count": int(r.get("split_count") or 0),
                        "all_tracking_numbers": r.get("all_tracking_numbers") or [],
                        "all_package_refs": r.get("all_package_refs") or [],
                        "_used": r.get("_used"),
                    }
                )
            except Exception as e:
                results.append({"order_no": o.order_no, **_scrape_error_payload(e, profile_key), "_used": "exception"})

        return {"ok": True, "results": results, "count": len(results)}
    finally:
        db.close()


# ============================================================
# DIRECT (STATELESS) SCRAPE API (NO DB LOOKUPS)
# ============================================================

@app.post("/api/direct/track_one", dependencies=[Depends(require_internal_token)])
async def direct_track_one(req: DirectScrapeReq):
    try:
        result = await fetch_tracking_for_order(
            storage_state=req.storage_state_json,
            shein_email=req.shein_email.strip(),
            shein_password=req.shein_password,
            gmail_email=req.gmail_email.strip(),
            gmail_app_password=req.gmail_app_password.replace(" ", ""),
            order_no=req.order_no.strip(),
            profile_key=(req.profile_key or "default").strip(),
            headless=PLAYWRIGHT_HEADLESS,
        )
        return {
            "ok": True,
            "order_no": req.order_no,
            "carrier": result.get("carrier"),
            "tracking_no": result.get("tracking_no"),
            "status_text": result.get("status_text"),
            "last_details": result.get("last_details"),
            "last_timestamp": result.get("last_timestamp"),
            "delivered": bool(result.get("delivered")),
            "track_url": result.get("track_url"),
            "is_split": bool(result.get("is_split")),
            "split_count": int(result.get("split_count") or 0),
            "all_tracking_numbers": result.get("all_tracking_numbers") or [],
            "all_package_refs": result.get("all_package_refs") or [],
            "_used": result.get("_used"),
        }
    except Exception as e:
        if isinstance(e, (SessionExpiredError, ProfileBusyError)):
            raise _profile_http_exception(e, req.profile_key)
        print(
            f"[ERROR] /api/direct/track_one order_no={req.order_no}: "
            f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        )
        raise HTTPException(500, f"{type(e).__name__}: {e}")


@app.post("/api/direct/weight_one", dependencies=[Depends(require_internal_token)])
async def direct_weight_one(req: DirectScrapeReq):
    try:
        result = await fetch_weight_for_order(
            storage_state=req.storage_state_json,
            shein_email=req.shein_email.strip(),
            shein_password=req.shein_password,
            gmail_email=req.gmail_email.strip(),
            gmail_app_password=req.gmail_app_password.replace(" ", ""),
            order_no=req.order_no.strip(),
            profile_key=(req.profile_key or "default").strip(),
            headless=PLAYWRIGHT_HEADLESS,
        )
        return {
            "ok": True,
            "order_no": req.order_no,
            "total_weight_g": result.get("total_weight_g"),
            "total_weight_kg": result.get("total_weight_kg"),
            "items_counted": result.get("items_counted"),
            "is_split": bool(result.get("is_split")),
            "split_count": int(result.get("split_count") or 0),
            "all_tracking_numbers": result.get("all_tracking_numbers") or [],
            "all_package_refs": result.get("all_package_refs") or [],
            "_used": result.get("_used"),
        }
    except Exception as e:
        if isinstance(e, (SessionExpiredError, ProfileBusyError)):
            raise _profile_http_exception(e, req.profile_key)
        print(
            f"[ERROR] /api/direct/weight_one order_no={req.order_no}: "
            f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        )
        raise HTTPException(500, f"{type(e).__name__}: {e}")


@app.post("/api/direct/weight_many", dependencies=[Depends(require_internal_token)])
async def direct_weight_many(req: DirectScrapeBatchReq):
    try:
        order_nos = []
        seen = set()
        for raw in req.order_nos or []:
            ono = str(raw or "").strip()
            if not ono or ono in seen:
                continue
            seen.add(ono)
            order_nos.append(ono)

        if not order_nos:
            raise HTTPException(400, "order_nos is required")

        storage_state = req.storage_state_json
        results = []
        for order_no in order_nos:
            try:
                result = await fetch_weight_for_order(
                    storage_state=storage_state,
                    shein_email=req.shein_email.strip(),
                    shein_password=req.shein_password,
                    gmail_email=req.gmail_email.strip(),
                    gmail_app_password=req.gmail_app_password.replace(" ", ""),
                    order_no=order_no,
                    profile_key=(req.profile_key or "default").strip(),
                    headless=PLAYWRIGHT_HEADLESS,
                )
                storage_state = result.get("_storage_state") or storage_state
                results.append(
                    {
                        "ok": True,
                        "order_no": order_no,
                        "total_weight_g": result.get("total_weight_g"),
                        "total_weight_kg": result.get("total_weight_kg"),
                        "items_counted": result.get("items_counted"),
                        "is_split": bool(result.get("is_split")),
                        "split_count": int(result.get("split_count") or 0),
                        "all_tracking_numbers": result.get("all_tracking_numbers") or [],
                        "all_package_refs": result.get("all_package_refs") or [],
                        "_used": result.get("_used"),
                    }
                )
            except Exception as e:
                results.append(
                    {
                        "ok": False,
                        "order_no": order_no,
                        **_scrape_error_payload(e, req.profile_key),
                    }
                )

        return {"ok": True, "count": len(results), "results": results, "storage_state_json": storage_state}
    except HTTPException:
        raise
    except Exception as e:
        print(
            f"[ERROR] /api/direct/weight_many count={len(req.order_nos or [])}: "
            f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        )
        raise HTTPException(500, f"{type(e).__name__}: {e}")
