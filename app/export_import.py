import json
import csv
import io
from sqlite3 import Connection
from typing import Dict, Any

def export_full_json(conn: Connection) -> Dict[str, Any]:
    cursor = conn.cursor()
    
    # Export all tables
    tables = [
        "scales", "metrics_definitions", "scale_metrics",
        "measurements", "medications", "injections",
        "purchases", "side_effects", "user_settings", "progress_photos"
    ]
    
    export_data = {
        "version": "1.0",
        "exported_at": conn.execute("SELECT CURRENT_TIMESTAMP").fetchone()[0]
    }
    
    for table in tables:
        cursor.execute(f"SELECT * FROM {table};")
        rows = [dict(r) for r in cursor.fetchall()]
        export_data[table] = rows
        
    return export_data

def export_measurements_csv(conn: Connection) -> str:
    cursor = conn.cursor()
    cursor.execute("""
    SELECT m.id, m.timestamp, s.name as scale_name, m.notes, m.data_json
    FROM measurements m
    LEFT JOIN scales s ON m.scale_id = s.id
    ORDER BY m.timestamp ASC;
    """)
    rows = cursor.fetchall()
    
    # Discover all distinct metric keys across measurements
    metric_keys = set()
    parsed_rows = []
    for r in rows:
        r_dict = dict(r)
        data = json.loads(r_dict["data_json"]) if r_dict.get("data_json") else {}
        for k in data.keys():
            metric_keys.add(k)
        r_dict["data"] = data
        parsed_rows.append(r_dict)
        
    sorted_metric_keys = sorted(list(metric_keys))
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    headers = ["id", "timestamp", "scale_name", "notes"] + sorted_metric_keys
    writer.writerow(headers)
    
    for pr in parsed_rows:
        row_values = [
            pr["id"],
            pr["timestamp"],
            pr["scale_name"] or "Default",
            pr["notes"] or ""
        ]
        for mk in sorted_metric_keys:
            row_values.append(pr["data"].get(mk, ""))
        writer.writerow(row_values)
        
    return output.getvalue()

def import_full_json(conn: Connection, payload: Dict[str, Any], overwrite: bool = False) -> Dict[str, int]:
    cursor = conn.cursor()
    counts = {}
    
    if overwrite:
        tables = [
            "progress_photos", "side_effects", "purchases", "injections", "measurements",
            "scale_metrics", "metrics_definitions", "scales", "medications", "user_settings"
        ]
        for t in tables:
            cursor.execute(f"DELETE FROM {t};")

    # Import scales
    scales = payload.get("scales", [])
    s_count = 0
    for s in scales:
        cursor.execute("""
        INSERT OR REPLACE INTO scales (id, name, description, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?);
        """, (s.get("id"), s["name"], s.get("description"), s.get("is_active", 1), s.get("created_at"), s.get("updated_at")))
        s_count += 1
    counts["scales"] = s_count

    # Import metrics_definitions
    metrics = payload.get("metrics_definitions", [])
    m_count = 0
    for m in metrics:
        cursor.execute("""
        INSERT OR REPLACE INTO metrics_definitions (id, key, label, unit, category, is_custom, is_active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, (m.get("id"), m["key"], m["label"], m["unit"], m.get("category", "body_comp"), m.get("is_custom", 0), m.get("is_active", 1), m.get("sort_order", 0)))
        m_count += 1
    counts["metrics_definitions"] = m_count

    # Import scale_metrics
    sm_list = payload.get("scale_metrics", [])
    sm_count = 0
    for sm in sm_list:
        cursor.execute("""
        INSERT OR IGNORE INTO scale_metrics (scale_id, metric_key)
        VALUES (?, ?);
        """, (sm["scale_id"], sm["metric_key"]))
        sm_count += 1
    counts["scale_metrics"] = sm_count

    # Import medications
    meds = payload.get("medications", [])
    med_count = 0
    for md in meds:
        cursor.execute("""
        INSERT OR REPLACE INTO medications (id, name, active_ingredient, dosage_steps_json, form, notes, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, (md.get("id"), md["name"], md.get("active_ingredient"), md.get("dosage_steps_json", "[]"), md.get("form", "subcutaneous_pen"), md.get("notes"), md.get("is_active", 1), md.get("created_at")))
        med_count += 1
    counts["medications"] = med_count

    # Import measurements
    meas = payload.get("measurements", [])
    meas_count = 0
    for ms in meas:
        data_json = ms.get("data_json")
        if not data_json and "data" in ms:
            data_json = json.dumps(ms["data"])
        cursor.execute("""
        INSERT OR REPLACE INTO measurements (id, scale_id, timestamp, notes, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?);
        """, (ms.get("id"), ms.get("scale_id"), ms["timestamp"], ms.get("notes"), data_json or "{}", ms.get("created_at"), ms.get("updated_at")))
        meas_count += 1
    counts["measurements"] = meas_count

    # Import injections
    injs = payload.get("injections", [])
    inj_count = 0
    for ij in injs:
        cursor.execute("""
        INSERT OR REPLACE INTO injections (id, medication_id, dosage_mg, timestamp, site, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?);
        """, (ij.get("id"), ij["medication_id"], ij["dosage_mg"], ij["timestamp"], ij["site"], ij.get("notes"), ij.get("created_at")))
        inj_count += 1
    counts["injections"] = inj_count

    # Import purchases
    purchs = payload.get("purchases", [])
    pur_count = 0
    for p in purchs:
        cursor.execute("""
        INSERT OR REPLACE INTO purchases (id, medication_id, purchase_date, pack_size_doses, dose_mg, pharmacy_source, total_cost, currency, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (p.get("id"), p["medication_id"], p["purchase_date"], p.get("pack_size_doses", 4), p["dose_mg"], p.get("pharmacy_source"), p["total_cost"], p.get("currency", "$"), p.get("notes"), p.get("created_at")))
        pur_count += 1
    counts["purchases"] = pur_count

    # Import side effects
    ses = payload.get("side_effects", [])
    se_count = 0
    for se in ses:
        cursor.execute("""
        INSERT OR REPLACE INTO side_effects (id, timestamp, symptom_name, severity, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?);
        """, (se.get("id"), se["timestamp"], se["symptom_name"], se["severity"], se.get("notes"), se.get("created_at")))
        se_count += 1
    counts["side_effects"] = se_count

    # Import settings
    stgs = payload.get("user_settings", [])
    for st in stgs:
        cursor.execute("""
        INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?);
        """, (st["key"], st["value"]))

    # Import progress_photos
    photos = payload.get("progress_photos", [])
    ph_count = 0
    for ph in photos:
        cursor.execute("""
        INSERT OR REPLACE INTO progress_photos (id, timestamp, weight_kg, angle, image_path, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, (ph.get("id"), ph["timestamp"], ph.get("weight_kg"), ph.get("angle", "Front"), ph["image_path"], ph.get("notes"), ph.get("created_at"), ph.get("updated_at")))
        ph_count += 1
    counts["progress_photos"] = ph_count

    return counts

def import_measurements_csv(conn: Connection, csv_text: str) -> int:
    cursor = conn.cursor()
    reader = csv.DictReader(io.StringIO(csv_text))
    
    # Get standard non-metric field names
    fixed_fields = {"id", "timestamp", "scale_name", "scale_id", "notes"}
    
    # Get active scale map
    cursor.execute("SELECT id, name FROM scales;")
    scales_map = {r["name"].lower(): r["id"] for r in cursor.fetchall()}
    default_scale_id = list(scales_map.values())[0] if scales_map else 1
    
    count = 0
    for row in reader:
        ts = row.get("timestamp")
        if not ts:
            continue
            
        scale_name = (row.get("scale_name") or "").lower()
        scale_id = scales_map.get(scale_name, default_scale_id)
        notes = row.get("notes", "")
        
        # Extract metrics
        data_json = {}
        for key, val in row.items():
            if key not in fixed_fields and val is not None and val != "":
                try:
                    data_json[key] = float(val)
                except ValueError:
                    data_json[key] = val
                    
        cursor.execute("""
        INSERT INTO measurements (scale_id, timestamp, notes, data_json)
        VALUES (?, ?, ?, ?);
        """, (scale_id, ts, notes, json.dumps(data_json)))
        count += 1
        
    return count
