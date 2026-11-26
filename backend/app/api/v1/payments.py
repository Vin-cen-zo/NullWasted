import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import logging
import random
from typing import Any, Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import case, or_, update
from sqlmodel import Session, select

from app.core.clock import WIB_TZ, get_effective_now_utc
from app.core.config import get_midtrans_config
from app.core.database import get_session
from app.core.security import require_consumer_user
from app.models.listing import ItemListing, OrderTicket, utc_now_iso
from app.schemas.listing import PaymentStatusResponse, QrisCreateRequest, QrisCreateResponse

logger = logging.getLogger("nullwasted.payments")
router = APIRouter(prefix="/payments", tags=["payments"])


def _rollback_ticket_stock(session: Session, ticket: OrderTicket) -> None:
    """Atomically restores stock for all items on a cancelled/expired PENDING ticket (Guardrail #4 & #5)."""
    now_utc = get_effective_now_utc()
    targets: list[tuple[str, int]] = []
    if ticket.items_json:
        try:
            parsed = json.loads(ticket.items_json)
            if isinstance(parsed, list):
                for entry in parsed:
                    lid = entry.get("listing_id")
                    qty_val = int(entry.get("quantity", 0))
                    if lid and qty_val > 0:
                        targets.append((str(lid), qty_val))
        except Exception:
            targets = []
    if not targets:
        targets = [(ticket.listing_id, ticket.quantity)]

    for lid, qty_val in sorted(targets, key=lambda x: x[0]):
        session.execute(
            update(ItemListing)
            .where(
                ItemListing.id == lid,
                or_(ItemListing.expires_at.is_(None), ItemListing.expires_at > now_utc),
            )
            .values(quantity=ItemListing.quantity + qty_val, is_active=True)
        )


def sync_pending_qris_expiry(session: Session, tickets: list[OrderTicket]) -> bool:
    """Guardrail #5: Lazily cancels PENDING Midtrans QRIS tickets past payment_expires_at and restores stock."""
    now_utc = get_effective_now_utc()
    changed = False
    for ticket in tickets:
        if (
            ticket.status == "RESERVED"
            and ticket.payment_status == "PENDING"
            and ticket.payment_expires_at is not None
        ):
            p_exp = (
                ticket.payment_expires_at
                if ticket.payment_expires_at.tzinfo
                else ticket.payment_expires_at.replace(tzinfo=timezone.utc)
            )
            if p_exp <= now_utc:
                res = session.execute(
                    update(OrderTicket)
                    .where(
                        OrderTicket.id == ticket.id,
                        OrderTicket.status == "RESERVED",
                        OrderTicket.payment_status == "PENDING",
                    )
                    .values(status="CANCELLED", cancelled_at=utc_now_iso())
                )
                if res.rowcount > 0:
                    _rollback_ticket_stock(session, ticket)
                    changed = True
    if changed:
        session.commit()
        for ticket in tickets:
            session.refresh(ticket)
    return changed


@router.get("/qris/config")
def get_qris_config() -> dict[str, Any]:
    """Reports whether Midtrans QRIS Sandbox/Production is configured on this server."""
    cfg = get_midtrans_config()
    if not cfg:
        return {"qris_enabled": False, "mode": "disabled", "simulator_url": None}
    return {
        "qris_enabled": True,
        "mode": "production" if cfg["is_production"] else "sandbox",
        "simulator_url": cfg["simulator_url"],
    }


@router.post("/qris/create", response_model=QrisCreateResponse)
async def create_qris_payment(
    payload: QrisCreateRequest,
    session: Session = Depends(get_session),
    user_claims: dict[str, Any] = Depends(require_consumer_user),
) -> QrisCreateResponse:
    """Reserves stock atomically and creates a real Midtrans Core API QRIS charge (PENDING, 15-min expiry)."""
    cfg = get_midtrans_config()
    if not cfg:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pembayaran QRIS Sandbox belum dikonfigurasi (MIDTRANS_SERVER_KEY kosong). Silakan gunakan Tunai di Kasir.",
        )

    # Normalize single-item or cart items
    qty_by_id: dict[str, int] = {}
    if payload.items:
        for entry in payload.items:
            lid = entry.listing_id.strip()
            if lid:
                qty_by_id[lid] = qty_by_id.get(lid, 0) + entry.quantity
    elif payload.listing_id:
        qty_by_id[payload.listing_id.strip()] = payload.quantity

    if not qty_by_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item pesanan wajib diisi.")

    sorted_ids = sorted(qty_by_id.keys())
    now_utc = get_effective_now_utc()

    listings_by_id: dict[str, ItemListing] = {}
    store_ids: set[str] = set()
    for lid in sorted_ids:
        item = session.get(ItemListing, lid)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Listing {lid} tidak ditemukan.")
        if item.expires_at is not None:
            exp_dt = item.expires_at if item.expires_at.tzinfo else item.expires_at.replace(tzinfo=timezone.utc)
            if exp_dt <= now_utc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Listing '{item.food_name}' sudah kedaluwarsa.",
                )
        listings_by_id[lid] = item
        store_ids.add(item.store_id)

    if len(store_ids) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pembayaran QRIS hanya mendukung item dari 1 gerai yang sama.",
        )

    # Atomic stock decrement
    for lid in sorted_ids:
        req_qty = qty_by_id[lid]
        res = session.execute(
            update(ItemListing)
            .where(
                ItemListing.id == lid,
                ItemListing.quantity >= req_qty,
                ItemListing.is_active == True,
                or_(ItemListing.expires_at.is_(None), ItemListing.expires_at > now_utc),
            )
            .values(
                quantity=ItemListing.quantity - req_qty,
                is_active=case((ItemListing.quantity - req_qty <= 0, False), else_=True),
            )
        )
        if res.rowcount == 0:
            session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Stok '{listings_by_id[lid].food_name}' tidak mencukupi.",
            )

    order_code = ""
    for _ in range(30):
        candidate = f"#NW-{random.randint(1000, 9999)}"
        if not session.exec(select(OrderTicket).where(OrderTicket.order_code == candidate)).first():
            order_code = candidate
            break
    if not order_code:
        order_code = f"#NW-{random.randint(100000, 999999)}"

    cart_items_payload = []
    candidate_expiries: list[datetime] = []
    total_qty = 0
    total_price = 0
    for lid in sorted_ids:
        item = listings_by_id[lid]
        req_qty = qty_by_id[lid]
        subtotal = item.discounted_price * req_qty
        total_qty += req_qty
        total_price += subtotal
        cart_items_payload.append({
            "listing_id": item.id,
            "food_name": item.food_name,
            "quantity": req_qty,
            "unit_price": item.discounted_price,
            "subtotal": subtotal,
        })
        if item.expires_at is not None:
            exp_utc = item.expires_at if item.expires_at.tzinfo else item.expires_at.replace(tzinfo=timezone.utc)
            candidate_expiries.append(exp_utc)
        else:
            candidate_expiries.append(now_utc + timedelta(minutes=max(1, item.minutes_until_closing)))

    first_item = listings_by_id[sorted_ids[0]]
    ticket_expires_at = min(candidate_expiries)
    payment_expires_at = now_utc + timedelta(minutes=15)
    exp_wib = ticket_expires_at.astimezone(WIB_TZ)
    pickup_deadline = f"Sebelum pukul {exp_wib.strftime('%H:%M')} WIB"
    summary_food_name = (
        first_item.food_name
        if len(cart_items_payload) == 1
        else f"{first_item.food_name} + {len(cart_items_payload) - 1} menu lainnya"
    )
    customer = payload.customer_name.strip() or "Konsumen NullWasted"
    phone = payload.customer_phone.strip() or ""
    qr_payload = f"NULLWASTED|ORDER:{order_code}|STORE:{first_item.store_id}|QTY:{total_qty}|USER:{customer}"

    # Call Midtrans Core API Sandbox / Production
    midtrans_order_id = f"NW-{order_code.replace('#NW-', '')}-{random.randint(100, 999)}"
    auth_raw = base64.b64encode(f"{cfg['server_key']}:".encode("utf-8")).decode("utf-8")
    charge_body = {
        "payment_type": "qris",
        "transaction_details": {
            "order_id": midtrans_order_id,
            "gross_amount": total_price,
        },
        "custom_expiry": {
            "expiry_duration": 15,
            "unit": "minute",
        },
        "customer_details": {
            "first_name": customer[:50],
            "phone": phone[:20],
        },
    }

    qris_url: Optional[str] = None
    qris_string: Optional[str] = None
    midtrans_tx_id: Optional[str] = None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            mt_res = await client.post(
                f"{cfg['base_url']}/v2/charge",
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": f"Basic {auth_raw}",
                },
                json=charge_body,
            )
            mt_data = mt_res.json()
    except Exception as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gagal menghubungi gateway Midtrans QRIS: {exc}",
        )

    if mt_res.status_code >= 400 or str(mt_data.get("status_code", "")) not in {"200", "201"}:
        session.rollback()
        err_msg = mt_data.get("status_message") or "Midtrans menolak permintaan QRIS."
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=err_msg)

    midtrans_tx_id = mt_data.get("transaction_id") or midtrans_order_id
    qris_string = mt_data.get("qr_string")
    for act in mt_data.get("actions") or []:
        if act.get("name") in {"generate-qr-code", "generate-qr-code-v2"} and act.get("url"):
            qris_url = act["url"]
            break

    ticket = OrderTicket(
        id=midtrans_order_id,
        order_code=order_code,
        store_id=first_item.store_id,
        user_id=user_claims.get("sub"),
        customer_name=customer,
        customer_phone=phone,
        listing_id=first_item.id,
        items_json=json.dumps(cart_items_payload, ensure_ascii=False),
        food_name=summary_food_name,
        store_name=first_item.store_name,
        location_badge=first_item.location_badge,
        image_url=first_item.image_url,
        quantity=total_qty,
        unit_price=max(1, total_price // max(1, total_qty)),
        total_price=total_price,
        pickup_deadline=pickup_deadline,
        expires_at=ticket_expires_at,
        qr_payload=qr_payload,
        payment_method="MIDTRANS_QRIS",
        payment_status="PENDING",
        payment_expires_at=payment_expires_at,
        midtrans_transaction_id=midtrans_tx_id,
        qris_url=qris_url,
        qris_string=qris_string,
        status="RESERVED",
    )

    session.add(ticket)
    session.commit()
    session.refresh(ticket)

    return QrisCreateResponse(
        ticket=ticket,
        qris_url=qris_url,
        qris_string=qris_string,
        midtrans_transaction_id=midtrans_tx_id,
        payment_expires_at=payment_expires_at.isoformat(),
        simulator_url=cfg["simulator_url"],
    )


@router.post("/midtrans-webhook")
async def midtrans_webhook(
    request: Request,
    session: Session = Depends(get_session),
) -> dict[str, str]:
    """Verifies Midtrans SHA-512 webhook signature and transitions payment_status PENDING -> PAID or CANCELLED."""
    cfg = get_midtrans_config()
    if not cfg:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Midtrans tidak dikonfigurasi.")

    body = await request.json()
    order_id = str(body.get("order_id", "")).strip()
    status_code = str(body.get("status_code", "")).strip()
    gross_amount = str(body.get("gross_amount", "")).strip()
    signature_key = str(body.get("signature_key", "")).strip().lower()
    tx_status = str(body.get("transaction_status", "")).strip().lower()

    expected_sig = hashlib.sha512(
        f"{order_id}{status_code}{gross_amount}{cfg['server_key']}".encode("utf-8")
    ).hexdigest().lower()
    if not signature_key or not hmac.compare_digest(expected_sig, signature_key):
        logger.warning(
            "Midtrans webhook signature mismatch: order_id=%s status_code=%s gross_amount=%s tx_status=%s expected_prefix=%s received_prefix=%s",
            order_id,
            status_code,
            gross_amount,
            tx_status,
            expected_sig[:8],
            signature_key[:8],
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Midtrans signature key.")

    ticket = session.get(OrderTicket, order_id)
    if not ticket:
        ticket = session.exec(
            select(OrderTicket).where(OrderTicket.midtrans_transaction_id == str(body.get("transaction_id", "")))
        ).first()
    if not ticket:
        return {"status": "ignored", "detail": "order not found"}

    if tx_status in {"settlement", "capture"}:
        if ticket.status == "RESERVED" and ticket.payment_status != "PAID":
            ticket.payment_status = "PAID"
            session.add(ticket)
            session.commit()
    elif tx_status in {"expire", "cancel", "deny"}:
        if ticket.status == "RESERVED" and ticket.payment_status == "PENDING":
            res = session.execute(
                update(OrderTicket)
                .where(
                    OrderTicket.id == ticket.id,
                    OrderTicket.status == "RESERVED",
                    OrderTicket.payment_status == "PENDING",
                )
                .values(status="CANCELLED", cancelled_at=utc_now_iso())
            )
            if res.rowcount > 0:
                _rollback_ticket_stock(session, ticket)
            session.commit()

    return {"status": "ok"}


async def _reconcile_midtrans_status(session: Session, ticket: OrderTicket) -> bool:
    """Actively reconciles a PENDING Midtrans QRIS ticket against Midtrans Core API /v2/{order_id}/status."""
    if (
        ticket.status != "RESERVED"
        or ticket.payment_status != "PENDING"
        or ticket.payment_method != "MIDTRANS_QRIS"
    ):
        return False
    cfg = get_midtrans_config()
    if not cfg:
        return False

    auth_raw = base64.b64encode(f"{cfg['server_key']}:".encode("utf-8")).decode("utf-8")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(
                f"{cfg['base_url']}/v2/{ticket.id}/status",
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Basic {auth_raw}",
                },
            )
            if res.status_code >= 400:
                return False
            mt_data = res.json()
    except Exception:
        return False

    tx_status = str(mt_data.get("transaction_status", "")).strip().lower()
    if tx_status in {"settlement", "capture"}:
        ticket.payment_status = "PAID"
        session.add(ticket)
        session.commit()
        session.refresh(ticket)
        return True
    if tx_status in {"expire", "cancel", "deny"}:
        upd = session.execute(
            update(OrderTicket)
            .where(
                OrderTicket.id == ticket.id,
                OrderTicket.status == "RESERVED",
                OrderTicket.payment_status == "PENDING",
            )
            .values(status="CANCELLED", cancelled_at=utc_now_iso())
        )
        if upd.rowcount > 0:
            _rollback_ticket_stock(session, ticket)
            session.commit()
            session.refresh(ticket)
            return True
    return False


@router.get("/{order_id}/status", response_model=PaymentStatusResponse)
async def get_payment_status(
    order_id: str,
    session: Session = Depends(get_session),
    user_claims: dict[str, Any] = Depends(require_consumer_user),
) -> PaymentStatusResponse:
    """Polls latest payment status for an order (with Guardrail #5 lazy 15-min expiry check + active Midtrans reconciliation)."""
    ticket = session.get(OrderTicket, order_id)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tiket pesanan tidak ditemukan.")
    if ticket.user_id and ticket.user_id != user_claims.get("sub"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Akses ditolak.")

    sync_pending_qris_expiry(session, [ticket])
    await _reconcile_midtrans_status(session, ticket)

    return PaymentStatusResponse(
        order_id=ticket.id,
        order_code=ticket.order_code,
        status=ticket.status,
        payment_status=ticket.payment_status,
        payment_method=ticket.payment_method,
        payment_expires_at=ticket.payment_expires_at.isoformat() if ticket.payment_expires_at else None,
    )
