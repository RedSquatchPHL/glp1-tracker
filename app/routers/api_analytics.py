import json
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.database import get_db
from app.auth import get_current_user
from app.math_engine import calculate_moving_averages, calculate_linear_projections

router = APIRouter(prefix="/api/analytics", tags=["Analytics & Dashboard"])

@router.get("/dashboard")
def get_dashboard_data(
    scale_id: Optional[int] = Query(None), # None or 0 means All Sources
    window_days: Optional[int] = Query(30), # 7, 14, 30, or 0 (total)
    db = Depends(get_db)
):
    cursor = db.cursor()
    
    # 1. Fetch user settings (target weight)
    cursor.execute("SELECT value FROM user_settings WHERE key = 'target_weight_kg';")
    target_row = cursor.fetchone()
    target_weight_kg = float(target_row[0]) if target_row else 75.0

    # 2. Fetch measurements with scale filtering
    query = """
    SELECT m.id, m.scale_id, m.timestamp, m.notes, m.data_json, s.name as scale_name
    FROM measurements m
    LEFT JOIN scales s ON m.scale_id = s.id
    WHERE 1=1
    """
    params = []
    if scale_id and scale_id > 0:
        query += " AND m.scale_id = ?"
        params.append(scale_id)
        
    query += " ORDER BY m.timestamp ASC;"
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    measurements = []
    for r in rows:
        item = dict(r)
        data_str = item.pop("data_json", "{}")
        try:
            item["data"] = json.loads(data_str)
        except Exception:
            item["data"] = {}
        measurements.append(item)

    # 3. Calculate moving averages for primary metrics (Weight, Body Fat %, Muscle Mass kg)
    weight_ma = calculate_moving_averages(measurements, "weight_kg")
    fat_ma = calculate_moving_averages(measurements, "body_fat_pct")
    muscle_ma = calculate_moving_averages(measurements, "muscle_mass_kg")

    # 4. Calculate Linear Projections & Lean Mass Protection Warning
    projections = calculate_linear_projections(
        measurements=measurements,
        target_weight_kg=target_weight_kg,
        window_days=window_days or 0
    )

    # 5. Fetch Medication Injections for Graph Overlays
    cursor.execute("""
    SELECT i.timestamp, i.dosage_mg, m.name as medication_name
    FROM injections i
    LEFT JOIN medications m ON i.medication_id = m.id
    ORDER BY i.timestamp ASC;
    """)
    injection_overlays = [dict(r) for r in cursor.fetchall()]

    # 6. Overall statistics
    latest_meas = measurements[-1] if measurements else None
    first_meas = measurements[0] if measurements else None
    
    start_weight = first_meas["data"].get("weight_kg") if first_meas else None
    current_weight = latest_meas["data"].get("weight_kg") if latest_meas else None
    
    total_lost = round(current_weight - start_weight, 2) if (start_weight and current_weight) else 0.0

    return {
        "scale_filter_id": scale_id,
        "total_measurements_count": len(measurements),
        "target_weight_kg": target_weight_kg,
        "start_weight_kg": start_weight,
        "current_weight_kg": current_weight,
        "total_lost_kg": total_lost,
        "weight_moving_averages": weight_ma,
        "fat_moving_averages": fat_ma,
        "muscle_moving_averages": muscle_ma,
        "projections": projections,
        "medication_overlays": injection_overlays
    }

@router.post("/settings/target-weight")
def update_target_weight(target_weight_kg: float, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("""
    INSERT OR REPLACE INTO user_settings (key, value) VALUES ('target_weight_kg', ?);
    """, (str(target_weight_kg),))
    db.commit()
    return {"target_weight_kg": target_weight_kg, "message": "Target weight updated"}
