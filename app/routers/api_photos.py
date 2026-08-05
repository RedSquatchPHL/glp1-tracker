import os
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile, Form, status
from pydantic import BaseModel

from app.database import get_db
from app.auth import get_current_user

from app.config import PHOTOS_DIR

router = APIRouter(prefix="/api/photos", tags=["Progress Photos"])

UPLOAD_DIR = PHOTOS_DIR
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

class PhotoUpdate(BaseModel):
    timestamp: Optional[str] = None
    weight_kg: Optional[float] = None
    angle: Optional[str] = None
    notes: Optional[str] = None

@router.get("")
def list_photos(
    angle: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: Optional[int] = Query(500),
    db = Depends(get_db)
):
    cursor = db.cursor()
    query = """
    SELECT id, timestamp, weight_kg, angle, image_path, notes, created_at, updated_at
    FROM progress_photos
    WHERE 1=1
    """
    params = []
    
    if angle and angle.strip() and angle != "All":
        query += " AND angle = ?"
        params.append(angle.strip())
        
    if start_date:
        query += " AND timestamp >= ?"
        params.append(start_date)
        
    if end_date:
        if len(end_date) == 10:
            query += " AND timestamp <= ?"
            params.append(f"{end_date}T23:59:59")
        else:
            query += " AND timestamp <= ?"
            params.append(end_date)
        
    query += " ORDER BY timestamp DESC, id DESC LIMIT ?"
    params.append(limit)
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    return [dict(r) for r in rows]

@router.post("", status_code=201)
async def upload_photo(
    file: UploadFile = File(...),
    timestamp: str = Form(...),
    weight_kg: Optional[str] = Form(None),
    angle: str = Form("Front"),
    notes: Optional[str] = Form(""),
    db = Depends(get_db),
    user = Depends(get_current_user)
):
    # Validate file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        ext = ".jpg"
        
    # Generate unique filename
    unique_filename = f"photo_{uuid.uuid4().hex[:12]}{ext}"
    destination_path = UPLOAD_DIR / unique_filename

    # Save file contents
    try:
        contents = await file.read()
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        with open(destination_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        if not isinstance(e, HTTPException):
            raise HTTPException(status_code=500, detail=f"Failed to save image file: {str(e)}")
        raise e

    # Parse weight_kg
    parsed_weight: Optional[float] = None
    if weight_kg and weight_kg.strip():
        try:
            parsed_weight = float(weight_kg.strip())
        except ValueError:
            parsed_weight = None

    image_rel_path = f"/static/uploads/photos/{unique_filename}"
    
    cursor = db.cursor()
    cursor.execute("""
    INSERT INTO progress_photos (timestamp, weight_kg, angle, image_path, notes)
    VALUES (?, ?, ?, ?, ?);
    """, (timestamp, parsed_weight, angle.strip(), image_rel_path, notes or ""))
    
    photo_id = cursor.lastrowid
    db.commit()

    return {
        "id": photo_id,
        "timestamp": timestamp,
        "weight_kg": parsed_weight,
        "angle": angle.strip(),
        "image_path": image_rel_path,
        "notes": notes or "",
        "message": "Progress photo uploaded successfully"
    }

@router.get("/{photo_id}")
def get_photo(photo_id: int, db = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM progress_photos WHERE id = ?;", (photo_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Progress photo not found")
    return dict(row)

@router.put("/{photo_id}")
def update_photo(
    photo_id: int,
    payload: PhotoUpdate,
    db = Depends(get_db),
    user = Depends(get_current_user)
):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM progress_photos WHERE id = ?;", (photo_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Progress photo not found")
        
    new_timestamp = payload.timestamp if payload.timestamp is not None else row["timestamp"]
    new_weight = payload.weight_kg if payload.weight_kg is not None else row["weight_kg"]
    new_angle = payload.angle if payload.angle is not None else row["angle"]
    new_notes = payload.notes if payload.notes is not None else row["notes"]
    
    cursor.execute("""
    UPDATE progress_photos
    SET timestamp = ?, weight_kg = ?, angle = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?;
    """, (new_timestamp, new_weight, new_angle, new_notes, photo_id))
    
    db.commit()
    return {"id": photo_id, "message": "Photo metadata updated successfully"}

@router.delete("/{photo_id}")
def delete_photo(photo_id: int, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM progress_photos WHERE id = ?;", (photo_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Progress photo not found")
        
    image_path = row["image_path"]
    
    cursor.execute("DELETE FROM progress_photos WHERE id = ?;", (photo_id,))
    db.commit()
    
    # Try deleting physical file from disk
    if image_path and image_path.startswith("/static/uploads/photos/"):
        filename = os.path.basename(image_path)
        file_on_disk = UPLOAD_DIR / filename
        if file_on_disk.exists():
            try:
                os.remove(file_on_disk)
            except Exception:
                pass
                
    return {"message": f"Photo {photo_id} deleted successfully"}
