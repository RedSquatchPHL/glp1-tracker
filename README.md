# GLP-1 Weight Loss & Body Composition Tracker (`glp1-tracker`)

![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg?style=flat-square&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB.svg?style=flat-square&logo=python)
![Podman](https://img.shields.io/badge/Podman-Rootless-892CA0.svg?style=flat-square&logo=podman)
![SQLite](https://img.shields.io/badge/SQLite-JSON1-003B57.svg?style=flat-square&logo=sqlite)
![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)

A minimalist, highly functional, clinical-grade web application designed for tracking weight loss journeys using GLP-1/GIP receptor agonist medications (e.g., Wegovy, Ozempic, Mounjaro, Zepbound) and multi-device body composition scale metrics.

---

## 🖼️ Application Overview & Screenshots

```
+-----------------------------------------------------------------------------------+
|  GLP-1 CORE v1.0 | Clinical Journey Analytics           [🏥 Doctor Summary PDF]    |
+-----------------------------------------------------------------------------------+
|  [Dashboard & Analytics] [Log Entry] [Body Photos] [Injections] [Settings]       |
|                                                                                   |
|  +-------------------+  +-------------------+  +-------------------------------+  |
|  | Current Weight    |  | Active Drug Level |  | Cardiometabolic Risk (WHtR)   |  |
|  | 186.3 lbs          |  | 1.84 mg (7d hl)   |  | Healthy / Normal Risk (0.46)  |  |
|  +-------------------+  +-------------------+  +-------------------------------+  |
|                                                                                   |
|  [🚨 SMART INJECTION REMINDER: Next dose due in 2 days (Sunday) — Site: Abdomen R]  |
|  [⚡ AUTOMATED PLATEAU DETECTED: Body Recomposition Active (Fat % down -0.5%)]     |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Weight Trajectory, Moving Averages & Pharmacokinetics Dose Overlay Chart    |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```
*(Screenshot & GIF Walkthrough Placeholders: `docs/screenshots/dashboard.png`, `docs/screenshots/before_after_slider.gif`)*

---

## 🌟 Key Features

### 1. Advanced Pharmacokinetics & Medical Features
- **Half-Life Decay Simulator & Effective Dose Accumulation Tracker**:
  - Mathematical modeling of active drug concentration in the bloodstream based on historical injection timestamps, dosages (mg), and drug-specific elimination half-lives (~7 days for Semaglutide, ~5 days for Tirzepatide, ~0.55 days for Liraglutide, ~6 days for Retatrutide).
  - Graph overlay displaying active drug accumulation levels to correlate steady-state kinetics with appetite suppression peaks, weight plateaus, and side-effect frequency.
- **Smart Injection Reminders & Rotation Guide**:
  - Visual injection site map (Abdomen L/R, Thigh L/R, Arm L/R) preventing lipohypertrophy.
  - Proactive alert engine calculating next injection day based on historical frequency and suggesting the optimal unused rotation site.

### 2. Advanced Body Composition, Metrics & Analytics Engine
- **Waist-to-Height Ratio (WHtR) & Waist-to-Hip Ratio (WHR)**:
  - Support logging waist and hip circumferences (cm/in) to compute cardiometabolic risk scores alongside smart scale readings.
- **Automated Plateau Detection & Breakdown Engine**:
  - Automatically identifies weight plateaus (weight fluctuating within a ±1 lb window over a 14–21 day threshold).
  - Displays diagnostic insights distinguishing fat loss vs. muscle gain (recomposition) or fluid retention (ICW/ECW shifts).
- **Lean Mass Protection Warning**:
  - Automatically flags unhealthily high muscle-to-fat loss ratios (>25% muscle loss ratio) with actionable nutritional and training recommendations.
- **Multi-Horizon Weight Forecast & Prognosis**:
  - Real-time trend predictions for 7 days, 14 days, 30 days, and 90 days out using Ordinary Least Squares (OLS) linear regression.

### 3. Visual Progress & Clinical Reporting
- **1-Click Clinical/Doctor Summary PDF & Export**:
  - Clean, printable medical summary view (`/clinical-summary`) summarizing dosage history, weight velocity, body composition changes, active drug levels, and logged side effects for healthcare providers and endocrinologists.

### 4. Body Transformation & Progress Photos
- **Multi-Angle Photo Logging**: Upload and tag progress photos with camera angles (Front, Side, Back, Three-Quarter, Flexed), date, weight, and notes.
- **Interactive Before/After Comparison**:
  - **Side-by-Side View**: Compare early vs recent photos with date delta, duration elapsed, and weight difference (lbs).
  - **Interactive Split-Slider**: Real-time curtain slider overlay for precision visual comparison of body composition changes.

### 5. Injections, Inventory & Side Effects Tracking
- **Purchase & Prescription Inventory Tracker**: Tracks pharmacy sources, pack sizes, total cost ($/€), daily & monthly expenditure, remaining fridge inventory count, and projected refill run-out dates.
- **Side Effect Diary**: Severity 1–5 logging, symptom frequency analysis, and weekday distribution breakdown correlated with medication dose step-ups.

### 6. Clinical Demographics, Concomitant Meds & Lab Work
- **Patient Clinical Demographics**: Personalize profile with Patient Full Name, Date of Birth, Prescribing Physician / Clinic Name, and Primary Medical Conditions.
- **Concomitant Medication Log (Non-GLP-1)**: Track daily non-GLP-1 prescription medications & supplements (Metformin, Levothyroxine, Multivitamins, Electrolytes).
- **Laboratory Blood Work & Biomarkers**: Track metabolic blood panels over time (HbA1c, Fasting Glucose, Fasting Insulin, Lipid Panel, ALT/AST, TSH).
- **Doctor Summary PDF Integration**: All patient demographics, medication reconciliation lists, and lab blood work trend history automatically populate on the 1-Click Clinical Summary PDF (`/clinical-summary`).

### 7. Unified Settings & Data Management Hub
- **Streamlined Navigation Bar**: Consolidated settings and data tools into a single, clean **Settings & Data Hub** tab to eliminate menu overcrowding.
- **Sub-Tab Categorization**: Organized into 5 dedicated sections:
  - 📏 **Scales & Devices**: Manage scale profiles (Home Scale, Gym InBody Scale) and metric assignments.
  - 📐 **Custom Metric Fields**: Create, edit, or deactivate standard or custom body composition & vital sign input fields.
  - 👤 **Profile & Goals**: Patient clinical demographics, height (cm), target weight (lbs), concomitant medications, and lab blood work managers.
  - 🔑 **Password & Security**: Change application password in-app and monitor active session status.
  - 💾 **Data Export & Backups**: JSON database backup/restore, CSV spreadsheet export/import, and 1-Click Doctor Summary PDF report generator.
  - ⚙️ **App Preferences**: Customize application currency symbol ($ / € / £ / ¥).

---

## 📁 Project Structure

```
glp1-tracker/
├── Containerfile            # Multi-stage rootless Podman container build
├── podman-compose.yaml      # Podman Compose configuration (Port 9374:9374)
├── docker-compose.yaml      # Docker Compose compatibility manifest
├── .env.example             # Configuration defaults template
├── requirements.txt         # Python FastAPI server dependencies
└── app/
    ├── main.py              # FastAPI app, static mounting & cookie auth
    ├── config.py            # Environment configuration reader
    ├── database.py          # SQLite schema, tables & metrics seeder
    ├── auth.py              # Session token verification
    ├── math_engine.py       # Pharmacokinetics simulator, OLS linear regression & plateau engine
    ├── export_import.py     # JSON / CSV export and import processors
    ├── routers/             # REST API routers
    │   ├── api_scales.py
    │   ├── api_measurements.py
    │   ├── api_medications.py
    │   ├── api_injections.py
    │   ├── api_purchases.py
    │   ├── api_side_effects.py
    │   ├── api_analytics.py
    │   ├── api_export.py
    │   └── api_photos.py    # Progress photos & upload endpoint router
    ├── static/
    │   ├── css/main.css     # Medical laboratory dark-mode design system
    │   └── js/app.js        # Dynamic UI, Chart.js, body map & photo compare controller
    └── templates/
        ├── index.html       # Main application interface
        └── clinical_summary.html # Printable Doctor Summary PDF report template
```

---

## 🚀 Deployment & Running with Podman

### Option A: Using Podman CLI (Recommended Command)

```bash
# 1. Build the rootless container image
podman build -t glp1-tracker:latest -f Containerfile .

# 2. Run the container on port 9374 with persistent volume
podman run -d \
  --name glp1-tracker \
  --restart unless-stopped \
  -p 9374:9374 \
  --env-file .env \
  -v glp1_data:/app/data \
  glp1-tracker:latest
```

### Option B: Using `podman-compose`

```bash
podman-compose up -d
```

Access the application in your web browser at `http://<server-ip>:9374`.

---

## 💾 SQLite Backup & Restore Instructions

### 1. GUI Backup & Restore (Web Application)
- **JSON Backup**: Go to **Export & Import** tab and click `Download Complete JSON Database Backup`. To restore, select the JSON file and click `Restore JSON Backup`.
- **CSV Spreadsheet**: Click `Download Measurements CSV Spreadsheet` to view raw readings in Excel or Google Sheets.

### 2. Command Line (Podman Volume / File Backup)

#### Offline Hot-Backup (CLI):
```bash
# Export raw SQLite database directly from container volume
podman exec -t glp1-tracker sqlite3 /app/data/glp1_tracker.db ".backup '/app/data/glp1_tracker_backup.db'"

# Copy database backup file to host
podman cp glp1-tracker:/app/data/glp1_tracker_backup.db ./glp1_tracker_backup.db
```

#### Restoring Database Backup:
```bash
# Copy backup into container volume and restart
podman cp ./glp1_tracker_backup.db glp1-tracker:/app/data/glp1_tracker.db
podman restart glp1-tracker
```

---

## ⚙️ Configuration (`.env`)

Copy `.env.example` to `.env`:

```env
PORT=9374
APP_PASSWORD=admin
SECRET_KEY=glp1_tracker_super_secret_session_key_2026
DATA_DIR=/app/data
DATABASE_FILE=/app/data/glp1_tracker.db
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
