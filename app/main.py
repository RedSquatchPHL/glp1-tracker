from fastapi import FastAPI, Request, HTTPException, Depends, status, Response
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
from pydantic import BaseModel

from app.config import PORT, APP_PASSWORD, SECRET_KEY
from app.database import init_db
from app.auth import create_session_token, verify_session_token
from app.routers import (
    api_scales,
    api_measurements,
    api_medications,
    api_injections,
    api_purchases,
    api_side_effects,
    api_analytics,
    api_export
)

# Initialize database tables & seed data on startup
init_db()

app = FastAPI(
    title="GLP-1 Weight Journey Tracker",
    description="Minimalist, functional web application for tracking weight loss journeys using GLP-1 medications.",
    version="1.0.0"
)

BASE_DIR = Path(__file__).resolve().parent
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

class LoginRequest(BaseModel):
    password: str

@app.get("/health")
def health_check():
    return {"status": "ok", "app": "glp1-tracker", "port": PORT}

@app.post("/api/auth/login")
def login(payload: LoginRequest, response: Response):
    if payload.password == APP_PASSWORD:
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
