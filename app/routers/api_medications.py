import json
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/medications", tags=["Medications"])

class MedicationCreate(BaseModel):
    name: str
    active_ingredient: Optional[str] = ""
    dosage_steps: List[float]  # e.g. [0.25, 0.5, 1.0, 1.7, 2.4]
    form: Optional[str] = "subcutaneous_pen" # pen, vial, oral
    notes: Optional[str] = ""

class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    active_ingredient: Optional[str] = None
    dosage_steps: Optional[List[float]] = None
    form: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[int] = None

@router.get("")
def list_medications(db = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM medications WHERE is_active = 1 ORDER BY name ASC;")
    rows = cursor.fetchall()
    
    result = []
    for r in rows:
        item = dict(r)
        steps_str = item.pop("dosage_steps_json", "[]")
        try:
            item["dosage_steps"] = json.loads(steps_str)
        except Exception:
            item["dosage_steps"] = []
        result.append(item)
    return result

@router.post("", status_code=201)
def create_medication(payload: MedicationCreate, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    steps_json = json.dumps(payload.dosage_steps)
    
    cursor.execute("""
    INSERT INTO medications (name, active_ingredient, dosage_steps_json, form, notes)
    VALUES (?, ?, ?, ?, ?);
    """, (payload.name, payload.active_ingredient or "", steps_json, payload.form or "subcutaneous_pen", payload.notes or ""))
    
    med_id = cursor.lastrowid
    db.commit()
    return {"id": med_id, "name": payload.name, "message": "Medication profile created"}

@router.put("/{med_id}")
def update_medication(med_id: int, payload: MedicationUpdate, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM medications WHERE id = ?;", (med_id,))
    med = cursor.fetchone()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
        
    name = payload.name if payload.name is not None else med["name"]
    act_ing = payload.active_ingredient if payload.active_ingredient is not None else med["active_ingredient"]
    form = payload.form if payload.form is not None else med["form"]
    notes = payload.notes if payload.notes is not None else med["notes"]
    is_act = payload.is_active if payload.is_active is not None else med["is_active"]
    
    steps_json = json.dumps(payload.dosage_steps) if payload.dosage_steps is not None else med["dosage_steps_json"]
    
    cursor.execute("""
    UPDATE medications
    SET name = ?, active_ingredient = ?, dosage_steps_json = ?, form = ?, notes = ?, is_active = ?
    WHERE id = ?;
    """, (name, act_ing, steps_json, form, notes, is_act, med_id))
    
    db.commit()
    return {"id": med_id, "message": "Medication profile updated"}

@router.delete("/{med_id}")
def delete_medication(med_id: int, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("UPDATE medications SET is_active = 0 WHERE id = ?;", (med_id,))
    db.commit()
    return {"message": f"Medication {med_id} soft-deleted"}
