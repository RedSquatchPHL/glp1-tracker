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
    SELECT i.*, m.name as medication_name
    FROM injections i
    LEFT JOIN medications m ON i.medication_id = m.id
    ORDER BY i.timestamp DESC LIMIT 1;
    """)
    last_inj = cursor.fetchone()
    
    interval_warning = None
    days_since_last = None
    
    if last_inj:
        last_inj_dict = dict(last_inj)
        try:
            last_dt = datetime.fromisoformat(last_inj_dict["timestamp"].replace("Z", "+00:00"))
            days_since_last = round((datetime.now() - last_dt.replace(tzinfo=None)).total_seconds() / 86400.0, 1)
        except Exception:
            pass

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

    return {
        "last_injection": dict(last_inj) if last_inj else None,
        "days_since_last": days_since_last,
        "interval_warning": interval_warning,
        "recommended_next_site": next_recommended_site,
        "site_history": site_statuses
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
