# app.py
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import SessionLocal, engine, Base
from models import User, Order
from crypto import encrypt_str, decrypt_str
from shein_scraper import fetch_tracking_for_order, fetch_weight_for_order

load_dotenv()

APP_SECRET = os.getenv("APP_SECRET")
if not APP_SECRET:
    raise RuntimeError("APP_SECRET missing in .env")

app = FastAPI(title="SHEIN Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/ping")
def ping():
    return {"ok": True, "msg": "pong"}

Base.metadata.create_all(bind=engine)


# =========================
# Request models
# =========================
class RegisterReq(BaseModel):
    email: str
    gmail_email: str
    gmail_app_password: str
    shein_email: str
    shein_password: str


class AddOrderReq(BaseModel):
    email: str
    order_no: str


class RefreshReq(BaseModel):
    email: str


class WeightReq(BaseModel):
    email: str
    order_no: str


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

    try:
        shein_email = u.shein_email
        shein_password = decrypt_str(APP_SECRET, u.shein_password_enc)
        gmail_email = u.gmail_email
        gmail_app_password = decrypt_str(APP_SECRET, u.gmail_app_password_enc)
    except Exception as e:
        raise HTTPException(400, f"Failed to decrypt credentials: {type(e).__name__}")

    profile_key = f"user_{u.id}"  # one persistent profile per user
    return u, profile_key, shein_email, shein_password, gmail_email, gmail_app_password


# =========================
# Auth + orders
# =========================
@app.post("/api/register")
def register_user(req: RegisterReq):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == req.email).first()
        if u:
            u.gmail_email = req.gmail_email
            u.gmail_app_password_enc = encrypt_str(APP_SECRET, req.gmail_app_password)
            u.shein_email = req.shein_email
            u.shein_password_enc = encrypt_str(APP_SECRET, req.shein_password)
            db.commit()
            return {"ok": True, "message": "Updated credentials."}

        u = User(
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


@app.post("/api/orders")
def add_order(req: AddOrderReq):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == req.email).first()
        if not u:
            raise HTTPException(404, "User not found. Register first.")

        existing = (
            db.query(Order)
            .filter(Order.user_id == u.id, Order.order_no == req.order_no)
            .first()
        )
        if existing:
            return {"ok": True, "message": "Order already exists."}

        o = Order(user_id=u.id, order_no=req.order_no)
        db.add(o)
        db.commit()
        return {"ok": True, "message": "Order added."}
    finally:
        db.close()


@app.get("/api/orders")
def list_orders(email: str):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
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


# =========================
# Tracking API (refresh)
# =========================
@app.post("/api/refresh")
async def refresh_not_delivered(req: RefreshReq):
    print("Starting refresh for:", req.email)

    db = SessionLocal()
    try:
        u, profile_key, shein_email, shein_password, gmail_email, gmail_app_password = (
            _load_user_and_creds(db, req.email)
        )

        storage_state = None

        pending = (
            db.query(Order)
            .filter(Order.user_id == u.id, Order.delivered == False)
            .all()
        )

        updated = []

        for o in pending:
            try:
                print("Refreshing order:", o.order_no)

                result = await fetch_tracking_for_order(
                    storage_state,
                    shein_email,
                    shein_password,
                    gmail_email,
                    gmail_app_password,
                    o.order_no,
                    profile_key=profile_key,
                    headless=True,  # set False once if captcha/manual login needed
                )

                print("Scraper result:", result)

                # tracking-only fields saved in DB
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
                        "_used": result.get("_used"),
                        "track_url": result.get("track_url"),
                    }
                )

            except Exception as e:
                db.rollback()
                updated.append(
                    {
                        "order_no": o.order_no,
                        "error": f"{type(e).__name__}: {str(e)}",
                        "_used": "exception",
                    }
                )

        return {"ok": True, "updated": updated, "count": len(updated)}
    finally:
        db.close()


# =========================
# Weight API (separate)
# =========================
@app.post("/api/weight")
async def get_order_weight(req: WeightReq):
    db = SessionLocal()
    try:
        u, profile_key, shein_email, shein_password, gmail_email, gmail_app_password = (
            _load_user_and_creds(db, req.email)
        )

        # Optional: verify order belongs to user (nice safety)
        o = (
            db.query(Order)
            .filter(Order.user_id == u.id, Order.order_no == req.order_no)
            .first()
        )
        if not o:
            raise HTTPException(404, "Order not found for this user. Add it first.")

        result = await fetch_weight_for_order(
            storage_state=None,
            shein_email=shein_email,
            shein_password=shein_password,
            gmail_email=gmail_email,
            gmail_app_password=gmail_app_password,
            order_no=req.order_no,
            profile_key=profile_key,
            headless=True,
        )

        return {
            "ok": True,
            "order_no": req.order_no,
            "total_weight_g": result.get("total_weight_g"),
            "total_weight_kg": result.get("total_weight_kg"),
            "items_counted": result.get("items_counted"),
            "_used": result.get("_used"),
        }
    finally:
        db.close()
