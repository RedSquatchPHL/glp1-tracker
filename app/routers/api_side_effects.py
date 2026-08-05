from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import List, Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/side_effects", tags=["Side Effects"])

class SideEffectCreate(BaseModel):
    timestamp: str # ISO format YYYY-MM-DDTHH:MM
    symptom_name: str # Nausea, Fatigue, Constipation, Acid Reflux, Headache, etc.
    severity: int # 1 to 5
    notes: Optional[str] = ""

class SideEffectUpdate(BaseModel):
    timestamp: Optional[str] = None
    symptom_name: Optional[str] = None
    severity: Optional[int] = None
    notes: Optional[str] = None

@router.get("")
def list_side_effects(limit: Optional[int] = Query(200), db = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("""
    SELECT * FROM side_effects
    ORDER BY timestamp DESC
    LIMIT ?;
    """, (limit,))
    return [dict(r) for r in cursor.fetchall()]

@router.get("/analytics")
def get_side_effects_analytics(db = Depends(get_db)):
    cursor = db.cursor()
    
    # 1. Symptom frequency & average severity
    cursor.execute("""
    SELECT symptom_name, COUNT(*) as count, AVG(severity) as avg_severity, MAX(severity) as max_severity
    FROM side_effects
    GROUP BY symptom_name
    ORDER BY count DESC;
    """)
    symptom_summary = [dict(r) for r in cursor.fetchall()]

    # 2. Weekday distribution (0=Monday, 6=Sunday)
    cursor.execute("SELECT timestamp, severity, symptom_name FROM side_effects;")
    all_se = cursor.fetchall()
    
    weekday_counts = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0}
    weekday_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    
    for r in all_se:
        try:
            dt = datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00"))
            wd = dt.weekday()
            weekday_counts[wd] += 1
        except Exception:
            pass

    weekday_breakdown = [
        {"day": weekday_names[i], "count": weekday_counts[i]}
        for i in range(7)
    ]

    # 3. Dosage increase correlation
    # Get injections sorted by timestamp
    cursor.execute("""
    SELECT i.timestamp, i.dosage_mg, m.name as medication_name
    FROM injections i
    LEFT JOIN medications m ON i.medication_id = m.id
    ORDER BY i.timestamp ASC;
    """)
    injections = [dict(r) for r in cursor.fetchall()]

    return {
        "symptom_summary": symptom_summary,
        "weekday_breakdown": weekday_breakdown,
        "recent_injections": injections[-10:] if injections else []
    }

@router.post("", status_code=201)
def create_side_effect(payload: SideEffectCreate, db = Depends(get_db), user = Depends(get_current_user)):
    if payload.severity < 1 or payload.severity > 5:
        raise HTTPException(status_code=400, detail="Severity must be between 1 and 5")
        
    cursor = db.cursor()
    cursor.execute("""
    INSERT INTO side_effects (timestamp, symptom_name, severity, notes)
    VALUES (?, ?, ?, ?);
    """, (payload.timestamp, payload.symptom_name, payload.severity, payload.notes or ""))
    
    se_id = cursor.lastrowid
    db.commit()
    return {"id": se_id, "message": "Side effect logged successfully"}

@router.put("/{se_id}")
def update_side_effect(se_id: int, payload: SideEffectUpdate, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM side_effects WHERE id = ?;", (se_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Side effect record not found")
        
    ts = payload.timestamp if payload.timestamp is not None else row["timestamp"]
    symptom = payload.symptom_name if payload.symptom_name is not None else row["symptom_name"]
    sev = payload.severity if payload.severity is not None else row["severity"]
    notes = payload.notes if payload.notes is not None else row["notes"]
    
    if sev < 1 or sev > 5:
        raise HTTPException(status_code=400, detail="Severity must be between 1 and 5")

    cursor.execute("""
    UPDATE side_effects
    SET timestamp = ?, symptom_name = ?, severity = ?, notes = ?
    WHERE id = ?;
    """, (ts, symptom, sev, notes, se_id))
    
    db.commit()
    return {"id": se_id, "message": "Side effect updated"}

@router.delete("/{se_id}")
def delete_side_effect(se_id: int, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("DELETE FROM side_effects WHERE id = ?;", (se_id,))
    db.commit()
    return {"message": f"Side effect {se_id} deleted"}
