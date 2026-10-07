from fastapi import FastAPI, Request, HTTPException, Depends, status, Response
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
from pydantic import BaseModel

from app.config import PORT, APP_PASSWORD, SECRET_KEY, PHOTOS_DIR
from app.database import init_db
from app.auth import create_session_token, verify_session_token, get_effective_password
from app.routers import (
    api_scales,
    api_measurements,
    api_medications,
    api_injections,
    api_purchases,
    api_side_effects,
    api_analytics,
    api_export,
    api_photos,
    api_nutrition
)

# Initialize database tables & seed data on startup
init_db()

app = FastAPI(
    title="GLP-1 Weight Journey Tracker",
    description="Minimalist, functional web application for tracking weight loss journeys using GLP-1 medications.",
    version="1.0.0"
)

BASE_DIR = Path(__file__).resolve().parent

# Mount persistent photos directory before general static files
app.mount("/static/uploads/photos", StaticFiles(directory=str(PHOTOS_DIR)), name="photos_uploads")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# Include API Routers
app.include_router(api_scales.router)
app.include_router(api_measurements.router)
app.include_router(api_medications.router)
app.include_router(api_injections.router)
app.include_router(api_purchases.router)
app.include_router(api_side_effects.router)
app.include_router(api_analytics.router)
app.include_router(api_export.router)
app.include_router(api_photos.router)
app.include_router(api_nutrition.router)

class LoginRequest(BaseModel):
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@app.get("/health")
def health_check():
    return {"status": "ok", "app": "glp1-tracker", "port": PORT}

@app.post("/api/auth/login")
def login(payload: LoginRequest, response: Response):
    eff_pw = get_effective_password().strip()
    entered_pw = (payload.password or "").strip()
    print(f"[AUTH DEBUG] login attempt: entered_pw='{entered_pw}', eff_pw='{eff_pw}'", flush=True)
    
    if entered_pw == eff_pw:
        token = create_session_token()
        response.set_cookie(
            key="session",
            value=token,
            httponly=True,
            samesite="lax",
            max_age=86400 * 30
        )
        return {"success": True, "message": "Authenticated"}
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")

@app.post("/api/auth/change-password")
def change_password(payload: ChangePasswordRequest, request: Request):
    token = request.cookies.get("session")
    if not verify_session_token(token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    
    eff_pw = get_effective_password()
    cur_pw = (payload.current_password or "").strip()
    if cur_pw != eff_pw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password incorrect")
    
    new_pw = payload.new_password.strip()
    if not new_pw or len(new_pw) < 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be at least 3 characters")
    
    from app.database import db_context
    with db_context() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('app_password', ?);", (new_pw,))
    
    return {"success": True, "message": "Application password updated successfully"}

@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie("session")
    return {"success": True, "message": "Logged out"}

@app.get("/api/auth/status")
def auth_status(request: Request):
    token = request.cookies.get("session")
    is_auth = verify_session_token(token)
    return {"authenticated": is_auth}

@app.get("/", response_class=HTMLResponse)
def index_page(request: Request):
    return templates.TemplateResponse("index.html", {"request": request, "port": PORT})

@app.get("/nutrition", response_class=HTMLResponse)
def nutrition_page(request: Request):
    return templates.TemplateResponse("nutrition.html", {"request": request, "port": PORT})

@app.get("/clinical-summary", response_class=HTMLResponse)
def clinical_summary_page(request: Request):
    from app.database import db_context
    from app.routers.api_analytics import get_dashboard_data
    from app.routers.api_injections import SITE_LABELS
    from datetime import datetime
    
    with db_context() as conn:
        dash = get_dashboard_data(scale_id=0, window_days=30, db=conn)
        
        cursor = conn.cursor()
        cursor.execute("""
        SELECT i.id, i.dosage_mg, i.timestamp, i.site, i.notes, m.name as medication_name
        FROM injections i
        LEFT JOIN medications m ON i.medication_id = m.id
        ORDER BY i.timestamp DESC LIMIT 20;
        """)
        inj_rows = [dict(r) for r in cursor.fetchall()]
        for r in inj_rows:
            r["site_label"] = SITE_LABELS.get(r["site"], r["site"])

        cursor.execute("""
        SELECT timestamp, symptom_name, severity, notes
        FROM side_effects
        ORDER BY timestamp DESC LIMIT 20;
        """)
        se_rows = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM concomitant_medications WHERE is_active = 1 ORDER BY name ASC;")
        concomitant_rows = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM lab_results ORDER BY timestamp DESC LIMIT 10;")
        lab_rows = [dict(r) for r in cursor.fetchall()]

    context = {
        "request": request,
        "current_date": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "user_name": dash.get("user_name", "Patient"),
        "user_dob": dash.get("user_dob", ""),
        "physician_name": dash.get("physician_name", ""),
        "medical_conditions": dash.get("medical_conditions", ""),
        "user_height_cm": dash.get("user_height_cm", 175.0),
        "user_gender": dash.get("user_gender", "unspecified"),
        "start_weight_kg": dash.get("start_weight_kg"),
        "current_weight_kg": dash.get("current_weight_kg"),
        "total_lost_kg": dash.get("total_lost_kg", 0.0),
        "target_weight_kg": dash.get("target_weight_kg", 165.0),
        "weight_to_goal_kg": dash.get("weight_to_goal_kg", 0.0),
        "projections": dash.get("projections", {}),
        "pk": dash.get("pharmacokinetics", {}),
        "plateau": dash.get("plateau_analysis", {}),
        "body_ratios": dash.get("body_ratios", {}),
        "injections": inj_rows,
        "side_effects": se_rows,
        "concomitant_meds": concomitant_rows,
        "labs": lab_rows
    }
    return templates.TemplateResponse("clinical_summary.html", context)

