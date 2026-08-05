import json
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

def calculate_moving_averages(data_points: List[Dict[str, Any]], key: str = "weight_kg") -> List[Dict[str, Any]]:
    """
    Given sorted measurement dicts (by timestamp ascending), calculate 7-day and 14-day moving averages.
    First aggregates multiple entries on the same date by taking the mean.
    """
    if not data_points:
        return []

    # Group by date YYYY-MM-DD
    daily_map = {}
    for pt in data_points:
        ts_str = pt.get("timestamp", "")
        if not ts_str:
            continue
        date_str = ts_str.split("T")[0]
        data = pt.get("data", {})
        val = data.get(key)
        if val is not None and isinstance(val, (int, float)):
            if date_str not in daily_map:
                daily_map[date_str] = []
            daily_map[date_str].append(float(val))

    if not daily_map:
        return []

    # Sort unique dates
    sorted_dates = sorted(daily_map.keys())
    daily_series = []
    for d in sorted_dates:
        vals = daily_map[d]
        avg_val = round(sum(vals) / len(vals), 2)
        dt = datetime.strptime(d, "%Y-%m-%d")
        daily_series.append({
            "date": d,
            "dt": dt,
            "val": avg_val
        })

    # Compute 7d and 14d moving averages
    result = []
    for i, item in enumerate(daily_series):
        current_dt = item["dt"]
        
        # 7d window
        window_7d = [s["val"] for s in daily_series if current_dt - timedelta(days=7) <= s["dt"] <= current_dt]
        ma_7d = round(sum(window_7d) / len(window_7d), 2) if window_7d else item["val"]

        # 14d window
        window_14d = [s["val"] for s in daily_series if current_dt - timedelta(days=14) <= s["dt"] <= current_dt]
        ma_14d = round(sum(window_14d) / len(window_14d), 2) if window_14d else item["val"]

        result.append({
            "date": item["date"],
            "raw_val": item["val"],
            "ma_7d": ma_7d,
            "ma_14d": ma_14d
        })

    return result

def calculate_linear_projections(
    measurements: List[Dict[str, Any]], 
    target_weight_kg: float = 75.0, 
    window_days: int = 30
) -> Dict[str, Any]:
    """
    Perform linear regression on historical measurements over window_days (or total if window_days=0).
    Predict target goal weight reach date & muscle-to-fat loss protection ratio.
    """
    if not measurements:
        return {
            "window_days": window_days,
            "rate_kg_per_week": 0.0,
            "projected_goal_date": None,
            "days_to_goal": None,
            "lean_mass_warning": False,
            "muscle_loss_ratio_pct": 0.0,
            "total_weight_change": 0.0,
            "total_fat_change": 0.0,
            "total_muscle_change": 0.0,
            "warning_message": None
        }

    # Extract valid weight points
    parsed_points = []
    for m in measurements:
        ts_str = m.get("timestamp", "")
        data = m.get("data", {})
        w = data.get("weight_kg")
        fat_pct = data.get("body_fat_pct")
        muscle_kg = data.get("muscle_mass_kg")
        
        if ts_str and w is not None:
            try:
                # Handle ISO timestamps with or without seconds
                dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                parsed_points.append({
                    "dt": dt,
                    "timestamp": ts_str,
                    "weight_kg": float(w),
                    "fat_pct": float(fat_pct) if fat_pct is not None else None,
                    "muscle_kg": float(muscle_kg) if muscle_kg is not None else None,
                })
            except ValueError:
                continue

    parsed_points.sort(key=lambda x: x["dt"])

    if not parsed_points:
        return {
            "window_days": window_days,
            "rate_kg_per_week": 0.0,
            "projected_goal_date": None,
            "days_to_goal": None,
            "lean_mass_warning": False,
            "muscle_loss_ratio_pct": 0.0,
            "warning_message": None
        }

    # Filter points according to window_days
    latest_dt = parsed_points[-1]["dt"]
    if window_days > 0:
        cutoff_dt = latest_dt - timedelta(days=window_days)
        filtered_points = [p for p in parsed_points if p["dt"] >= cutoff_dt]
        if len(filtered_points) < 2:
            filtered_points = parsed_points # fallback to total
    else:
        filtered_points = parsed_points

    # Ordinary Least Squares (OLS) Linear Regression for Weight
    # x = days from start_dt
    start_dt = filtered_points[0]["dt"]
    xs = [(p["dt"] - start_dt).total_seconds() / 86400.0 for p in filtered_points]
    ys = [p["weight_kg"] for p in filtered_points]

    n = len(xs)
    if n < 2 or max(xs) == min(xs):
        return {
            "window_days": window_days,
            "rate_kg_per_week": 0.0,
            "projected_goal_date": None,
            "days_to_goal": None,
            "lean_mass_warning": False,
            "muscle_loss_ratio_pct": 0.0,
            "warning_message": "Insufficient date spread for projection calculation."
        }

    mean_x = sum(xs) / n
    mean_y = sum(ys) / n

    numerator = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
    denominator = sum((xs[i] - mean_x) ** 2 for i in range(n))

    slope_kg_per_day = numerator / denominator if denominator != 0 else 0.0
    slope_kg_per_week = round(slope_kg_per_day * 7.0, 2)

    current_weight = filtered_points[-1]["weight_kg"]
    weight_diff_to_target = target_weight_kg - current_weight

    projected_goal_date = None
    days_to_goal = None

    if slope_kg_per_day < 0 and weight_diff_to_target < 0: # Losing weight towards target
        days_to_goal = int(round(weight_diff_to_target / slope_kg_per_day))
        projected_goal_dt = latest_dt + timedelta(days=days_to_goal)
        projected_goal_date = projected_goal_dt.strftime("%Y-%m-%d")
    elif current_weight <= target_weight_kg:
        projected_goal_date = "Goal Reached!"
        days_to_goal = 0

    # Lean Mass Protection Check
    # Examine change in muscle vs total weight loss in window
    first_pt = filtered_points[0]
    last_pt = filtered_points[-1]

    total_weight_change = round(last_pt["weight_kg"] - first_pt["weight_kg"], 2)
    
    # Calculate muscle loss ratio if muscle data is available
    muscle_loss_ratio_pct = 0.0
    lean_mass_warning = False
    warning_message = None

    if first_pt["muscle_kg"] is not None and last_pt["muscle_kg"] is not None:
        first_muscle = first_pt["muscle_kg"]
        last_muscle = last_pt["muscle_kg"]
        total_muscle_change = round(last_muscle - first_muscle, 2)
        
        # If user is losing weight overall (weight change < 0) and losing muscle (muscle change < 0)
        if total_weight_change < -0.5 and total_muscle_change < 0:
            muscle_loss_kg = abs(total_muscle_change)
            weight_loss_kg = abs(total_weight_change)
            muscle_loss_ratio = muscle_loss_kg / weight_loss_kg
            muscle_loss_ratio_pct = round(muscle_loss_ratio * 100.0, 1)

            if muscle_loss_ratio > 0.25: # More than 25% of weight lost is muscle
                lean_mass_warning = True
                warning_message = (
                    f"Warning: {muscle_loss_ratio_pct}% of your weight loss over the past {window_days or 'all'} "
                    f"days was muscle mass ({abs(total_muscle_change)} kg lost). "
                    f"Consider increasing protein intake and incorporating resistance training."
                )

    return {
        "window_days": window_days,
        "current_weight_kg": current_weight,
        "target_weight_kg": target_weight_kg,
        "rate_kg_per_week": slope_kg_per_week,
        "rate_kg_per_day": round(slope_kg_per_day, 3),
        "projected_goal_date": projected_goal_date,
        "days_to_goal": days_to_goal,
        "total_weight_change": total_weight_change,
        "lean_mass_warning": lean_mass_warning,
        "muscle_loss_ratio_pct": muscle_loss_ratio_pct,
        "warning_message": warning_message
    }
