from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/nutrition", tags=["Nutrition"])

DEFAULT_HYDRATION_GOAL_OZ = 64.0


class ProteinLogCreate(BaseModel):
    timestamp: str  # ISO format YYYY-MM-DDTHH:MM
    protein_grams: float
    notes: Optional[str] = ""


class ProteinLogUpdate(BaseModel):
    timestamp: Optional[str] = None
    protein_grams: Optional[float] = None
    notes: Optional[str] = None


class HydrationLogCreate(BaseModel):
    timestamp: str
    ounces: float
    notes: Optional[str] = ""


class HydrationLogUpdate(BaseModel):
    timestamp: Optional[str] = None
    ounces: Optional[float] = None
    notes: Optional[str] = None


class HydrationGoalSet(BaseModel):
    date: str  # YYYY-MM-DD
    goal_oz: float


# ── Protein ──────────────────────────────────────────────────────────────

@router.get("/protein")
def list_protein_logs(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: Optional[int] = Query(200),
    db=Depends(get_db),
):
    cursor = db.cursor()
    conditions = []
    params = []
    if start_date:
        conditions.append("timestamp >= ?")
        params.append(start_date)
    if end_date:
        conditions.append("timestamp <= ?")
        params.append(end_date + "T23:59:59")
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)
    cursor.execute(f"SELECT * FROM protein_logs {where} ORDER BY timestamp DESC LIMIT ?;", params)
    return [dict(r) for r in cursor.fetchall()]


@router.post("/protein", status_code=201)
def create_protein_log(payload: ProteinLogCreate, db=Depends(get_db), user=Depends(get_current_user)):
    if payload.protein_grams < 0:
        raise HTTPException(status_code=400, detail="protein_grams cannot be negative")
    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO protein_logs (timestamp, protein_grams, notes) VALUES (?, ?, ?);",
        (payload.timestamp, payload.protein_grams, payload.notes or ""),
    )
    log_id = cursor.lastrowid
    db.commit()
    return {"id": log_id, "message": "Protein entry logged"}


@router.put("/protein/{log_id}")
def update_protein_log(log_id: int, payload: ProteinLogUpdate, db=Depends(get_db), user=Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM protein_logs WHERE id = ?;", (log_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Protein entry not found")

    ts = payload.timestamp if payload.timestamp is not None else row["timestamp"]
    grams = payload.protein_grams if payload.protein_grams is not None else row["protein_grams"]
    notes = payload.notes if payload.notes is not None else row["notes"]
    if grams < 0:
        raise HTTPException(status_code=400, detail="protein_grams cannot be negative")

    cursor.execute(
        "UPDATE protein_logs SET timestamp = ?, protein_grams = ?, notes = ? WHERE id = ?;",
        (ts, grams, notes, log_id),
    )
    db.commit()
    return {"id": log_id, "message": "Protein entry updated"}


@router.delete("/protein/{log_id}")
def delete_protein_log(log_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("DELETE FROM protein_logs WHERE id = ?;", (log_id,))
    db.commit()
    return {"message": f"Protein entry {log_id} deleted"}


# ── Hydration ────────────────────────────────────────────────────────────

@router.get("/hydration")
def list_hydration_logs(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: Optional[int] = Query(200),
    db=Depends(get_db),
):
    cursor = db.cursor()
    conditions = []
    params = []
    if start_date:
        conditions.append("timestamp >= ?")
        params.append(start_date)
    if end_date:
        conditions.append("timestamp <= ?")
        params.append(end_date + "T23:59:59")
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)
    cursor.execute(f"SELECT * FROM hydration_logs {where} ORDER BY timestamp DESC LIMIT ?;", params)
    return [dict(r) for r in cursor.fetchall()]


@router.post("/hydration", status_code=201)
def create_hydration_log(payload: HydrationLogCreate, db=Depends(get_db), user=Depends(get_current_user)):
    if payload.ounces < 0:
        raise HTTPException(status_code=400, detail="ounces cannot be negative")
    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO hydration_logs (timestamp, ounces, notes) VALUES (?, ?, ?);",
        (payload.timestamp, payload.ounces, payload.notes or ""),
    )
    log_id = cursor.lastrowid
    db.commit()
    return {"id": log_id, "message": "Hydration entry logged"}


@router.put("/hydration/{log_id}")
def update_hydration_log(log_id: int, payload: HydrationLogUpdate, db=Depends(get_db), user=Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM hydration_logs WHERE id = ?;", (log_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Hydration entry not found")

    ts = payload.timestamp if payload.timestamp is not None else row["timestamp"]
    oz = payload.ounces if payload.ounces is not None else row["ounces"]
    notes = payload.notes if payload.notes is not None else row["notes"]
    if oz < 0:
        raise HTTPException(status_code=400, detail="ounces cannot be negative")

    cursor.execute(
        "UPDATE hydration_logs SET timestamp = ?, ounces = ?, notes = ? WHERE id = ?;",
        (ts, oz, notes, log_id),
    )
    db.commit()
    return {"id": log_id, "message": "Hydration entry updated"}


@router.delete("/hydration/{log_id}")
def delete_hydration_log(log_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    cursor = db.cursor()
    cursor.execute("DELETE FROM hydration_logs WHERE id = ?;", (log_id,))
    db.commit()
    return {"message": f"Hydration entry {log_id} deleted"}


# ── Hydration goal ───────────────────────────────────────────────────────

@router.get("/hydration-goal/{date}")
def get_hydration_goal(date: str, db=Depends(get_db)):
    """Returns the goal set for this exact date, or the most recently set
    goal on or before it (a goal persists until changed), or the app default
    if none has ever been set."""
    cursor = db.cursor()
    cursor.execute(
        "SELECT goal_oz, date FROM daily_hydration_goals WHERE date <= ? ORDER BY date DESC LIMIT 1;",
        (date,),
    )
    row = cursor.fetchone()
    if row:
        return {"date": date, "goal_oz": row["goal_oz"], "set_on": row["date"]}
    return {"date": date, "goal_oz": DEFAULT_HYDRATION_GOAL_OZ, "set_on": None}


@router.put("/hydration-goal")
def set_hydration_goal(payload: HydrationGoalSet, db=Depends(get_db), user=Depends(get_current_user)):
    if payload.goal_oz <= 0:
        raise HTTPException(status_code=400, detail="goal_oz must be positive")
    cursor = db.cursor()
    cursor.execute(
        """
        INSERT INTO daily_hydration_goals (date, goal_oz) VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET goal_oz = excluded.goal_oz, updated_at = CURRENT_TIMESTAMP;
        """,
        (payload.date, payload.goal_oz),
    )
    db.commit()
    return {"date": payload.date, "goal_oz": payload.goal_oz, "message": "Hydration goal saved"}


# ── Chart data ───────────────────────────────────────────────────────────

@router.get("/summary")
def get_nutrition_summary(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db=Depends(get_db),
):
    """Daily totals for protein + hydration across the range, plus the goal
    in effect each day — exactly what the Chart.js trend charts consume."""
    cursor = db.cursor()

    cursor.execute(
        """
        SELECT date(timestamp) as day, SUM(protein_grams) as total_protein_grams
        FROM protein_logs
        WHERE date(timestamp) >= ? AND date(timestamp) <= ?
        GROUP BY day;
        """,
        (start_date, end_date),
    )
    protein_by_day = {r["day"]: r["total_protein_grams"] for r in cursor.fetchall()}

    cursor.execute(
        """
        SELECT date(timestamp) as day, SUM(ounces) as total_ounces
        FROM hydration_logs
        WHERE date(timestamp) >= ? AND date(timestamp) <= ?
        GROUP BY day;
        """,
        (start_date, end_date),
    )
    hydration_by_day = {r["day"]: r["total_ounces"] for r in cursor.fetchall()}

    # All goals set on or before end_date, so "most recent goal as of day X"
    # can be resolved for every day in the range without one query per day.
    cursor.execute(
        "SELECT date, goal_oz FROM daily_hydration_goals WHERE date <= ? ORDER BY date ASC;",
        (end_date,),
    )
    goal_rows = [dict(r) for r in cursor.fetchall()]

    def goal_as_of(day: str) -> float:
        current = DEFAULT_HYDRATION_GOAL_OZ
        for g in goal_rows:
            if g["date"] <= day:
                current = g["goal_oz"]
            else:
                break
        return current

    days = []
    cursor_date = datetime.fromisoformat(start_date)
    end = datetime.fromisoformat(end_date)
    while cursor_date <= end:
        day_str = cursor_date.strftime("%Y-%m-%d")
        days.append({
            "date": day_str,
            "protein_grams": protein_by_day.get(day_str, 0) or 0,
            "hydration_oz": hydration_by_day.get(day_str, 0) or 0,
            "hydration_goal_oz": goal_as_of(day_str),
        })
        cursor_date += timedelta(days=1)

    return {"days": days}
