import os
from pathlib import Path

PORT = int(os.getenv("PORT", "9374"))
APP_PASSWORD = os.getenv("APP_PASSWORD", "admin")
SECRET_KEY = os.getenv("SECRET_KEY", "glp1-tracker-secret-key-2026-production")
DATA_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
DATABASE_FILE = Path(os.getenv("DATABASE_FILE", str(DATA_DIR / "glp1_tracker.db")))

# Ensure data directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)
