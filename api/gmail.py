# gmail.py
from __future__ import annotations

import email
import html
import imaplib
import re
import time
from email.header import decode_header
from email.message import Message

SHEIN_FROM_HINTS = (
    "shein",
    "sheinnotice.com",
    "noreply@sheinnotice.com",
    "notice@sheinemail.com",
    "notice@shein.com",
)

KEYWORDS = [
    "code",
    "verify",
    "verification",
    "security code",
    "verification code",
    "enter the following",
    "\u0631\u0645\u0632",
    "\u0627\u0644\u062a\u062d\u0642\u0642",
    "\u0631\u0645\u0632 \u0627\u0644\u062a\u062d\u0642\u0642",
    "\u0644\u0644\u0623\u0645\u0627\u0646",
]


def _decode_header_value(value: str) -> str:
    if not value:
        return ""

    decoded = []
    for part, encoding in decode_header(value):
        if isinstance(part, bytes):
            decoded.append(_decode_bytes(part, encoding))
        else:
            decoded.append(part)
    return "".join(decoded)


def _decode_bytes(payload: bytes, encoding: str | None = None) -> str:
    encodings = []
    if encoding:
        encodings.append(encoding)
    encodings.extend(["utf-8", "windows-1256", "iso-8859-1"])

    for candidate in encodings:
        try:
            return payload.decode(candidate)
        except (LookupError, UnicodeDecodeError):
            continue

    return payload.decode("utf-8", errors="ignore")


def _strip_html_tags(value: str) -> str:
    value = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", value)
    value = re.sub(r"(?s)<[^>]+>", " ", value)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def _decode_part(part: Message) -> str:
    payload = part.get_payload(decode=True)
    if payload is None:
        raw = part.get_payload()
        if isinstance(raw, str):
            text = raw
        elif isinstance(raw, list):
            text = "\n".join(_decode_part(item) for item in raw)
        else:
            text = ""
    else:
        text = _decode_bytes(payload, part.get_content_charset())

    if (part.get_content_type() or "").lower() == "text/html":
        return _strip_html_tags(text)
    return text


def _extract_text(msg: Message) -> str:
    parts: list[str] = []

    if msg.is_multipart():
        for part in msg.walk():
            ctype = (part.get_content_type() or "").lower()
            disp = str(part.get("Content-Disposition") or "").lower()
            if "attachment" in disp:
                continue
            if ctype in ("text/plain", "text/html"):
                text = _decode_part(part)
                if text:
                    parts.append(text)
    else:
        text = _decode_part(msg)
        if text:
            parts.append(text)

    return "\n".join(parts)


def _is_junk_code(code: str) -> bool:
    return len(set(code)) == 1


def _pick_best_code(body: str) -> str | None:
    matches = list(re.finditer(r"\b(\d{5,8})\b", body))
    if not matches:
        return None

    lower = body.lower()
    best = None
    best_score = -1

    for match in matches:
        code = match.group(1)
        if _is_junk_code(code):
            continue

        start = max(0, match.start() - 120)
        end = min(len(lower), match.end() + 120)
        window = lower[start:end]

        score = 0
        if len(code) == 6:
            score += 2
        elif len(code) == 5:
            score += 1

        for keyword in KEYWORDS:
            if keyword.lower() in window:
                score += 10

        if score > best_score:
            best_score = score
            best = code

    if best:
        return best

    for match in reversed(matches):
        code = match.group(1)
        if not _is_junk_code(code):
            return code

    return None


def _looks_like_shein_message(from_hdr: str, subj: str, body: str) -> bool:
    from_hdr = from_hdr.lower()
    subj = subj.lower()
    body = body.lower()

    if any(hint in from_hdr for hint in SHEIN_FROM_HINTS):
        return True

    if "shein" in subj or "shein" in body:
        return True

    verification_hints = [
        "verification",
        "security code",
        "\u0631\u0645\u0632",
        "\u0627\u0644\u062a\u062d\u0642\u0642",
    ]
    return any(hint in subj for hint in verification_hints)


def _safe_logout(mail: imaplib.IMAP4_SSL) -> None:
    try:
        mail.logout()
    except Exception:
        pass


def get_latest_shein_code(
    gmail_email: str, gmail_app_password: str, timeout_sec: int = 180
) -> str | None:
    """
    Poll Gmail inbox for the latest SHEIN verification email and return its code.
    Requires a Gmail App Password.
    """
    start = time.time()
    print(f"[DEBUG] Polling Gmail for SHEIN code: {gmail_email}")

    while time.time() - start < timeout_sec:
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        try:
            mail.login(gmail_email, gmail_app_password)
            mail.select("INBOX")

            status, messages = mail.search(None, "UNSEEN")
            if status != "OK" or not messages or not messages[0]:
                status, messages = mail.search(None, "ALL")

            if status == "OK" and messages and messages[0]:
                ids = messages[0].split()
                candidate_ids = list(reversed(ids[-60:]))
                print(f"[DEBUG] Gmail candidate messages: {len(candidate_ids)}")

                for msg_id in candidate_ids:
                    status, data = mail.fetch(msg_id, "(RFC822)")
                    if status != "OK" or not data or not data[0]:
                        continue

                    raw_message = data[0][1]
                    if not isinstance(raw_message, bytes):
                        continue

                    msg = email.message_from_bytes(raw_message)
                    from_hdr = _decode_header_value(msg.get("From", ""))
                    subj = _decode_header_value(msg.get("Subject", ""))
                    body = _extract_text(msg)

                    if not _looks_like_shein_message(from_hdr, subj, body):
                        continue

                    code = _pick_best_code(body)
                    if code:
                        _safe_logout(mail)
                        return code

        except imaplib.IMAP4.error as exc:
            _safe_logout(mail)
            raise RuntimeError(
                "Gmail IMAP login failed. Check Gmail address/app password and make sure IMAP is enabled."
            ) from exc
        except Exception as exc:
            print(f"[DEBUG] Gmail polling error: {type(exc).__name__}: {exc}")
        finally:
            _safe_logout(mail)

        time.sleep(5)

    return None
