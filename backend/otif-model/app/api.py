import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Generator, Optional, List

# --- passlib + bcrypt>=4.1 compatibility shim ---
# MUST run before passlib is imported so the monkey-patch is in place
# when passlib first initialises its bcrypt backend.
import bcrypt as _bcrypt_mod
if not hasattr(_bcrypt_mod, "__about__"):
    _bcrypt_mod.__about__ = type("about", (), {"__version__": _bcrypt_mod.__version__})()

_orig_hashpw = _bcrypt_mod.hashpw
_orig_checkpw = _bcrypt_mod.checkpw

def _patched_hashpw(password, salt):
    if isinstance(password, str):
        password = password.encode("utf-8")
    return _orig_hashpw(password[:72], salt)

def _patched_checkpw(password, hashed_password):
    if isinstance(password, str):
        password = password.encode("utf-8")
    return _orig_checkpw(password[:72], hashed_password)

_bcrypt_mod.hashpw = _patched_hashpw
_bcrypt_mod.checkpw = _patched_checkpw
# --- end shim ---

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

import pandas as pd

from src import data_ingestion as di
from src import preprocessing as pp
from src import trainer as tr

# --- otif-genai integration ---
_genai_root = str(Path(__file__).resolve().parents[2] / "otif-genai")
if _genai_root not in sys.path:
    sys.path.append(_genai_root)

_genai_summarize_reason = None
_genai_import_error: Optional[str] = None
try:
    from llm.llm_explainer import summarize_reason as _genai_summarize_reason
except Exception as _exc:
    _genai_summarize_reason = None
    _genai_import_error = str(_exc)


# Absolute path: backend/users.db  (one level above the app/ package)
_APP_DIR = Path(__file__).resolve().parent          # …/backend/otif-model/app
_BACKEND_DIR = _APP_DIR.parent.parent               # …/backend
_DB_PATH = _BACKEND_DIR / "users.db"
DATABASE_URL = f"sqlite:///{_DB_PATH}"
SECRET_KEY = "change-this-secret-key"  # TODO: move to env in production
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")  # "admin" or "user"


Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: str = "user"


class UserOut(BaseModel):
    id: int
    email: EmailStr
    role: str

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class TokenData(BaseModel):
    sub: Optional[str] = None


class OrderSummaryRequest(BaseModel):
    salesOrder: str
    customer: str
    material: str
    plant: str
    reqDelivery: str
    leadTime: str
    riskScore: Optional[float] = None
    probHit: Optional[float] = None
    probMiss: Optional[float] = None
    status: str


class RiskDriver(BaseModel):
    rank: int
    name: str
    value: str
    description: str
    shapValue: float
    maxShap: float
    explanation: str
    flag: bool


class OrderSummaryResponse(BaseModel):
    probHit: float
    probMiss: float
    prediction: str
    explanation: str
    riskDrivers: List[RiskDriver]
    genaiSummary: Optional[str] = None
    shapOneLiner: Optional[str] = None


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = get_user_by_email(db, email)
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


def get_current_user(db: Session = Depends(get_db), token: str = Depends(OAuth2PasswordRequestForm)) -> User:
    # This dependency is not used directly; we define explicit auth endpoints instead.
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED)


app = FastAPI(title="OTIF API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    # Accept any localhost/private-LAN dev port (Vite may shift ports).
    # Keep explicit allow_origins for clarity; regex covers port changes.
    allow_origin_regex=r"^https?://("
    r"localhost|127\.0\.0\.1|0\.0\.0\.0|"
    r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"192\.168\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
    r")(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/auth/register", response_model=UserOut)
def register(user_in: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    existing = get_user_by_email(db, user_in.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    if user_in.role not in {"admin", "user"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    db_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@app.post("/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> Token:
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    access_token = create_access_token(data={"sub": str(user.id)})
    return Token(access_token=access_token, user=user)  # type: ignore[arg-type]


def _compute_probabilities(req: OrderSummaryRequest) -> tuple[float, float]:
    if req.probHit is not None and req.probMiss is not None:
        return float(req.probHit), float(req.probMiss)

    if req.riskScore is not None:
        prob_miss = float(req.riskScore)
        prob_hit = max(0.0, 100.0 - prob_miss)
        return prob_hit, prob_miss

    if req.probHit is not None:
        prob_hit = float(req.probHit)
        return prob_hit, max(0.0, 100.0 - prob_hit)

    if req.probMiss is not None:
        prob_miss = float(req.probMiss)
        return max(0.0, 100.0 - prob_miss), prob_miss

    return 100.0, 0.0


def _generate_risk_drivers(req: OrderSummaryRequest, prob_miss: float) -> List[RiskDriver]:
    drivers: List[RiskDriver] = []
    try:
        lead_days = int(req.leadTime)
    except Exception:
        lead_days = 3

    rank = 1
    if lead_days <= 5:
        drivers.append(
            RiskDriver(
                rank=rank,
                name="Extremely Tight Lead Time",
                value=f"{lead_days} days",
                description="Severely time-constrained orders where material readiness is far behind demand.",
                shapValue=min(4.0, max(1.0, prob_miss / 25.0)),
                maxShap=4.0,
                explanation="Short lead time significantly increases the probability of missing OTIF.",
                flag=True,
            )
        )
        rank += 1

    drivers.append(
        RiskDriver(
            rank=rank,
            name="Material & Plant Context",
            value=f"{req.material} @ {req.plant}",
            description="Historical performance for this material and plant combination.",
            shapValue=min(4.0, max(1.0, prob_miss / 30.0)),
            maxShap=4.0,
            explanation="Historical miss behavior for this combination may be contributing to risk.",
            flag=False,
        )
    )
    rank += 1

    drivers.append(
        RiskDriver(
            rank=rank,
            name="Baseline Model Risk",
            value=f"{prob_miss:.1f}% miss probability",
            description="Overall model-assessed risk for this order.",
            shapValue=min(4.0, max(1.0, prob_miss / 20.0)),
            maxShap=4.0,
            explanation="The model's overall risk assessment drives the final miss probability.",
            flag=False,
        )
    )

    return drivers


@app.post("/orders/summary", response_model=OrderSummaryResponse)
def summarize_order(req: OrderSummaryRequest) -> OrderSummaryResponse:
    prob_hit, prob_miss = _compute_probabilities(req)
    prediction = "Miss" if prob_miss >= prob_hit else "Hit"

    explanation = (
        f"This order has a {prob_miss:.1f}% predicted probability of missing OTIF "
        f"and a {prob_hit:.1f}% probability of on-time delivery, based on the uploaded risk scores."
    )

    drivers = _generate_risk_drivers(req, prob_miss)

    # --- GenAI explanation (graceful fallback) ---
    genai_summary: Optional[str] = None
    shap_one_liner: Optional[str] = None

    if _genai_summarize_reason is not None:
        try:
            row_data: dict[str, Any] = {
                "Sales order": req.salesOrder,
                "Customer Name": req.customer,
                "Material description": req.material,
                "Plant": req.plant,
                "Requested Delivery Date": req.reqDelivery,
                "prob_hit": prob_hit,
                "prob_miss": prob_miss,
            }
            drv_tuples = [(d.name, d.value, d.shapValue) for d in drivers]
            pred_int = 1 if prediction == "Hit" else 0

            genai_summary, shap_one_liner = _genai_summarize_reason(
                prediction=pred_int,
                prob_hit=prob_hit,
                prob_miss=prob_miss,
                drivers=drv_tuples,
                row=row_data,
            )
        except Exception as exc:
            genai_summary = None
            shap_one_liner = f"GenAI unavailable: {exc}"

    return OrderSummaryResponse(
        probHit=prob_hit,
        probMiss=prob_miss,
        prediction=prediction,
        explanation=explanation,
        riskDrivers=drivers,
        genaiSummary=genai_summary,
        shapOneLiner=shap_one_liner,
    )


@app.get("/admin/model-dashboard")
def admin_model_dashboard(month: Optional[str] = None) -> dict:
    """
    Returns high-level model metrics and prediction distribution
    for a given month (or the latest available month).
    """
    config = di.load_config()
    models_root = Path(config["paths"]["models"])
    if not models_root.exists():
        raise HTTPException(status_code=404, detail="No models directory found")

    month_dirs = sorted([d.name for d in models_root.iterdir() if d.is_dir()])
    if not month_dirs:
        raise HTTPException(status_code=404, detail="No trained model months found")

    target_month = month or month_dirs[-1]
    if target_month not in month_dirs:
        raise HTTPException(status_code=404, detail="Requested month not found")

    model_dir = models_root / target_month
    metrics_path = model_dir / "metrics.json"
    preds_path = model_dir / "predictions.csv"

    import json

    metrics: dict = {}
    if metrics_path.exists():
        with open(metrics_path, "r") as f:
            metrics = json.load(f)

    miss_precision = float(metrics.get("miss_precision", 0.0))
    miss_recall = float(metrics.get("miss_recall", 0.0))
    accuracy = float(metrics.get("accuracy", 0.0))
    auc = float(metrics.get("auc", 0.0))
    threshold = float(metrics.get("threshold", metrics.get("thr", 0.5)))
    thr_reason = str(metrics.get("thr_reason", metrics.get("reason", "unknown")))

    total_predictions = 0
    miss_count = 0
    hit_count = 0
    confusion = {"tp": 0, "tn": 0, "fp": 0, "fn": 0}
    if preds_path.exists():
        df_p = pd.read_csv(preds_path)
        if "predicted_hit" in df_p.columns:
            y_pred = df_p["predicted_hit"].astype(int)
            total_predictions = int(len(y_pred))
            miss_count = int((y_pred == 0).sum())
            hit_count = int((y_pred == 1).sum())
        if "y_true" in df_p.columns and "predicted_hit" in df_p.columns:
            y_true = df_p["y_true"].astype(int)
            y_pred = df_p["predicted_hit"].astype(int)
            confusion["tp"] = int(((y_true == 1) & (y_pred == 1)).sum())
            confusion["tn"] = int(((y_true == 0) & (y_pred == 0)).sum())
            confusion["fp"] = int(((y_true == 0) & (y_pred == 1)).sum())
            confusion["fn"] = int(((y_true == 1) & (y_pred == 0)).sum())

    # Check for static SHAP report images
    reports_dir = model_dir / "reports"
    has_reports = reports_dir.exists() and any(reports_dir.glob("*.png"))

    return {
        "availableMonths": month_dirs,
        "metrics": {
            "month": target_month,
            "miss_precision": miss_precision,
            "miss_recall": miss_recall,
            "accuracy": accuracy,
            "auc": auc,
            "threshold": threshold,
            "thr_reason": thr_reason,
            "total_predictions": total_predictions,
            "miss_count": miss_count,
            "hit_count": hit_count,
            "confusion": confusion,
            "has_reports": has_reports,
        },
    }


@app.get("/admin/shap-summary")
def admin_shap_summary(month: Optional[str] = None) -> dict:
    """
    Returns global SHAP summary for a given month (or latest).
    """
    config = di.load_config()
    models_root = Path(config["paths"]["models"])
    if not models_root.exists():
        raise HTTPException(status_code=404, detail="No models directory found")

    month_dirs = sorted([d.name for d in models_root.iterdir() if d.is_dir()])
    if not month_dirs:
        raise HTTPException(status_code=404, detail="No trained model months found")

    target_month = month or month_dirs[-1]
    if target_month not in month_dirs:
        raise HTTPException(status_code=404, detail="Requested month not found")

    model_dir = models_root / target_month
    shap_path = model_dir / "shap_summary.csv"

    shap_summary = []
    if shap_path.exists():
        df = pd.read_csv(shap_path)
        for _, row in df.iterrows():
            shap_summary.append(
                {
                    "feature": str(row.get("feature", "")),
                    "mean_abs_shap": float(row.get("mean_abs_shap", 0.0)),
                }
            )

    return {
        "availableMonths": month_dirs,
        "shapSummary": shap_summary,
    }


@app.post("/admin/custom-predict")
async def admin_custom_predict(file: UploadFile = File(...)) -> dict:
    """
    Minimal batch prediction endpoint: applies the latest model
    to an uploaded CSV/Excel file and returns batch-level counts.
    """
    config = di.load_config()
    models_root = Path(config["paths"]["models"])
    month_dirs = sorted([d.name for d in models_root.iterdir() if d.is_dir()])
    if not month_dirs:
        raise HTTPException(status_code=404, detail="No trained model months found")

    selected_month = month_dirs[-1]
    model, artifacts = tr.load_model_artifacts(selected_month, config)
    if model is None or artifacts is None:
        raise HTTPException(status_code=404, detail="Model artifacts not available")

    contents = await file.read()
    try:
        if file.filename and file.filename.lower().endswith(".csv"):
            from io import StringIO

            df_input = pd.read_csv(StringIO(contents.decode("utf-8")))
        else:
            from io import BytesIO

            df_input = pd.read_excel(BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    df_clean = pp.preprocess_data(df_input, config)
    fe_art = artifacts["fe_artifacts"]

    from src.feature_engineering import (
        add_safe_features,
        apply_miss_rate_maps,
        apply_rate_map,
        add_order_complexity_features,
        add_tolerance_risk_features,
        add_interaction_stack_features,
    )

    df_fe = add_safe_features(df_clean)
    df_fe = apply_miss_rate_maps(df_fe, fe_art["global_miss"], fe_art["maps"])
    if "state_map" in fe_art:
        df_fe = apply_rate_map(
            df_fe, "State - Province", "f_state_miss_rate", fe_art.get("g_state", 0.2), fe_art["state_map"]
        )
    df_fe["f_mat_total_orders_log"] = 0.0
    df_fe = add_order_complexity_features(df_fe, fe_art["thresholds"])
    df_fe = add_tolerance_risk_features(df_fe, "Overdeliv_Tolerance_OTIF", "Underdel_Tolerance_OTIF")
    df_fe = add_interaction_stack_features(df_fe)

    if "imputation" in fe_art:
        for col, val in fe_art["imputation"].items():
            if col not in df_fe.columns:
                df_fe[col] = val
            else:
                df_fe[col] = df_fe[col].fillna(val)

    X_infer = df_fe[artifacts["feature_cols"]]
    probs_hit = model.predict_proba(X_infer)[:, 1]
    thr = float(artifacts.get("threshold", 0.5))
    y_pred = (probs_hit >= thr).astype(int)

    total = int(len(y_pred))
    miss_count = int((y_pred == 0).sum())
    hit_count = int((y_pred == 1).sum())
    miss_rate = (miss_count / total * 100.0) if total > 0 else 0.0

    return {
        "month": selected_month,
        "totalOrders": total,
        "missCount": miss_count,
        "hitCount": hit_count,
        "missRate": miss_rate,
    }


@app.get("/admin/data/status")
def admin_data_status() -> dict:
    """
    High-level status of the local master data repository.
    """
    config = di.load_config()
    df = di.get_local_master_data(config)
    if df is None:
        return {
            "hasMaster": False,
            "minDate": None,
            "maxDate": None,
            "totalRows": 0,
        }

    date_col = config["features"]["split_date_col"]
    min_date = df[date_col].min()
    max_date = df[date_col].max()
    return {
        "hasMaster": True,
        "minDate": min_date.isoformat() if hasattr(min_date, "isoformat") else str(min_date),
        "maxDate": max_date.isoformat() if hasattr(max_date, "isoformat") else str(max_date),
        "totalRows": int(len(df)),
    }


@app.post("/admin/data/backtest")
def admin_data_backtest() -> dict:
    """
    Trigger a rolling backtest over the configured window.
    """
    config = di.load_config()
    df = di.get_local_master_data(config)
    if df is None:
        raise HTTPException(status_code=400, detail="Local repository is empty")

    df_processed = pp.preprocess_data(df, config)
    stats = tr.run_rolling_training(df_processed, config, "2024-01", "2025-12")
    return {
        "rows": len(stats),
    }


@app.post("/admin/data/clear")
def admin_data_clear() -> dict:
    """
    Clear the local master parquet file.
    """
    config = di.load_config()
    master_path = Path(config["paths"]["raw_data"]) / "master_orders.parquet"
    if master_path.exists():
        master_path.unlink()
        return {"cleared": True}
    return {"cleared": False}


@app.post("/admin/train")
def admin_train(month: Optional[str] = None) -> dict:
    """
    Trigger model training for a specific month (or latest available).
    """
    config = di.load_config()
    df = di.get_local_master_data(config)
    if df is None:
        raise HTTPException(status_code=400, detail="Local repository is empty. Sync data first.")

    if not month:
        date_col = config["features"]["split_date_col"]
        dates = pd.to_datetime(df[date_col], errors="coerce").dropna()
        if dates.empty:
            raise HTTPException(status_code=400, detail="No valid dates in data")
        month = str(dates.dt.to_period("M").max())

    df_processed = pp.preprocess_data(df, config)
    tr.run_rolling_training(df_processed, config, month, month)
    return {"trained": True, "month": month}


from fastapi.responses import FileResponse

@app.get("/admin/shap-images/{month}/{filename}")
def admin_shap_image(month: str, filename: str):
    """
    Serve a static SHAP report image (PNG) for a given month.
    """
    config = di.load_config()
    image_path = Path(config["paths"]["models"]) / month / "reports" / filename
    if not image_path.exists() or not filename.endswith(".png"):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(str(image_path), media_type="image/png")


@app.get("/admin/performance-curves")
def admin_performance_curves(month: Optional[str] = None) -> dict:
    """
    Returns ROC curve and Precision-Recall curve data points
    for charting in the frontend.
    """
    import numpy as np
    from sklearn.metrics import roc_curve, precision_recall_curve, auc

    config = di.load_config()
    models_root = Path(config["paths"]["models"])
    if not models_root.exists():
        raise HTTPException(status_code=404, detail="No models directory found")

    month_dirs = sorted([d.name for d in models_root.iterdir() if d.is_dir()])
    if not month_dirs:
        raise HTTPException(status_code=404, detail="No trained model months found")

    target_month = month or month_dirs[-1]
    if target_month not in month_dirs:
        raise HTTPException(status_code=404, detail="Requested month not found")

    preds_path = models_root / target_month / "predictions.csv"
    if not preds_path.exists():
        raise HTTPException(status_code=404, detail="No predictions file found")

    df_p = pd.read_csv(preds_path)
    if "y_true" not in df_p.columns or "hit_probability" not in df_p.columns:
        raise HTTPException(status_code=404, detail="Predictions file missing y_true or hit_probability columns")

    y_true = df_p["y_true"].values
    y_prob = df_p["hit_probability"].values

    # ROC Curve
    fpr, tpr, _ = roc_curve(y_true, y_prob)
    roc_auc = float(auc(fpr, tpr))

    # Precision-Recall Curve
    precision, recall, _ = precision_recall_curve(y_true, y_prob)

    # Downsample to max ~100 points for frontend performance
    def downsample(arr, max_points=100):
        if len(arr) <= max_points:
            return arr.tolist()
        indices = np.linspace(0, len(arr) - 1, max_points, dtype=int)
        return arr[indices].tolist()

    return {
        "month": target_month,
        "roc": {
            "fpr": downsample(fpr),
            "tpr": downsample(tpr),
            "auc": roc_auc,
        },
        "pr": {
            "precision": downsample(precision),
            "recall": downsample(recall),
        },
    }

