import json
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api", tags=["Scales & Metrics"])

class ScaleCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    assigned_metrics: Optional[List[str]] = []

class ScaleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[int] = None
    assigned_metrics: Optional[List[str]] = None

class MetricDefinitionCreate(BaseModel):
    key: str
    label: str
    unit: str
    category: Optional[str] = "body_comp"
    sort_order: Optional[int] = 100

class MetricDefinitionUpdate(BaseModel):
    label: Optional[str] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[int] = None
    sort_order: Optional[int] = None

@router.get("/scales")
def list_scales(db = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM scales WHERE is_active = 1 ORDER BY id ASC;")
    scales = [dict(r) for r in cursor.fetchall()]
    
    for scale in scales:
        cursor.execute("""
        SELECT m.* FROM metrics_definitions m
        JOIN scale_metrics sm ON m.key = sm.metric_key
        WHERE sm.scale_id = ? AND m.is_active = 1
        ORDER BY m.sort_order ASC;
        """, (scale["id"],))
        scale["metrics"] = [dict(r) for r in cursor.fetchall()]
        scale["assigned_metric_keys"] = [m["key"] for m in scale["metrics"]]
        
    return scales

@router.post("/scales", status_code=201)
def create_scale(payload: ScaleCreate, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("""
    INSERT INTO scales (name, description) VALUES (?, ?);
    """, (payload.name, payload.description))
    scale_id = cursor.lastrowid
    
    if payload.assigned_metrics:
        for m_key in payload.assigned_metrics:
            cursor.execute("""
            INSERT OR IGNORE INTO scale_metrics (scale_id, metric_key) VALUES (?, ?);
            """, (scale_id, m_key))
            
    db.commit()
    return {"id": scale_id, "name": payload.name, "message": "Scale created successfully"}

@router.put("/scales/{scale_id}")
def update_scale(scale_id: int, payload: ScaleUpdate, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM scales WHERE id = ?;", (scale_id,))
    scale = cursor.fetchone()
    if not scale:
        raise HTTPException(status_code=404, detail="Scale profile not found")
        
    name = payload.name if payload.name is not None else scale["name"]
    desc = payload.description if payload.description is not None else scale["description"]
    is_act = payload.is_active if payload.is_active is not None else scale["is_active"]
    
    cursor.execute("""
    UPDATE scales SET name = ?, description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?;
    """, (name, desc, is_act, scale_id))
    
    if payload.assigned_metrics is not None:
        cursor.execute("DELETE FROM scale_metrics WHERE scale_id = ?;", (scale_id,))
        for m_key in payload.assigned_metrics:
            cursor.execute("""
            INSERT OR IGNORE INTO scale_metrics (scale_id, metric_key) VALUES (?, ?);
            """, (scale_id, m_key))
            
    db.commit()
    return {"id": scale_id, "message": "Scale updated successfully"}

@router.delete("/scales/{scale_id}")
def delete_scale(scale_id: int, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM scales WHERE id = ?;", (scale_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Scale not found")
        
    # Soft delete to preserve historic entries non-destructively
    cursor.execute("UPDATE scales SET is_active = 0 WHERE id = ?;", (scale_id,))
    db.commit()
    return {"message": f"Scale {scale_id} deactivated non-destructively"}

@router.get("/metrics")
def list_metrics(db = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM metrics_definitions WHERE is_active = 1 ORDER BY sort_order ASC;")
    return [dict(r) for r in cursor.fetchall()]

@router.post("/metrics", status_code=201)
def create_custom_metric(payload: MetricDefinitionCreate, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    key_formatted = payload.key.strip().lower().replace(" ", "_")
    cursor.execute("SELECT * FROM metrics_definitions WHERE key = ?;", (key_formatted,))
    if cursor.fetchone():
        raise HTTPException(status_code=400, detail="Metric key already exists")
        
    cursor.execute("""
    INSERT INTO metrics_definitions (key, label, unit, category, is_custom, is_active, sort_order)
    VALUES (?, ?, ?, ?, 1, 1, ?);
    """, (key_formatted, payload.label, payload.unit, payload.category, payload.sort_order))
    db.commit()
    return {"key": key_formatted, "label": payload.label, "message": "Custom metric created successfully"}

@router.put("/metrics/{key}")
def update_metric(key: str, payload: MetricDefinitionUpdate, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM metrics_definitions WHERE key = ?;", (key,))
    metric = cursor.fetchone()
    if not metric:
        raise HTTPException(status_code=404, detail="Metric definition not found")
        
    lbl = payload.label if payload.label is not None else metric["label"]
    unit = payload.unit if payload.unit is not None else metric["unit"]
    cat = payload.category if payload.category is not None else metric["category"]
    act = payload.is_active if payload.is_active is not None else metric["is_active"]
    so = payload.sort_order if payload.sort_order is not None else metric["sort_order"]
    
    cursor.execute("""
    UPDATE metrics_definitions SET label = ?, unit = ?, category = ?, is_active = ?, sort_order = ?
    WHERE key = ?;
    """, (lbl, unit, cat, act, so, key))
    db.commit()
    return {"key": key, "message": "Metric definition updated"}

@router.delete("/metrics/{key}")
def delete_metric(key: str, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM metrics_definitions WHERE key = ?;", (key,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Metric definition not found")
        
    cursor.execute("UPDATE metrics_definitions SET is_active = 0 WHERE key = ?;", (key,))
    db.commit()
    return {"message": f"Metric '{key}' deactivated non-destructively"}

