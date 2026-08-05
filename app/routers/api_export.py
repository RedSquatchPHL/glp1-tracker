import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from fastapi.responses import StreamingResponse
from app.database import get_db
from app.auth import get_current_user
from app.export_import import export_full_json, export_measurements_csv, import_full_json, import_measurements_csv

router = APIRouter(prefix="/api", tags=["Export & Import"])

@router.get("/export/json")
def download_export_json(db = Depends(get_db)):
    data = export_full_json(db)
    json_str = json.dumps(data, indent=2)
    return Response(
        content=json_str,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="glp1_tracker_backup.json"'}
    )

@router.get("/export/csv")
def download_export_csv(db = Depends(get_db)):
    csv_str = export_measurements_csv(db)
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="glp1_measurements.csv"'}
    )

@router.post("/import/json")
async def import_json_data(
    file: UploadFile = File(...),
    overwrite: bool = Form(False),
    db = Depends(get_db),
    user = Depends(get_current_user)
):
    try:
        content = await file.read()
        payload = json.loads(content.decode("utf-8"))
        counts = import_full_json(db, payload, overwrite=overwrite)
        return {"message": "JSON backup restored successfully", "imported_counts": counts}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse or import JSON backup: {str(e)}")

@router.post("/import/csv")
async def import_csv_data(
    file: UploadFile = File(...),
    db = Depends(get_db),
    user = Depends(get_current_user)
):
    try:
        content = await file.read()
        csv_text = content.decode("utf-8")
        count = import_measurements_csv(db, csv_text)
        return {"message": f"Successfully imported {count} measurement logs from CSV"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse or import CSV: {str(e)}")
