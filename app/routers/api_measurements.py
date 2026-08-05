import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/measurements", tags=["Measurements"])

class MeasurementCreate(BaseModel):
    scale_id: Optional[int] = None
    timestamp: str  # ISO string YYYY-MM-DDTHH:MM
    notes: Optional[str] = ""
    data: Dict[str, Any] # Dynamic JSON object of metric values e.g. {"weight_kg": 92.5, "body_fat_pct": 24.0}

class MeasurementUpdate(BaseModel):
    scale_id: Optional[int] = None
    timestamp: Optional[str] = None
    notes: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

@router.get("")
def list_measurements(
    scale_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: Optional[int] = Query(500),
    db = Depends(get_db)
):
    cursor = db.cursor()
    query = """
    SELECT m.id, m.scale_id, m.timestamp, m.notes, m.data_json, m.created_at, m.updated_at, s.name as scale_name
    FROM measurements m
    LEFT JOIN scales s ON m.scale_id = s.id
    WHERE 1=1
    """
    params = []
    
    if scale_id is not None and scale_id > 0:
        query += " AND m.scale_id = ?"
        params.append(scale_id)
        
    if start_date:
        query += " AND m.timestamp >= ?"
        params.append(start_date)
        
    if end_date:
        if len(end_date) == 10:
            query += " AND m.timestamp <= ?"
            params.append(f"{end_date}T23:59:59")
        else:
            query += " AND m.timestamp <= ?"
            params.append(end_date)
        
    query += " ORDER BY m.timestamp DESC LIMIT ?"
    params.append(limit)
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    result = []
    for r in rows:
        item = dict(r)
        data_json_str = item.pop("data_json", "{}")
        try:
            item["data"] = json.loads(data_json_str) if data_json_str else {}
        except Exception:
            item["data"] = {}
        result.append(item)
        
    return result

@router.post("", status_code=201)
def create_measurement(payload: MeasurementCreate, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    ts = payload.timestamp if payload.timestamp else datetime.now().isoformat()
    data_str = json.dumps(payload.data)
    
    cursor.execute("""
    INSERT INTO measurements (scale_id, timestamp, notes, data_json)
    VALUES (?, ?, ?, ?);
    """, (payload.scale_id, ts, payload.notes or "", data_str))
    
    meas_id = cursor.lastrowid
    db.commit()
    return {"id": meas_id, "message": "Measurement recorded successfully"}

@router.get("/{meas_id}")
def get_measurement(meas_id: int, db = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("""
    SELECT m.id, m.scale_id, m.timestamp, m.notes, m.data_json, m.created_at, s.name as scale_name
    FROM measurements m
    LEFT JOIN scales s ON m.scale_id = s.id
    WHERE m.id = ?;
    """, (meas_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Measurement not found")
        
    item = dict(row)
    data_json_str = item.pop("data_json", "{}")
    item["data"] = json.loads(data_json_str) if data_json_str else {}
    return item

@router.put("/{meas_id}")
def update_measurement(meas_id: int, payload: MeasurementUpdate, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM measurements WHERE id = ?;", (meas_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Measurement not found")
        
    scale_id = payload.scale_id if payload.scale_id is not None else row["scale_id"]
    timestamp = payload.timestamp if payload.timestamp is not None else row["timestamp"]
    notes = payload.notes if payload.notes is not None else row["notes"]
    
    if payload.data is not None:
        # Merge with existing data so non-destructive metric edits preserve previous fields
        existing_data = json.loads(row["data_json"]) if row["data_json"] else {}
        existing_data.update(payload.data)
        data_str = json.dumps(existing_data)
    else:
        data_str = row["data_json"]
        
    cursor.execute("""
    UPDATE measurements
    SET scale_id = ?, timestamp = ?, notes = ?, data_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?;
    """, (scale_id, timestamp, notes, data_str, meas_id))
    
    db.commit()
    return {"id": meas_id, "message": "Measurement updated"}

@router.delete("/{meas_id}")
def delete_measurement(meas_id: int, db = Depends(get_db), user = Depends(get_current_user)):

    cursor = db.cursor()
    cursor.execute("SELECT * FROM measurements WHERE id = ?;", (meas_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Measurement not found")
        
    cursor.execute("DELETE FROM measurements WHERE id = ?;", (meas_id,))
    db.commit()
    return {"message": f"Measurement {meas_id} deleted"}
