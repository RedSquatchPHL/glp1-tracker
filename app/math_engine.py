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
            "warning_message": "Insufficient date spread for projection calculation.",
            "prognosis": {
                "in_7d_kg": round(parsed_points[-1]["weight_kg"], 1),
                "in_14d_kg": round(parsed_points[-1]["weight_kg"], 1),
                "in_30d_kg": round(parsed_points[-1]["weight_kg"], 1),
                "in_90d_kg": round(parsed_points[-1]["weight_kg"], 1)
            }
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

    # Weight prognosis (7, 14, 30, 90 days out)
    prog_7d = round(current_weight + (slope_kg_per_day * 7), 1) if current_weight is not None else None
    prog_14d = round(current_weight + (slope_kg_per_day * 14), 1) if current_weight is not None else None
    prog_30d = round(current_weight + (slope_kg_per_day * 30), 1) if current_weight is not None else None
    prog_90d = round(current_weight + (slope_kg_per_day * 90), 1) if current_weight is not None else None

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
        "warning_message": warning_message,
        "prognosis": {
            "in_7d_kg": prog_7d,
            "in_14d_kg": prog_14d,
            "in_30d_kg": prog_30d,
            "in_90d_kg": prog_90d
        }
    }


def get_drug_half_life(active_ingredient: Optional[str], medication_name: Optional[str] = "") -> float:
    """
    Returns elimination half-life in days based on drug active ingredient or name.
    Default: 7.0 days for Semaglutide (Wegovy/Ozempic), 5.0 days for Tirzepatide (Mounjaro/Zepbound).
    """
    text = (str(active_ingredient or "") + " " + str(medication_name or "")).lower()
    if "tirzepatide" in text or "mounjaro" in text or "zepbound" in text:
        return 5.0
    elif "semaglutide" in text or "wegovy" in text or "ozempic" in text:
        return 7.0
    elif "liraglutide" in text or "saxenda" in text or "victoza" in text:
        return 0.55
    elif "retatrutide" in text:
        return 6.0
    return 7.0


def calculate_pharmacokinetics(injections: List[Dict[str, Any]], days_ahead: int = 14) -> Dict[str, Any]:
    """
    Mathematical modeling of active drug concentration in bloodstream based on historical injection dates,
    doses (mg), and drug-specific elimination half-lives.
    Formula: C(t) = Sum [ Dose_i * (0.5 ** ((t - t_i) / half_life)) ] for t >= t_i.
    """
    if not injections:
        return {
            "current_active_mg": 0.0,
            "peak_active_mg": 0.0,
            "half_life_days": 7.0,
            "primary_medication": "None",
            "steady_state_ratio": 0.0,
            "series": []
        }

    parsed_injections = []
    for inj in injections:
        ts_str = inj.get("timestamp", "")
        dose = inj.get("dosage_mg")
        med_name = inj.get("medication_name", "GLP-1")
        active_ing = inj.get("active_ingredient", "")
        
        if ts_str and dose is not None and float(dose) > 0:
            try:
                dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).replace(tzinfo=None)
                hl = get_drug_half_life(active_ing, med_name)
                parsed_injections.append({
                    "dt": dt,
                    "date_str": dt.strftime("%Y-%m-%d"),
                    "dosage_mg": float(dose),
                    "half_life_days": hl,
                    "medication_name": med_name
                })
            except Exception:
                continue

    parsed_injections.sort(key=lambda x: x["dt"])

    if not parsed_injections:
        return {
            "current_active_mg": 0.0,
            "peak_active_mg": 0.0,
            "half_life_days": 7.0,
            "primary_medication": "None",
            "steady_state_ratio": 0.0,
            "series": []
        }

    # Generate daily time grid from first injection to today + days_ahead
    start_dt = parsed_injections[0]["dt"].replace(hour=0, minute=0, second=0, microsecond=0)
    today_dt = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    end_dt = max(parsed_injections[-1]["dt"], today_dt) + timedelta(days=days_ahead)

    series = []
    curr_dt = start_dt
    
    # Map doses to dates for quick overlay lookup
    dose_by_date = {}
    for inj in parsed_injections:
        d_str = inj["date_str"]
        dose_by_date[d_str] = dose_by_date.get(d_str, 0.0) + inj["dosage_mg"]

    primary_hl = parsed_injections[-1]["half_life_days"]
    primary_med = parsed_injections[-1]["medication_name"]
    last_dose_mg = parsed_injections[-1]["dosage_mg"]

    max_active = 0.0
    current_active = 0.0

    while curr_dt <= end_dt:
        date_str = curr_dt.strftime("%Y-%m-%d")
        total_active_mg = 0.0

        for inj in parsed_injections:
            if curr_dt >= inj["dt"].replace(hour=0, minute=0, second=0, microsecond=0):
                days_elapsed = (curr_dt - inj["dt"]).total_seconds() / 86400.0
                if days_elapsed >= 0:
                    hl = inj["half_life_days"]
                    remaining_mg = inj["dosage_mg"] * (0.5 ** (days_elapsed / hl))
                    total_active_mg += remaining_mg

        total_active_mg = round(total_active_mg, 3)
        if total_active_mg > max_active:
            max_active = total_active_mg

        if date_str == today_dt.strftime("%Y-%m-%d"):
            current_active = total_active_mg

        series.append({
            "date": date_str,
            "active_mg": total_active_mg,
            "dose_event_mg": dose_by_date.get(date_str)
        })

        curr_dt += timedelta(days=1)

    steady_state_ratio = round(current_active / last_dose_mg, 2) if last_dose_mg > 0 else 0.0

    return {
        "current_active_mg": round(current_active, 2),
        "peak_active_mg": round(max_active, 2),
        "half_life_days": primary_hl,
        "primary_medication": primary_med,
        "last_dose_mg": last_dose_mg,
        "steady_state_ratio": steady_state_ratio,
        "series": series
    }


def calculate_body_ratios(
    waist_cm: Optional[float], 
    hip_cm: Optional[float], 
    height_cm: Optional[float] = 175.0, 
    gender: str = "unspecified"
) -> Dict[str, Any]:
    """
    Computes Waist-to-Height Ratio (WHtR) & Waist-to-Hip Ratio (WHR) alongside cardiometabolic risk scores.
    """
    whtr = None
    whtr_status = "N/A"
    whr = None
    whr_status = "N/A"
    overall_risk = "Low Risk"

    if waist_cm and height_cm and height_cm > 0:
        whtr = round(waist_cm / height_cm, 3)
        if whtr < 0.40:
            whtr_status = "Underweight / Low Risk"
        elif 0.40 <= whtr <= 0.49:
            whtr_status = "Healthy / Normal Risk"
        elif 0.50 <= whtr <= 0.59:
            whtr_status = "Increased Cardiometabolic Risk"
            overall_risk = "Increased Risk"
        else:
            whtr_status = "High Cardiometabolic Risk"
            overall_risk = "High Risk"

    if waist_cm and hip_cm and hip_cm > 0:
        whr = round(waist_cm / hip_cm, 3)
        g_clean = str(gender).lower()
        if g_clean == "male":
            if whr < 0.90:
                whr_status = "Low Risk"
            elif 0.90 <= whr <= 0.99:
                whr_status = "Moderate Risk"
                if overall_risk != "High Risk": overall_risk = "Moderate Risk"
            else:
                whr_status = "High Risk"
                overall_risk = "High Risk"
        elif g_clean == "female":
            if whr < 0.80:
                whr_status = "Low Risk"
            elif 0.80 <= whr <= 0.89:
                whr_status = "Moderate Risk"
                if overall_risk != "High Risk": overall_risk = "Moderate Risk"
            else:
                whr_status = "High Risk"
                overall_risk = "High Risk"
        else:
            if whr < 0.85:
                whr_status = "Low Risk"
            elif 0.85 <= whr <= 0.95:
                whr_status = "Moderate Risk"
                if overall_risk != "High Risk": overall_risk = "Moderate Risk"
            else:
                whr_status = "High Risk"
                overall_risk = "High Risk"

    return {
        "waist_cm": waist_cm,
        "hip_cm": hip_cm,
        "height_cm": height_cm,
        "whtr": whtr,
        "whtr_status": whtr_status,
        "whr": whr,
        "whr_status": whr_status,
        "cardiometabolic_risk_score": overall_risk
    }


def detect_weight_plateau(
    measurements: List[Dict[str, Any]], 
    threshold_days: int = 14, 
    window_kg: float = 0.5
) -> Dict[str, Any]:
    """
    Automated Plateau Detection & Breakdown Engine:
    Identifies weight plateaus (weight fluctuating within +/-0.5 kg window over a 14-21 day threshold).
    Displays diagnostic insights distinguishing fat loss vs. muscle gain or fluid retention (ICW/ECW shifts).
    """
    if not measurements:
        return {
            "is_plateau": False,
            "duration_days": 0,
            "weight_range_kg": 0.0,
            "diagnostic_type": "No Data",
            "diagnostic_insight": "Insufficient measurement history to evaluate weight plateaus.",
            "recommendation": "Continue logging weight daily to enable plateau detection."
        }

    # Extract clean points with dates and measurements
    valid_points = []
    for m in measurements:
        ts_str = m.get("timestamp", "")
        data = m.get("data", {})
        w = data.get("weight_kg")
        fat_pct = data.get("body_fat_pct")
        muscle_kg = data.get("muscle_mass_kg")
        ecw = data.get("ecw_l") or data.get("body_water_pct")

        if ts_str and w is not None:
            try:
                dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).replace(tzinfo=None)
                valid_points.append({
                    "dt": dt,
                    "weight_kg": float(w),
                    "fat_pct": float(fat_pct) if fat_pct is not None else None,
                    "muscle_kg": float(muscle_kg) if muscle_kg is not None else None,
                    "ecw": float(ecw) if ecw is not None else None
                })
            except Exception:
                continue

    valid_points.sort(key=lambda x: x["dt"])

    if len(valid_points) < 3:
        return {
            "is_plateau": False,
            "duration_days": 0,
            "weight_range_kg": 0.0,
            "diagnostic_type": "Insufficient Data",
            "diagnostic_insight": "At least 3 measurement entries required for automated plateau detection.",
            "recommendation": "Keep recording weight readings to track steady-state dynamics."
        }

    latest_dt = valid_points[-1]["dt"]
    cutoff_dt = latest_dt - timedelta(days=21)
    
    recent_points = [p for p in valid_points if p["dt"] >= cutoff_dt]
    if len(recent_points) < 3:
        recent_points = valid_points[-5:] # fallback to recent 5

    weights = [p["weight_kg"] for p in recent_points]
    min_w = min(weights)
    max_w = max(weights)
    weight_range = round(max_w - min_w, 2)
    mean_w = round(sum(weights) / len(weights), 2)
    
    first_pt = recent_points[0]
    last_pt = recent_points[-1]
    span_days = int((last_pt["dt"] - first_pt["dt"]).total_seconds() / 86400.0)

    # Check if weight fluctuates within +/- 0.5 kg window (total spread <= 1.0 kg) over >= 14 days
    is_plateau = (weight_range <= (window_kg * 2.0)) and (span_days >= threshold_days)

    if not is_plateau:
        return {
            "is_plateau": False,
            "duration_days": span_days,
            "weight_range_kg": weight_range,
            "diagnostic_type": "Weight Loss Active",
            "diagnostic_insight": f"Weight loss trend active. Weight spread over the past {span_days} days is {weight_range} kg.",
            "recommendation": "Your weight is progressing outside a plateau window."
        }

    # Diagnostic Breakdown
    fat_diff = (last_pt["fat_pct"] - first_pt["fat_pct"]) if (last_pt["fat_pct"] is not None and first_pt["fat_pct"] is not None) else None
    muscle_diff = (last_pt["muscle_kg"] - first_pt["muscle_kg"]) if (last_pt["muscle_kg"] is not None and first_pt["muscle_kg"] is not None) else None
    ecw_diff = (last_pt["ecw"] - first_pt["ecw"]) if (last_pt["ecw"] is not None and first_pt["ecw"] is not None) else None

    diagnostic_type = "Metabolic Plateau"
    insight = (
        f"Weight has remained flat within a ±{round(weight_range/2, 2)} kg window for {span_days} days. "
        f"Scale weight is stabilized around {mean_w} kg."
    )
    recommendation = "Consider reviewing caloric intake, strength training stimulus, or discussing dose progression with your provider."

    if fat_diff is not None and fat_diff <= -0.3:
        diagnostic_type = "Body Recomposition (Fat Loss Active)"
        insight = (
            f"Weight is flat ({weight_range} kg spread over {span_days} days), BUT body fat percentage dropped by "
            f"{abs(round(fat_diff, 1))}%. Fat loss is actively continuing while muscle gain or glycogen/water shifts mask scale weight loss."
        )
        recommendation = "Recomposition detected! Pay attention to body measurements and waist metrics rather than scale weight."
    elif ecw_diff is not None and ecw_diff > 0.2:
        diagnostic_type = "Fluid Retention / Water Shift"
        insight = (
            f"Weight is flat over {span_days} days, with extracellular water / fluid increase detected (+{round(ecw_diff, 1)} L/%). "
            f"Transient fluid retention is masking active adipose fat reduction."
        )
        recommendation = "Maintain proper hydration and sodium balance. Fluid shifts usually resolve over 3-7 days."

    return {
        "is_plateau": True,
        "duration_days": span_days,
        "weight_range_kg": weight_range,
        "mean_weight_kg": mean_w,
        "diagnostic_type": diagnostic_type,
        "diagnostic_insight": insight,
        "recommendation": recommendation
    }

