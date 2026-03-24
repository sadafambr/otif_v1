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

import uuid
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer

from app.logger import get_logger
logger = get_logger(__name__)
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

# --- Daily in-memory cache for GenAI order summaries ---
# Key: salesOrder str → Value: (date_str, genai_summary, shap_one_liner)
_summary_cache: dict[str, tuple[str, Optional[str], Optional[str]]] = {}


# Absolute path: backend/users.db  (one level above the app/ package)
_APP_DIR = Path(__file__).resolve().parent          # …/backend/otif-model/app
_BACKEND_DIR = _APP_DIR.parent.parent               # …/backend
_DB_PATH = _BACKEND_DIR / "users.db"
DATABASE_URL = f"sqlite:///{_DB_PATH}"
import os
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-key-but-really-change-it")
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


class FavoriteFilter(Base):
    __tablename__ = "favorite_filters"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    name = Column(String, nullable=False)
    filter_state = Column(String, nullable=False)  # Stored as JSON string


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


class FavoriteFilterCreate(BaseModel):
    name: str
    filter_state: str


class FavoriteFilterOut(BaseModel):
    id: int
    user_id: int
    name: str
    filter_state: str

    class Config:
        from_attributes = True


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
    # Per-row SHAP top features from model output
    top1Feature: Optional[str] = None
    top1Value: Optional[str] = None
    top1Shap: Optional[float] = None
    top2Feature: Optional[str] = None
    top2Value: Optional[str] = None
    top2Shap: Optional[float] = None
    top3Feature: Optional[str] = None
    top3Value: Optional[str] = None
    top3Shap: Optional[float] = None


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


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenData(sub=user_id)
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.id == int(token_data.sub)).first()
    if user is None:
        raise credentials_exception
    return user


app = FastAPI(title="OTIF API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
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

@app.middleware("http")
async def add_request_id_and_log(request: Request, call_next):
    request_id = str(uuid.uuid4())
    logger.info("Incoming request", extra={"request_id": request_id, "method": request.method, "url": str(request.url)})
    response = await call_next(request)
    logger.info("Request completed", extra={"request_id": request_id, "status_code": response.status_code})
    response.headers["X-Request-ID"] = request_id
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception processing request", exc_info=exc, extra={"url": str(request.url)})
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error. Please trace the logs for more info."}
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


@app.get("/user/favorites", response_model=List[FavoriteFilterOut])
def get_user_favorites(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(FavoriteFilter).filter(FavoriteFilter.user_id == current_user.id).all()


@app.post("/user/favorites", response_model=FavoriteFilterOut)
def create_user_favorite(fav_in: FavoriteFilterCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_fav = FavoriteFilter(
        user_id=current_user.id,
        name=fav_in.name,
        filter_state=fav_in.filter_state
    )
    db.add(db_fav)
    db.commit()
    db.refresh(db_fav)
    return db_fav


@app.delete("/user/favorites/{fav_id}")
def delete_user_favorite(fav_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_fav = db.query(FavoriteFilter).filter(FavoriteFilter.id == fav_id, FavoriteFilter.user_id == current_user.id).first()
    if not db_fav:
        raise HTTPException(status_code=404, detail="Favorite filter not found")
    db.delete(db_fav)
    db.commit()
    return {"detail": "Successfully deleted"}


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


# Human-readable labels for SHAP feature names
_SHAP_FEATURE_LABELS: dict[str, str] = {
    "f_lead_gap_days": "Lead Time Gap",
    "f_request_lead_days": "Request Lead Days",
    "f_material_lead_days": "Material Lead Days",
    "f_so_to_rdd_days": "SO to Delivery Days",
    "f_so_to_mat_avail_days_from_dates": "SO to Material Avail Days",
    "f_mat_avail_to_rdd_days": "Material Avail to Delivery Days",
    "f_mat_ready_after_rdd": "Material Ready After Delivery",
    "f_tight_ratio": "Lead Time Tightness Ratio",
    "f_is_tight_order": "Tight Order Flag",
    "f_is_extremely_tight": "Extremely Tight Order",
    "f_customer_miss_rate": "Customer Miss Rate",
    "f_material_miss_rate": "Material Miss Rate",
    "f_plant_miss_rate": "Plant Miss Rate",
    "f_plant_orders_7d": "Plant Orders (7 day)",
    "f_plant_orders_30d": "Plant Orders (30 day)",
    "f_risk_stack": "Risk Stack",
    "f_otif_risk_score": "OTIF Risk Score",
    "f_congestion": "Node Congestion",
    "f_high_value_x_tight": "High Value x Tight Order",
    "f_gap_x_load": "Gap x Load",
}


def _translate_feature_name(name: str) -> str:
    """Turn a raw SHAP feature name into a human-readable label."""
    key = name.strip().lower()
    if key in _SHAP_FEATURE_LABELS:
        return _SHAP_FEATURE_LABELS[key]
    if f"f_{key}" in _SHAP_FEATURE_LABELS:
        return _SHAP_FEATURE_LABELS[f"f_{key}"]
    # Generic fallback: strip f_ prefix, replace underscores, title-case
    return key.removeprefix("f_").replace("_", " ").title()


def _generate_risk_drivers(req: OrderSummaryRequest, prob_miss: float) -> List[RiskDriver]:
    """
    Build risk drivers from real SHAP features when available.
    Falls back to generic hardcoded drivers only when no SHAP data is present.
    """
    shap_features = []
    for feat, val, shap_val in [
        (req.top1Feature, req.top1Value, req.top1Shap),
        (req.top2Feature, req.top2Value, req.top2Shap),
        (req.top3Feature, req.top3Value, req.top3Shap),
    ]:
        if feat:
            shap_features.append((feat, val, shap_val))

    # If we have real SHAP features, use them
    if shap_features:
        drivers: List[RiskDriver] = []
        max_abs_shap = max(
            (abs(s) for _, _, s in shap_features if s is not None),
            default=4.0,
        ) or 1.0  # avoid division by zero

        for rank, (feat, val, shap_val) in enumerate(shap_features, start=1):
            abs_shap = abs(shap_val) if shap_val is not None else 0.0
            human_name = _translate_feature_name(feat)
            is_flag = abs_shap >= max_abs_shap * 0.8  # flag top-impact features

            drivers.append(
                RiskDriver(
                    rank=rank,
                    name=human_name,
                    value=str(val) if val is not None else "N/A",
                    description=f"SHAP feature: {feat}",
                    shapValue=round(abs_shap, 4),
                    maxShap=round(max_abs_shap, 4),
                    explanation=(
                        f"{human_name} has a SHAP impact of {shap_val:+.3f}, "
                        f"{'increasing' if (shap_val or 0) > 0 else 'decreasing'} miss risk."
                    ) if shap_val is not None else f"{human_name} is a key prediction driver.",
                    flag=is_flag,
                )
            )
        return drivers

    # ---------- Fallback: no SHAP data ----------
    drivers = []
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
    # Priority: status from request, then derived from probabilities
    prediction = req.status if req.status in ["Hit", "Miss"] else ("Miss" if prob_miss >= prob_hit else "Hit")

    explanation = (
        f"This order is predicted to be a {prediction.upper()} based on the uploaded dataset features. "
        f"The assessed miss probability is {prob_miss:.1f}%."
    )

    drivers = _generate_risk_drivers(req, prob_miss)

    # --- GenAI explanation (with daily cache) ---
    genai_summary: Optional[str] = None
    shap_one_liner: Optional[str] = None
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    cache_key = req.salesOrder

    # Check cache: reuse if generated today
    if cache_key in _summary_cache:
        cached_date, cached_summary, cached_shap = _summary_cache[cache_key]
        if cached_date == today_str:
            genai_summary = cached_summary
            shap_one_liner = cached_shap

    # If not cached, call GenAI
    if genai_summary is None and _genai_summarize_reason is not None:
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
            # Pass real SHAP features to the LLM prompt when available
            if req.top1Feature:
                row_data["top1_feature"] = req.top1Feature
                row_data["top1_value"] = req.top1Value
                row_data["top1_shap"] = req.top1Shap
            if req.top2Feature:
                row_data["top2_feature"] = req.top2Feature
                row_data["top2_value"] = req.top2Value
                row_data["top2_shap"] = req.top2Shap
            if req.top3Feature:
                row_data["top3_feature"] = req.top3Feature
                row_data["top3_value"] = req.top3Value
                row_data["top3_shap"] = req.top3Shap

            drv_tuples = [(d.name, d.value, d.shapValue) for d in drivers]
            pred_int = 1 if prediction == "Hit" else 0

            genai_summary, shap_one_liner = _genai_summarize_reason(
                prediction=pred_int,
                prob_hit=prob_hit,
                prob_miss=prob_miss,
                drivers=drv_tuples,
                row=row_data,
            )
            # Store in cache
            _summary_cache[cache_key] = (today_str, genai_summary, shap_one_liner)
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


import asyncio

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

    def _process_data():
        df_clean = pp.preprocess_data(df_input, config)
        fe_art = artifacts["fe_artifacts"]
        from src.feature_engineering import (
            add_safe_features, apply_miss_rate_maps, apply_rate_map,
            add_order_complexity_features, add_tolerance_risk_features,
            add_interaction_stack_features
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

        total_rows = int(len(y_pred))
        m_count = int((y_pred == 0).sum())
        h_count = int((y_pred == 1).sum())
        m_rate = (m_count / total_rows * 100.0) if total_rows > 0 else 0.0
        return total_rows, m_count, h_count, m_rate

    total, miss_count, hit_count, miss_rate = await asyncio.to_thread(_process_data)

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


@app.post("/orders/enrich")
async def enrich_orders(file: UploadFile = File(...)) -> dict:
    """
    Accepts a raw CSV/Excel file, runs the full model pipeline
    (preprocess → feature engineering → predict → SHAP), and returns
    per-row enriched data with probabilities and top SHAP features.
    """
    import shap
    import numpy as np
    from src.feature_engineering import run_inference_pipeline
    from src.explainability import get_top_shap_features

    config = di.load_config()
    models_root = Path(config["paths"]["models"])

    if not models_root.exists():
        raise HTTPException(status_code=404, detail="No models directory found")

    month_dirs = sorted([d.name for d in models_root.iterdir() if d.is_dir()])
    if not month_dirs:
        raise HTTPException(status_code=404, detail="No trained model months found")

    selected_month = month_dirs[-1]
    model, artifacts = tr.load_model_artifacts(selected_month, config)
    if model is None or artifacts is None:
        raise HTTPException(status_code=404, detail="Model artifacts not available")

    # --- Parse uploaded file ---
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

    if df_input.empty:
        return {
            "month": selected_month,
            "threshold": float(artifacts.get("threshold", 0.5)),
            "totalOrders": 0,
            "rows": []
        }

    def _process_data():
        df_clean = pp.preprocess_data(df_input, config)
        fe_art = artifacts["fe_artifacts"]
        df_fe = run_inference_pipeline(df_clean, fe_art, config)

        feature_cols = artifacts["feature_cols"]
        for col in feature_cols:
            if col not in df_fe.columns:
                df_fe[col] = 0.0

        X_infer = df_fe[feature_cols]

        probs_hit = model.predict_proba(X_infer)[:, 1]
        thr = float(artifacts.get("threshold", 0.5))
        y_pred = (probs_hit >= thr).astype(int)

        try:
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X_infer)
            if isinstance(shap_values, list):
                shap_miss = shap_values[0]
            else:
                shap_miss = -shap_values
            top_shap_df = get_top_shap_features(shap_miss, X_infer, top_n=3)
        except Exception:
            top_shap_df = pd.DataFrame([{
                "top1_feature": None, "top1_value": None, "top1_shap": None,
                "top2_feature": None, "top2_value": None, "top2_shap": None,
                "top3_feature": None, "top3_value": None, "top3_shap": None,
            }] * len(X_infer))

        rows_out = []
        for i in range(len(df_input)):
            prob_hit_pct = round(float(probs_hit[i]) * 100, 2)
            prob_miss_pct = round((1.0 - float(probs_hit[i])) * 100, 2)
            prediction = "Hit" if y_pred[i] == 1 else "Miss"

            shap_row = top_shap_df.iloc[i] if i < len(top_shap_df) else {}
            def _safe(val):
                if val is None or (isinstance(val, float) and np.isnan(val)):
                    return None
                return val

            rows_out.append({
                "rowIndex": i,
                "probHit": prob_hit_pct,
                "probMiss": prob_miss_pct,
                "riskScore": prob_miss_pct,
                "prediction": prediction,
                "top1Feature": _safe(shap_row.get("top1_feature")),
                "top1Value": str(_safe(shap_row.get("top1_value"))) if _safe(shap_row.get("top1_value")) is not None else None,
                "top1Shap": round(float(shap_row.get("top1_shap", 0)), 4) if _safe(shap_row.get("top1_shap")) is not None else None,
                "top2Feature": _safe(shap_row.get("top2_feature")),
                "top2Value": str(_safe(shap_row.get("top2_value"))) if _safe(shap_row.get("top2_value")) is not None else None,
                "top2Shap": round(float(shap_row.get("top2_shap", 0)), 4) if _safe(shap_row.get("top2_shap")) is not None else None,
                "top3Feature": _safe(shap_row.get("top3_feature")),
                "top3Value": str(_safe(shap_row.get("top3_value"))) if _safe(shap_row.get("top3_value")) is not None else None,
                "top3Shap": round(float(shap_row.get("top3_shap", 0)), 4) if _safe(shap_row.get("top3_shap")) is not None else None,
            })
        return rows_out, thr

    rows_out, thr = await asyncio.to_thread(_process_data)

    return {
        "month": selected_month,
        "threshold": thr,
        "totalOrders": len(rows_out),
        "rows": rows_out,
    }
