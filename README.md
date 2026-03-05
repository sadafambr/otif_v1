# OTIF Prediction & Insights Platform

> An end-to-end **On-Time In-Full (OTIF)** risk prediction system for supply chain operations. Combines a LightGBM ML pipeline with SHAP explainability, GenAI natural-language explanations, and a modern React dashboard.

---

## Architecture

```
otif/
├── backend/
│   ├── otif-model/          # ML pipeline + FastAPI + Streamlit
│   │   ├── src/             # Core ML modules
│   │   ├── app/             # API (api.py) & Streamlit UI (main.py)
│   │   ├── config/          # config.yaml
│   │   ├── data/raw/        # Cached Parquet data
│   │   └── models/          # Trained model artifacts (per month)
│   │
│   ├── otif-genai/          # GenAI explanation service
│   │   ├── llm/             # OpenAI-powered explainer
│   │   ├── config/          # Column definitions
│   │   └── utils/           # Data loaders
│   │
│   └── users.db             # SQLite auth database
│
└── otif-insight-hub/        # React + Vite frontend
    ├── src/
    │   ├── pages/           # Dashboard, Admin, Login, etc.
    │   ├── components/      # UI components (shadcn/ui)
    │   ├── hooks/           # Auth & data hooks
    │   └── types/           # TypeScript types
    └── ...
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **ML Model** | LightGBM, scikit-learn, SHAP |
| **Data** | SQL Server (via SQLAlchemy + pyodbc), Parquet caching |
| **Backend API** | FastAPI, Uvicorn, JWT auth (python-jose) |
| **Streamlit UI** | Streamlit, Plotly, Matplotlib, Seaborn |
| **GenAI** | OpenAI GPT-4o-mini |
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, Recharts |
| **Auth** | JWT tokens, bcrypt hashing, SQLite user store |

---

## Getting Started

### Prerequisites

- **Python 3.10+**
- **Node.js 18+** & npm (or bun)
- **SQL Server** with ODBC Driver 17 (for data ingestion)
- **OpenAI API Key** (for GenAI explanations)

### 1. Backend — ML Pipeline & API

```bash
cd backend/otif-model

# Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt
```

#### Configure

Edit `config/config.yaml` with your SQL Server connection details:

```yaml
database:
  server: "YOUR_SQL_SERVER"
  name: "SupplyChainAnalyticsDB"
  driver: "ODBC Driver 17 for SQL Server"
```

#### Run the FastAPI server

```bash
cd backend/otif-model
uvicorn app.api:app --reload --port 8000
```

#### Run the Streamlit UI (optional)

```bash
cd backend/otif-model
streamlit run app/main.py
```

### 2. Backend — GenAI Service

```bash
cd backend/otif-genai

# Install dependencies
pip install -r requirements.txt
```

Create a `.env` file:

```env
OPENAI_API_KEY=sk-your-key-here
```

> The GenAI module is imported directly by the FastAPI server — no separate service startup needed.

### 3. Frontend

```bash
cd otif-insight-hub

# Install dependencies
npm install

# Start dev server
npm run dev
```

The frontend runs on `http://localhost:5173` and connects to the FastAPI backend at `http://localhost:8000`.

---

## ML Pipeline Overview

The model predicts whether a sales order will **HIT** (on-time, in-full) or **MISS** its delivery target.

### Pipeline Stages

1. **Data Ingestion** → SQL query joins 5 CTEs (order data, SAP item/delivery data, customer & material masters) → cached as Parquet
2. **Preprocessing** → Parse dates, drop 9 leakage columns (delivery dates, delivered quantities, post-hoc fields), fill categorical NaNs, create binary target
3. **Feature Engineering** → 10-stage pipeline producing ~40+ features:
   - Lead time gaps & tightness ratios
   - Cyclical seasonality (week-of-year sin/cos)
   - Rolling congestion counts (7d/30d per plant, material, ship-to)
   - Bayesian-smoothed historical miss rates (entity & pair-level)
   - Order complexity flags (quantity, value thresholds)
   - Tolerance risk & interaction features
4. **Training** → Rolling monthly LightGBM with class-weight balancing, 12-month training windows
5. **Threshold Tuning** → Adaptive threshold with EMA smoothing, clamping, and guardrails
6. **Explainability** → SHAP TreeExplainer for global & local feature importance, PDF report generation

### Model Outputs (per month)

| Artifact | Description |
|---|---|
| `model.joblib` | Trained LightGBM classifier |
| `artifacts.joblib` | Feature engineering maps, threshold, feature columns |
| `metrics.json` | Precision, recall, F-beta, AUC, confusion matrix |
| `predictions.csv` | Per-order predictions with probabilities & top-3 SHAP drivers |
| `shap_summary.csv` | Global feature importance ranking |
| `reports/*.png` | SHAP bar & beeswarm visualizations |

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/auth/register` | POST | Register a new user |
| `/auth/login` | POST | Authenticate & get JWT token |
| `/orders/summary` | POST | Single-order risk summary + GenAI explanation |
| `/admin/model-dashboard` | GET | Model metrics for a given month |
| `/admin/shap-summary` | GET | Global SHAP feature importance |
| `/admin/custom-predict` | POST | Batch prediction from uploaded CSV/Excel |
| `/admin/train` | POST | Trigger model training |
| `/admin/data/status` | GET | Master data status |
| `/admin/data/backtest` | POST | Run full rolling backtest |
| `/admin/performance-curves` | GET | ROC & PR curve data |

---

## Frontend Pages

| Route | Access | Description |
|---|---|---|
| `/login` | Public | User login |
| `/register` | Public | User registration |
| `/` | Auth | Document repository / home |
| `/dashboard` | Auth | Order predictions dashboard with risk scores & GenAI explanations |
| `/admin/model-dashboard` | Admin | Model performance metrics, SHAP analysis, custom prediction, data management |

---

## User Roles

- **User** — Can view the dashboard, order predictions, and GenAI explanations
- **Admin** — Full access including model dashboard, training controls, SHAP analysis, batch prediction, and data management

---

## Project Structure Details

### `backend/otif-model/src/`

| Module | Purpose |
|---|---|
| `data_ingestion.py` | SQL queries, Parquet caching, master data management |
| `preprocessing.py` | Date parsing, leakage removal, target encoding, missing value handling |
| `feature_engineering.py` | 10-stage feature pipeline (lead time, congestion, miss rates, interactions) |
| `trainer.py` | LightGBM training, rolling monthly loop, artifact persistence |
| `evaluator.py` | Metrics computation, threshold search, adaptive threshold calibration |
| `explainability.py` | SHAP extraction, report generation, PDF export |

### `backend/otif-genai/llm/`

| Module | Purpose |
|---|---|
| `llm_explainer.py` | OpenAI GPT-4o-mini integration for natural-language order explanations |

### `otif-insight-hub/src/pages/`

| Page | Purpose |
|---|---|
| `Dashboard.tsx` | User-facing order predictions table with risk scores |
| `AdminModelDashboard.tsx` | Admin panel with metrics, charts, SHAP, custom prediction, data management |
| `Login.tsx` / `Register.tsx` | Authentication forms |
| `DocumentRepository.tsx` | Home / document view |

---

## License
Internal project — not licensed for external distribution.
