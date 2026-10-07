import json
from fastapi import APIRouter, Depends, Query
from typing import Optional
from pydantic import BaseModel
from app.database import get_db
from app.auth import get_current_user
from app.math_engine import (
    calculate_moving_averages, 
    calculate_linear_projections,
    calculate_pharmacokinetics,
    calculate_body_ratios,
    detect_weight_plateau
)

router = APIRouter(prefix="/api/analytics", tags=["Analytics & Dashboard"])

class UserProfileSettings(BaseModel):
    user_name: Optional[str] = None
    user_dob: Optional[str] = None
    physician_name: Optional[str] = None
    medical_conditions: Optional[str] = None
    target_weight_kg: Optional[float] = None
    user_height_cm: Optional[float] = None
    user_gender: Optional[str] = None

@router.get("/dashboard")
def get_dashboard_data(
    scale_id: Optional[int] = Query(None), # None or 0 means All Sources
    window_days: Optional[int] = Query(30), # 7, 14, 30, or 0 (total)
    db = Depends(get_db)
):
    cursor = db.cursor()
    
    # 1. Fetch user settings
    cursor.execute("SELECT key, value FROM user_settings;")
    settings_dict = {r["key"]: r["value"] for r in cursor.fetchall()}
    
    user_name = settings_dict.get("user_name", "Patient")
    user_dob = settings_dict.get("user_dob", "")
    physician_name = settings_dict.get("physician_name", "")
    medical_conditions = settings_dict.get("medical_conditions", "")
    target_weight_kg = float(settings_dict.get("target_weight_kg", "165.0"))
    user_height_cm = float(settings_dict.get("user_height_cm", "175.0"))
    user_gender = settings_dict.get("user_gender", "unspecified")

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

    # 3. Calculate moving averages for primary metrics (Weight, Body Fat %, Muscle Mass lbs)
    weight_ma = calculate_moving_averages(measurements, "weight_kg")
    fat_ma = calculate_moving_averages(measurements, "body_fat_pct")
    muscle_ma = calculate_moving_averages(measurements, "muscle_mass_kg")

    # 4. Calculate Linear Projections & Lean Mass Protection Warning
    projections = calculate_linear_projections(
        measurements=measurements,
        target_weight_kg=target_weight_kg,
        window_days=window_days or 0
    )

    # 5. Fetch Medication Injections for Pharmacokinetics & Graph Overlays
    cursor.execute("""
    SELECT i.timestamp, i.dosage_mg, i.site, m.name as medication_name, m.active_ingredient
    FROM injections i
    LEFT JOIN medications m ON i.medication_id = m.id
    ORDER BY i.timestamp ASC;
    """)
    injection_rows = [dict(r) for r in cursor.fetchall()]

    # 6. Pharmacokinetics Half-Life Simulator & Active Concentration Accumulation
    pk_analysis = calculate_pharmacokinetics(injection_rows, days_ahead=14)

    # 7. Automated Plateau Detection & Breakdown Engine
    plateau_analysis = detect_weight_plateau(measurements, threshold_days=14, window_kg=1.0)

    # 8. Waist-to-Height (WHtR) & Waist-to-Hip (WHR) Ratio Analysis
    latest_waist_cm = None
    latest_hip_cm = None

    for m in reversed(measurements):
        data = m.get("data", {})
        if latest_waist_cm is None and data.get("waist_cm") is not None:
            latest_waist_cm = float(data["waist_cm"])
        if latest_hip_cm is None and data.get("hip_cm") is not None:
            latest_hip_cm = float(data["hip_cm"])
        if latest_waist_cm is not None and latest_hip_cm is not None:
            break

    body_ratios = calculate_body_ratios(
        waist_cm=latest_waist_cm,
        hip_cm=latest_hip_cm,
        height_cm=user_height_cm,
        gender=user_gender
    )

    # 9. Overall statistics
    latest_meas = None
    first_meas = None
    
    for m in reversed(measurements):
        if m.get("data", {}).get("weight_kg") is not None:
            latest_meas = m
            break

    for m in measurements:
        if m.get("data", {}).get("weight_kg") is not None:
            first_meas = m
            break

    start_weight = first_meas["data"]["weight_kg"] if first_meas else None
    current_weight = latest_meas["data"]["weight_kg"] if latest_meas else None
    latest_weight_date = latest_meas["timestamp"].split("T")[0] if latest_meas else None

    total_lost = round(current_weight - start_weight, 2) if (start_weight is not None and current_weight is not None) else 0.0
    weight_to_goal = round(current_weight - target_weight_kg, 2) if (current_weight is not None and target_weight_kg is not None) else 0.0

    return {
        "scale_filter_id": scale_id,
        "total_measurements_count": len(measurements),
        "user_name": user_name,
        "user_dob": user_dob,
        "physician_name": physician_name,
        "medical_conditions": medical_conditions,
        "target_weight_kg": target_weight_kg,
        "user_height_cm": user_height_cm,
        "user_gender": user_gender,
        "start_weight_kg": start_weight,
        "current_weight_kg": current_weight,
        "latest_weight_date": latest_weight_date,
        "total_lost_kg": total_lost,
        "weight_to_goal_kg": weight_to_goal,
        "weight_moving_averages": weight_ma,
        "fat_moving_averages": fat_ma,
        "muscle_moving_averages": muscle_ma,
        "projections": projections,
        "pharmacokinetics": pk_analysis,
        "plateau_analysis": plateau_analysis,
        "body_ratios": body_ratios,
        "medication_overlays": injection_rows
    }

@router.post("/settings/user-profile")
def update_user_profile(payload: UserProfileSettings, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    if payload.user_name is not None:
        cursor.execute("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('user_name', ?);", (str(payload.user_name).strip(),))
    if payload.user_dob is not None:
        cursor.execute("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('user_dob', ?);", (str(payload.user_dob).strip(),))
    if payload.physician_name is not None:
        cursor.execute("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('physician_name', ?);", (str(payload.physician_name).strip(),))
    if payload.medical_conditions is not None:
        cursor.execute("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('medical_conditions', ?);", (str(payload.medical_conditions).strip(),))
    if payload.target_weight_kg is not None:
        cursor.execute("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('target_weight_kg', ?);", (str(payload.target_weight_kg),))
    if payload.user_height_cm is not None:
        cursor.execute("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('user_height_cm', ?);", (str(payload.user_height_cm),))
    if payload.user_gender is not None:
        cursor.execute("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('user_gender', ?);", (str(payload.user_gender),))
    db.commit()
    return {"message": "User profile settings updated successfully"}

@router.post("/settings/target-weight")
def update_target_weight(target_weight_kg: float, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("""
    INSERT OR REPLACE INTO user_settings (key, value) VALUES ('target_weight_kg', ?);
    """, (str(target_weight_kg),))
    db.commit()
    return {"target_weight_kg": target_weight_kg, "message": "Target weight updated"}

class PreferencesSettings(BaseModel):
    currency_symbol: Optional[str] = "€"

@router.post("/settings/preferences")
def update_preferences(payload: PreferencesSettings, db = Depends(get_db), user = Depends(get_current_user)):
    cursor = db.cursor()
    if payload.currency_symbol:
        cursor.execute("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('currency_symbol', ?);", (payload.currency_symbol.strip(),))
    db.commit()
    return {"message": "Preferences updated successfully"}

