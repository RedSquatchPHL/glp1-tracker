# GLP-1 Weight Loss & Body Composition Tracker (`glp1-tracker`)

A minimalist, highly functional, clinical-grade web application designed for tracking weight loss journeys using GLP-1 medications (e.g., Wegovy, Ozempic, Mounjaro, Zepbound) and multi-device body composition scale metrics.

---

## Key Features

1. **Podman & Rootless First Architecture**
   - Built for rootless Podman execution (`Containerfile`, `podman-compose.yaml`, and Podman CLI).
   - Listens on configurable port (default: `9374:9374`).

2. **Master Data & Multi-Device Scale Management**
   - Custom scale profiles (e.g. Home Smart Scale, Gym InBody Scale, Manual Analog Scale).
   - Dynamic field assignment: Assign specific body composition metrics to individual scales.
   - Dynamic input forms render **ONLY** assigned metrics for the selected device profile.

3. **Non-Destructive EAV / JSON Data Architecture**
   - Powered by SQLite with JSON column storage (`data_json`).
   - Adding, removing, or re-assigning measurement metrics or scale profiles never breaks historical data, corrupts schema, or deletes previously recorded metrics.
   - Native support for 25+ metrics: Weight kg, Body Fat %, BMI, Skeletal Muscle %, Muscle Mass kg, Protein %, BMR kcal, Fat-Free Mass kg, Visceral/Subcutaneous Fat, Body Water %, Phase Angle, ICW/ECW, and Segmental Muscle/Fat for arms, legs, and torso.

4. **Selective Analytics & Linear Projection Engine**
   - **Data Source Selector**: Filter dashboard, charts, moving averages, and projections by specific scale ("All Sources", "Home Scale Only", "Gym Scale Only").
   - **Moving Averages**: 7-day and 14-day moving averages with daily multi-reading aggregation.
   - **Ordinary Least Squares (OLS) Linear Projections**: Extrapolate weight loss trend line over 7, 14, 30 days, or total journey duration.
   - **Lean Mass Protection Warning**: Automatically flags unhealthily high muscle-to-fat loss ratios (>25% muscle loss ratio) with actionable nutritional/training recommendations.

5. **Weight Forecast & Prognosis Engine**
   - **Multi-Horizon Weight Forecast**: Displays real-time weight predictions for 7 days, 14 days, 30 days, and 90 days out based on trend regression.
   - **Target Goal Weight Completion**: Set custom target weight in settings and view projected completion date with remaining days countdown.
   - **Configurable Projection Window**: Toggle baseline regression calculations over 7, 14, 30 days or total historical timeline.

6. **Body Transformation & Progress Photos**
   - **Multi-Angle Photo Logging**: Upload and tag progress photos with camera angles (Front, Side, Back, Three-Quarter, Flexed), date, weight, and notes.
   - **1-Click Auto Weight Sync**: Automatically fetches scale weight measurement matching the photo date.
   - **Interactive Gallery & Lightbox**: Filter photos by camera angle and view full-resolution lightboxes.
   - **Interactive Before/After Comparison**:
     - **Side-by-Side View**: Compare early vs recent photos with date delta, duration elapsed, and weight difference (kg).
     - **Interactive Split-Slider**: Real-time curtain slider overlay for precision visual comparison of body composition changes.
     - **Swap & Angle Selector**: Quickly flip before/after positions or compare matching body angles.

7. **Injections, Inventory & Side Effects Tracking**
   - **Injection Log & Site Rotation Guide**: Interactive visual body map guide (Abdomen L/R, Thigh L/R, Arm L/R) to prevent lipohypertrophy. Includes injection interval alert for doses < 5 days or > 9 days apart.
   - **Purchase & Prescription Inventory Tracker**: Tracks pharmacy sources, pack sizes, total cost ($/€), daily & monthly expenditure, remaining fridge inventory count, and projected refill run-out dates.
   - **Side Effect Diary**: Severity 1–5 logging, symptom frequency analysis, and weekday distribution breakdown correlated with medication dose step-ups.

8. **Full JSON & CSV Export / Import**
   - Complete JSON database backup export and restore (includes scales, metrics, measurements, medications, injections, purchases, side effects, user settings, and progress photo metadata).
   - Raw metrics CSV export and spreadsheet import.

---

## Project Structure

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
    ├── math_engine.py       # OLS linear regression, moving average & forecast engine
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
        └── index.html       # Responsive web application interface
```

---

## Deployment & Running with Podman

### Option A: Using Podman CLI (Recommended Command)

```bash
# 1. Build the container image
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

## Configuration (`.env`)

Copy `.env.example` to `.env`:

```env
PORT=9374
APP_PASSWORD=admin
SECRET_KEY=glp1_tracker_super_secret_session_key_2026
DATA_DIR=/app/data
DATABASE_FILE=/app/data/glp1_tracker.db
```
