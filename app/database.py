import sqlite3
import json
from pathlib import Path
from contextlib import contextmanager
from app.config import DATABASE_FILE

def get_db():
    conn = sqlite3.connect(DATABASE_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Enable foreign key constraints
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
    finally:
        conn.close()

@contextmanager
def db_context():
    conn = sqlite3.connect(DATABASE_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    with db_context() as conn:
        cursor = conn.cursor()
        
        # 1. Scales table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS scales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        
        # 2. Metrics Definitions table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS metrics_definitions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            label TEXT NOT NULL,
            unit TEXT NOT NULL,
            category TEXT DEFAULT 'body_comp',
            is_custom INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0
        );
        """)
        
        # 3. Scale Metrics Mapping table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS scale_metrics (
            scale_id INTEGER NOT NULL,
            metric_key TEXT NOT NULL,
            PRIMARY KEY (scale_id, metric_key),
            FOREIGN KEY (scale_id) REFERENCES scales(id) ON DELETE CASCADE
        );
        """)
        
        # 4. Measurements table (Flexible JSON Data Store)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS measurements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scale_id INTEGER,
            timestamp TEXT NOT NULL,
            notes TEXT,
            data_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (scale_id) REFERENCES scales(id) ON DELETE SET NULL
        );
        """)
        
        # Index on timestamp for quick analytics queries
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_measurements_timestamp ON measurements(timestamp);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_measurements_scale ON measurements(scale_id);")

        # 5. Medications table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS medications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            active_ingredient TEXT,
            dosage_steps_json TEXT DEFAULT '[]',
            form TEXT DEFAULT 'subcutaneous_pen',
            notes TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        
        # 6. Injections table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS injections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medication_id INTEGER NOT NULL,
            dosage_mg REAL NOT NULL,
            timestamp TEXT NOT NULL,
            site TEXT NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_injections_timestamp ON injections(timestamp);")

        # 7. Purchases table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medication_id INTEGER NOT NULL,
            purchase_date TEXT NOT NULL,
            pack_size_doses INTEGER NOT NULL DEFAULT 4,
            dose_mg REAL NOT NULL,
            pharmacy_source TEXT,
            total_cost REAL NOT NULL,
            currency TEXT DEFAULT '€',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
        );
        """)
        
        # 8. Side Effects table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS side_effects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            symptom_name TEXT NOT NULL,
            severity INTEGER NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_side_effects_timestamp ON side_effects(timestamp);")

        # 9. User Settings table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """)

        # --- SEED DEFAULT METRICS DEFINITIONS ---
        default_metrics = [
            ("weight_kg", "Weight", "kg", "body_comp", 10),
            ("body_fat_pct", "Body Fat", "%", "body_comp", 20),
            ("bmi", "BMI", "kg/m²", "body_comp", 30),
            ("skeletal_muscle_pct", "Skeletal Muscle", "%", "body_comp", 40),
            ("muscle_mass_kg", "Muscle Mass", "kg", "body_comp", 50),
            ("fat_free_mass_kg", "Fat-Free Mass", "kg", "body_comp", 60),
            ("protein_pct", "Protein", "%", "body_comp", 70),
            ("bmr_kcal", "BMR", "kcal", "body_comp", 80),
            ("subcutaneous_fat_pct", "Subcutaneous Fat", "%", "body_comp", 90),
            ("visceral_fat", "Visceral Fat Rating", "lvl", "body_comp", 100),
            ("body_water_pct", "Body Water", "%", "body_comp", 110),
            ("phase_angle", "Phase Angle", "°", "body_comp", 120),
            ("icw_l", "Intracellular Water", "L", "body_comp", 130),
            ("ecw_l", "Extracellular Water", "L", "body_comp", 140),
            
            # Vital Signs & Cardiovascular
            ("bp_systolic", "Systolic Blood Pressure", "mmHg", "vital_signs", 150),
            ("bp_diastolic", "Diastolic Blood Pressure", "mmHg", "vital_signs", 160),
            ("heart_rate_bpm", "Resting Heart Rate", "bpm", "vital_signs", 170),
            ("glucose_mgdl", "Blood Glucose", "mg/dL", "vital_signs", 180),
            
            # Segmental Metrics
            ("arm_r_muscle_kg", "Right Arm Muscle", "kg", "segmental", 200),
            ("arm_l_muscle_kg", "Left Arm Muscle", "kg", "segmental", 210),
            ("torso_muscle_kg", "Torso Muscle", "kg", "segmental", 220),
            ("leg_r_muscle_kg", "Right Leg Muscle", "kg", "segmental", 230),
            ("leg_l_muscle_kg", "Left Leg Muscle", "kg", "segmental", 240),
            
            ("arm_r_fat_kg", "Right Arm Fat", "kg", "segmental", 250),
            ("arm_l_fat_kg", "Left Arm Fat", "kg", "segmental", 260),
            ("torso_fat_kg", "Torso Fat", "kg", "segmental", 270),
            ("leg_r_fat_kg", "Right Leg Fat", "kg", "segmental", 280),
            ("leg_l_fat_kg", "Left Leg Fat", "kg", "segmental", 290)
        ]

        for key, label, unit, cat, sort_order in default_metrics:
            cursor.execute("""
            INSERT OR IGNORE INTO metrics_definitions (key, label, unit, category, is_custom, is_active, sort_order)
            VALUES (?, ?, ?, ?, 0, 1, ?)
            """, (key, label, unit, cat, sort_order))

        # --- SEED DEFAULT SCALES IF NONE EXIST ---
        cursor.execute("SELECT COUNT(*) FROM scales;")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
            INSERT INTO scales (name, description) VALUES
            ('Home Scale', 'Primary home smart scale'),
            ('Gym InBody Scale', 'Professional InBody segmental scale'),
            ('Manual Analog Scale', 'Simple weight-only scale');
            """)
            home_id = 1
            gym_id = 2
            manual_id = 3

            # Assign basic metrics to Home Scale
            basic_keys = ["weight_kg", "body_fat_pct", "bmi", "skeletal_muscle_pct", "muscle_mass_kg", "bmr_kcal", "body_water_pct", "visceral_fat"]
            for k in basic_keys:
                cursor.execute("INSERT OR IGNORE INTO scale_metrics (scale_id, metric_key) VALUES (?, ?);", (home_id, k))

            # Assign all metrics to Gym InBody Scale
            for k, _, _, _, _ in default_metrics:
                cursor.execute("INSERT OR IGNORE INTO scale_metrics (scale_id, metric_key) VALUES (?, ?);", (gym_id, k))

            # Assign weight only to Manual Scale
            cursor.execute("INSERT OR IGNORE INTO scale_metrics (scale_id, metric_key) VALUES (?, 'weight_kg');", (manual_id,))

        # --- SEED DEFAULT MEDICATIONS IF NONE EXIST ---
        cursor.execute("SELECT COUNT(*) FROM medications;")
        if cursor.fetchone()[0] == 0:
            default_meds = [
                ("Wegovy", "Semaglutide", json.dumps([0.25, 0.5, 1.0, 1.7, 2.4]), "subcutaneous_pen", "Weekly GLP-1 receptor agonist"),
                ("Ozempic", "Semaglutide", json.dumps([0.25, 0.5, 1.0, 2.0]), "subcutaneous_pen", "Weekly GLP-1 receptor agonist"),
                ("Mounjaro", "Tirzepatide", json.dumps([2.5, 5.0, 7.5, 10.0, 12.5, 15.0]), "subcutaneous_pen", "Weekly GIP/GLP-1 receptor agonist"),
                ("Zepbound", "Tirzepatide", json.dumps([2.5, 5.0, 7.5, 10.0, 12.5, 15.0]), "subcutaneous_pen", "Weekly GIP/GLP-1 receptor agonist")
            ]
            for name, active_ing, steps, form, notes in default_meds:
                cursor.execute("""
                INSERT INTO medications (name, active_ingredient, dosage_steps_json, form, notes)
                VALUES (?, ?, ?, ?, ?);
                """, (name, active_ing, steps, form, notes))

        # --- SEED USER TARGET WEIGHT SETTING IF NOT PRESENT ---
        cursor.execute("INSERT OR IGNORE INTO user_settings (key, value) VALUES ('target_weight_kg', '75.0');")
        cursor.execute("INSERT OR IGNORE INTO user_settings (key, value) VALUES ('currency_symbol', '€');")
        cursor.execute("UPDATE user_settings SET value = '€' WHERE key = 'currency_symbol';")
