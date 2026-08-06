from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import List, Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/injections", tags=["Injections"])

VALID_SITES = ["abdomen_l", "abdomen_r", "thigh_l", "thigh_r", "arm_l", "arm_r"]
SITE_LABELS = {
    "abdomen_l": "Abdomen (Left)",
    "abdomen_r": "Abdomen (Right)",
    "thigh_l": "Thigh (Left)",
    "thigh_r": "Thigh (Right)",
    "arm_l": "Upper Arm (Left)",
    "arm_r": "Upper Arm (Right)"
}

class InjectionCreate(BaseModel):
    medication_id: int
    dosage_mg: float
    timestamp: str # ISO format YYYY-MM-DDTHH:MM
    site: str # must be in VALID_SITES
    notes: Optional[str] = ""

class InjectionUpdate(BaseModel):
    medication_id: Optional[int] = None
    dosage_mg: Optional[float] = None
    timestamp: Optional[str] = None
    site: Optional[str] = None
    notes: Optional[str] = None

@router.get("")
def list_injections(limit: Optional[int] = Query(200), db = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("""
    SELECT i.id, i.medication_id, i.dosage_mg, i.timestamp, i.site, i.notes, i.created_at,
           m.name as medication_name, m.active_ingredient
    FROM injections i
    LEFT JOIN medications m ON i.medication_id = m.id
    ORDER BY i.timestamp DESC
    LIMIT ?;
    """, (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    
    # Calculate interval warnings & rotation recommendations
    for r in rows:
        r["site_label"] = SITE_LABELS.get(r["site"], r["site"])

    return rows

@router.get("/rotation-summary")
def get_rotation_summary(db = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("""
    SELECT site, max(timestamp) as last_used, count(*) as total_uses
    FROM injections
    GROUP BY site;
    """, ())
    site_usage = {r["site"]: dict(r) for r in cursor.fetchall()}
    
    # Check overall last injection
    cursor.execute("""
    SELECT i.*, m.name as medication_name, m.active_ingredient
    FROM injections i
    LEFT JOIN medications m ON i.medication_id = m.id
    ORDER BY i.timestamp DESC LIMIT 1;
    """)
    last_inj = cursor.fetchone()
    
    interval_warning = None
    days_since_last = None
    last_dt = None
    
    if last_inj:
        last_inj_dict = dict(last_inj)
        try:
            last_dt = datetime.fromisoformat(last_inj_dict["timestamp"].replace("Z", "+00:00")).replace(tzinfo=None)
            days_since_last = round((datetime.now() - last_dt).total_seconds() / 86400.0, 1)
        except Exception:
            pass

    # Fetch recent injection intervals to calculate target frequency (default 7.0 days)
    cursor.execute("SELECT timestamp FROM injections ORDER BY timestamp DESC LIMIT 10;")
    inj_ts_rows = cursor.fetchall()
    target_interval_days = 7.0
    if len(inj_ts_rows) >= 2:
        intervals = []
        for i in range(len(inj_ts_rows) - 1):
            try:
                t1 = datetime.fromisoformat(inj_ts_rows[i]["timestamp"].replace("Z", "+00:00")).replace(tzinfo=None)
                t2 = datetime.fromisoformat(inj_ts_rows[i+1]["timestamp"].replace("Z", "+00:00")).replace(tzinfo=None)
                diff = (t1 - t2).total_seconds() / 86400.0
                if 2.0 <= diff <= 14.0:
                    intervals.append(diff)
            except Exception:
                pass
        if intervals:
            target_interval_days = round(sum(intervals) / len(intervals), 1)

    # Determine recommended next site (the site not used for longest time)
    site_statuses = []
    for s in VALID_SITES:
        u = site_usage.get(s, {"site": s, "last_used": None, "total_uses": 0})
        site_statuses.append({
            "site": s,
            "label": SITE_LABELS.get(s, s),
            "last_used": u["last_used"],
            "total_uses": u["total_uses"]
        })
        
    # Sort sites by last_used ascending (None values first)
    recommended_sites = sorted(site_statuses, key=lambda x: (x["last_used"] is not None, x["last_used"] or ""))
    next_recommended_site = recommended_sites[0] if recommended_sites else None

    # Smart Injection Reminder Calculation
    reminder_status = "NO_INJECTIONS"
    next_due_date_str = None
    days_until_next = None
    alert_message = "No injections recorded yet. Log your first dose to initiate smart rotation tracking."

    if last_dt:
        next_due_dt = last_dt + timedelta(days=target_interval_days)
        next_due_date_str = next_due_dt.strftime("%Y-%m-%d")
        now_dt = datetime.now()
        days_until_next = int(round((next_due_dt - now_dt).total_seconds() / 86400.0))

        rec_label = next_recommended_site["label"] if next_recommended_site else "Abdomen (Left)"

        if days_until_next < 0:
            reminder_status = "OVERDUE"
            overdue_days = abs(days_until_next)
            alert_message = f"🚨 Injection OVERDUE by {overdue_days} day{'s' if overdue_days > 1 else ''}! Scheduled for {next_due_date_str}. Recommended Site: {rec_label}."
        elif days_until_next == 0:
            reminder_status = "DUE_TODAY"
            alert_message = f"⚡ Injection DUE TODAY ({next_due_date_str})! Recommended Site: {rec_label}."
        else:
            reminder_status = "UPCOMING"
            alert_message = f"📅 Next injection due in {days_until_next} day{'s' if days_until_next > 1 else ''} ({next_due_date_str}). Recommended Site: {rec_label}."

    return {
        "last_injection": dict(last_inj) if last_inj else None,
        "days_since_last": days_since_last,
        "target_interval_days": target_interval_days,
        "interval_warning": interval_warning,
        "recommended_next_site": next_recommended_site,
        "site_history": site_statuses,
        "smart_reminder": {
            "status": reminder_status,
            "next_due_date": next_due_date_str,
            "days_until_next": days_until_next,
            "alert_message": alert_message,
            "recommended_site": next_recommended_site
        }
    }

@router.post("", status_code=201)
def create_injection(payload: InjectionCreate, db = Depends(get_db), user = Depends(get_current_user)):
    if payload.site not in VALID_SITES:
        raise HTTPException(status_code=400, detail=f"Invalid site. Must be one of {VALID_SITES}")
        
    cursor = db.cursor()
    cursor.execute("""
    INSERT INTO injections (medication_id, dosage_mg, timestamp, site, notes)
    VALUES (?, ?, ?, ?, ?);
    """, (payload.medication_id, payload.dosage_mg, payload.timestamp, payload.site, payload.notes or ""))
    
    inj_id = cursor.lastrowid
    db.commit()
    return {"id": inj_id, "message": "Injection logged successfully"}

@router.put("/{inj_id}")
def update_injection(inj_id: int, payload: InjectionUpdate, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM injections WHERE id = ?;", (inj_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Injection record not found")
        
    med_id = payload.medication_id if payload.medication_id is not None else row["medication_id"]
    dose = payload.dosage_mg if payload.dosage_mg is not None else row["dosage_mg"]
    ts = payload.timestamp if payload.timestamp is not None else row["timestamp"]
    site = payload.site if payload.site is not None else row["site"]
    notes = payload.notes if payload.notes is not None else row["notes"]
    
    if site not in VALID_SITES:
        raise HTTPException(status_code=400, detail=f"Invalid injection site. Must be one of {VALID_SITES}")

    cursor.execute("""
    UPDATE injections
    SET medication_id = ?, dosage_mg = ?, timestamp = ?, site = ?, notes = ?
    WHERE id = ?;
    """, (med_id, dose, ts, site, notes, inj_id))
    
    db.commit()
    return {"id": inj_id, "message": "Injection updated"}

@router.delete("/{inj_id}")
def delete_injection(inj_id: int, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("DELETE FROM injections WHERE id = ?;", (inj_id,))
    db.commit()
    return {"message": f"Injection {inj_id} deleted"}
