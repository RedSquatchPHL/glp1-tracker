from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import List, Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/purchases", tags=["Purchases & Financials"])

class PurchaseCreate(BaseModel):
    medication_id: int
    purchase_date: str # YYYY-MM-DD
    pack_size_doses: int = 4
    dose_mg: float
    pharmacy_source: Optional[str] = ""
    total_cost: float
    currency: Optional[str] = "€"
    notes: Optional[str] = ""

class PurchaseUpdate(BaseModel):
    medication_id: Optional[int] = None
    purchase_date: Optional[str] = None
    pack_size_doses: Optional[int] = None
    dose_mg: Optional[float] = None
    pharmacy_source: Optional[str] = None
    total_cost: Optional[float] = None
    currency: Optional[str] = None
    notes: Optional[str] = None

@router.get("")
def list_purchases(db = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("""
    SELECT p.*, m.name as medication_name
    FROM purchases p
    LEFT JOIN medications m ON p.medication_id = m.id
    ORDER BY p.purchase_date DESC;
    """)
    return [dict(r) for r in cursor.fetchall()]

@router.get("/financial-inventory-stats")
def get_financial_and_inventory_stats(db = Depends(get_db)):
    cursor = db.cursor()
    
    # 1. Total cost & purchases
    cursor.execute("SELECT SUM(total_cost) FROM purchases;")
    total_cost = cursor.fetchone()[0] or 0.0
    
    cursor.execute("SELECT currency FROM purchases ORDER BY id DESC LIMIT 1;")
    curr_row = cursor.fetchone()
    currency = curr_row[0] if curr_row and curr_row[0] else "€"

    # 2. Total doses purchased
    cursor.execute("SELECT SUM(pack_size_doses) FROM purchases;")
    total_doses_purchased = cursor.fetchone()[0] or 0

    # 3. Total doses administered (injections logged)
    cursor.execute("SELECT COUNT(*) FROM injections;")
    total_doses_injected = cursor.fetchone()[0] or 0

    # Remaining inventory in fridge
    doses_in_fridge = max(0, total_doses_purchased - total_doses_injected)

    # 4. Date range for cost rate calculation
    cursor.execute("SELECT MIN(timestamp), MAX(timestamp) FROM injections;")
    inj_range = cursor.fetchone()
    min_inj, max_inj = inj_range[0], inj_range[1]
    
    daily_expenditure = 0.0
    monthly_expenditure = 0.0
    journey_days = 1

    if min_inj and max_inj:
        try:
            d_start = datetime.fromisoformat(min_inj.replace("Z", "+00:00")).date()
            d_end = datetime.now().date()
            journey_days = max(1, (d_end - d_start).days + 1)
            daily_expenditure = round(total_cost / journey_days, 2)
            monthly_expenditure = round(daily_expenditure * 30.4375, 2)
        except Exception:
            pass

    # 5. Projected refill run-out date
    # Calculate average injection interval in days
    projected_refill_date = None
    days_until_refill = None

    cursor.execute("SELECT timestamp FROM injections ORDER BY timestamp DESC LIMIT 5;")
    recent_injs = [r[0] for r in cursor.fetchall()]
    
    avg_interval_days = 7.0 # default weekly
    if len(recent_injs) >= 2:
        try:
            dts = [datetime.fromisoformat(t.replace("Z", "+00:00")) for t in recent_injs]
            diffs = [(dts[i] - dts[i+1]).total_seconds() / 86400.0 for i in range(len(dts)-1)]
            if diffs and sum(diffs) > 0:
                avg_interval_days = sum(diffs) / len(diffs)
        except Exception:
            pass

    if doses_in_fridge > 0:
        cursor.execute("SELECT timestamp FROM injections ORDER BY timestamp DESC LIMIT 1;")
        last_inj_row = cursor.fetchone()
        last_inj_dt = datetime.now()
        if last_inj_row and last_inj_row[0]:
            try:
                last_inj_dt = datetime.fromisoformat(last_inj_row[0].replace("Z", "+00:00"))
            except Exception:
                pass
                
        run_out_dt = last_inj_dt + timedelta(days=avg_interval_days * doses_in_fridge)
        projected_refill_date = run_out_dt.strftime("%Y-%m-%d")
        days_until_refill = max(0, int((run_out_dt.date() - datetime.now().date()).days))
    else:
        projected_refill_date = "Refill Needed Now (0 doses remaining)"
        days_until_refill = 0

    return {
        "currency": currency,
        "total_cost": round(total_cost, 2),
        "journey_days": journey_days,
        "daily_expenditure": daily_expenditure,
        "monthly_expenditure": monthly_expenditure,
        "total_doses_purchased": total_doses_purchased,
        "total_doses_injected": total_doses_injected,
        "doses_in_fridge": doses_in_fridge,
        "avg_injection_interval_days": round(avg_interval_days, 1),
        "projected_refill_date": projected_refill_date,
        "days_until_refill": days_until_refill
    }

@router.post("", status_code=201)
def create_purchase(payload: PurchaseCreate, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("""
    INSERT INTO purchases (medication_id, purchase_date, pack_size_doses, dose_mg, pharmacy_source, total_cost, currency, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    """, (payload.medication_id, payload.purchase_date, payload.pack_size_doses, payload.dose_mg, payload.pharmacy_source or "", payload.total_cost, payload.currency or "€", payload.notes or ""))
    
    p_id = cursor.lastrowid
    db.commit()
    return {"id": p_id, "message": "Purchase logged successfully"}

@router.put("/{p_id}")
def update_purchase(p_id: int, payload: PurchaseUpdate, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM purchases WHERE id = ?;", (p_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Purchase record not found")
        
    med_id = payload.medication_id if payload.medication_id is not None else row["medication_id"]
    p_date = payload.purchase_date if payload.purchase_date is not None else row["purchase_date"]
    pack_size = payload.pack_size_doses if payload.pack_size_doses is not None else row["pack_size_doses"]
    dose_mg = payload.dose_mg if payload.dose_mg is not None else row["dose_mg"]
    pharmacy = payload.pharmacy_source if payload.pharmacy_source is not None else row["pharmacy_source"]
    cost = payload.total_cost if payload.total_cost is not None else row["total_cost"]
    curr = payload.currency if payload.currency is not None else row["currency"]
    notes = payload.notes if payload.notes is not None else row["notes"]
    
    cursor.execute("""
    UPDATE purchases
    SET medication_id = ?, purchase_date = ?, pack_size_doses = ?, dose_mg = ?, pharmacy_source = ?, total_cost = ?, currency = ?, notes = ?
    WHERE id = ?;
    """, (med_id, p_date, pack_size, dose_mg, pharmacy, cost, curr, notes, p_id))
    
    db.commit()
    return {"id": p_id, "message": "Purchase record updated"}

@router.delete("/{p_id}")
def delete_purchase(p_id: int, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("DELETE FROM purchases WHERE id = ?;", (p_id,))
    db.commit()
    return {"message": f"Purchase {p_id} deleted"}
    cursor = db.cursor()
    cursor.execute("DELETE FROM purchases WHERE id = ?;", (p_id,))
    db.commit()
    return {"message": f"Purchase {p_id} deleted"}
