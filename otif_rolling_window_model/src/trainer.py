import pandas as pd
import numpy as np
import lightgbm as lgb
import joblib
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

import json
import shap
from src.feature_engineering import run_fe_pipeline
from src.evaluator import adaptive_threshold_from_calib, evaluate_threshold_full
from src.explainability import get_top_shap_features, save_global_shap_report

def train_monthly_model(X_train, y_train, config):
    params = config['model_params']
    
    # Class weight imbalance handling
    miss = int(np.sum(y_train == 0))
    hit = int(np.sum(y_train == 1))
    w0 = (hit / miss) if miss > 0 else 1.0
    
    model = lgb.LGBMClassifier(**params, class_weight={0: w0, 1: 1.0})
    model.fit(X_train, y_train)
    return model

def save_model_artifacts(model, artifacts, month_str, config, test_results=None, shap_values=None, feature_names=None):
    model_dir = Path(config['paths']['models']) / month_str
    model_dir.mkdir(parents=True, exist_ok=True)
    
    # 1. Save Model and FE Artifacts
    joblib.dump(model, model_dir / "model.joblib")
    joblib.dump(artifacts, model_dir / "artifacts.joblib")
    
    # 2. Save Metrics as JSON
    if 'metrics' in artifacts:
        with open(model_dir / "metrics.json", "w") as f:
            json.dump(artifacts['metrics'], f, indent=4)
            
    # 3. Save Predictions as CSV
    if test_results is not None:
        test_results.to_csv(model_dir / "predictions.csv", index=False)
        
    # 4. Save SHAP (Aggregated summary)
    if shap_values is not None and feature_names is not None:
        shap_summary = pd.DataFrame({
            "feature": feature_names,
            "mean_abs_shap": np.abs(shap_values).mean(axis=0)
        }).sort_values("mean_abs_shap", ascending=False)
        shap_summary.to_csv(model_dir / "shap_summary.csv", index=False)
        # Also save raw shap for specific detailed UI work if needed
        joblib.dump(shap_values, model_dir / "shap_values.joblib")

    logger.info(f"Full artifacts saved for {month_str} in {model_dir}")

def load_model_artifacts(month_str, config):
    model_dir = Path(config['paths']['models']) / month_str
    model_path = model_dir / "model.joblib"
    artifacts_path = model_dir / "artifacts.joblib"
    
    if not model_path.exists():
        return None, None
    
    model = joblib.load(model_path)
    artifacts = joblib.load(artifacts_path)
    return model, artifacts

def run_rolling_training(df_processed, config, start_month, end_month):
    split_date_col = config['features']['split_date_col']
    target_col = config['features']['target_col']
    policy = config['threshold_policy']
    
    months = sorted(list(pd.period_range(start_month, end_month, freq="M")))
    
    prev_thr = None
    last_y_true = None
    last_probs = None
    month_stats = []
    
    for month in months:
        m_str = str(month)
        logger.info(f"--- Processing Month: {m_str} ---")
        test_start = month.start_time
        test_end = month.end_time
        
        train_start = (month - 12).start_time
        train_end = (month - 1).end_time
        
        train_mask = (df_processed[split_date_col] >= train_start) & (df_processed[split_date_col] <= train_end)
        test_mask = (df_processed[split_date_col] >= test_start) & (df_processed[split_date_col] <= test_end)
        
        train_raw = df_processed.loc[train_mask]
        test_raw = df_processed.loc[test_mask]
        
        if len(train_raw) < 5000:
            logger.warning(f"Not enough training data for {m_str}, skipping...")
            continue
            
        # 1. Feature Engineering
        train_fe, test_fe, fe_artifacts = run_fe_pipeline(train_raw, test_raw, config)
        
        # 2. Train Model
        feature_cols = [c for c in train_fe.columns if c.startswith("f_")]
        X_train = train_fe[feature_cols]
        y_train = train_fe[target_col]
        
        model = train_monthly_model(X_train, y_train, config)
        
        # 3. Predict on Test Month
        X_test = test_fe[feature_cols]
        y_test = test_fe[target_col]
        probs_hit = model.predict_proba(X_test)[:, 1]
        
        # 4. Threshold Tuning (Adaptive based on M-1)
        if prev_thr is None:
            # Try to load from disk if run in isolation
            prev_month = month - 1
            prev_m_str = str(prev_month)
            prev_dir = Path(config['paths']['models']) / prev_m_str
            
            if prev_dir.exists():
                logger.info(f"💾 Found preceding state for {prev_m_str}. Loading context...")
                try:
                    with open(prev_dir / "metrics.json", "r") as f:
                        prev_metrics = json.load(f)
                        prev_thr = prev_metrics.get('threshold')
                    
                    df_prev_p = pd.read_csv(prev_dir / "predictions.csv")
                    last_y_true = df_prev_p['y_true'].to_numpy()
                    last_probs = df_prev_p['hit_probability'].to_numpy()
                    logger.info(f"✅ Context loaded from {prev_m_str}: thr={prev_thr}")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to load preceding context for {prev_m_str}: {e}")

        if prev_thr is None:
            thr_info = {"thr": policy['fallback_threshold'], "reason": "first_month_fallback"}
        else:
            thr_info = adaptive_threshold_from_calib(prev_thr, last_y_true, last_probs, policy)
            
        current_thr = thr_info['thr']
        prev_thr = current_thr
        
        # 5. Evaluate
        metrics = evaluate_threshold_full(y_test, probs_hit, current_thr, beta=policy['beta'])
        metrics['month'] = m_str
        metrics['threshold'] = current_thr
        metrics['thr_reason'] = thr_info['reason']
        month_stats.append(metrics)
        
        # 6. SHAP Explanations
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X_test)
        # In binary classification, SHAP returns a list for each class. We take class 1 (Hit).
        if isinstance(shap_values, list):
            sv = shap_values[1]
        else:
            sv = shap_values

        # 7. Save Comprehensive Artifacts
        test_results = test_fe.copy()
        test_results['y_true'] = y_test.values
        test_results['hit_probability'] = probs_hit
        test_results['risk_score'] = 1.0 - probs_hit
        test_results['predicted_hit'] = (probs_hit >= current_thr).astype(int)
        
        # Local SHAP for top 3 (Risk-oriented: explaining MISS)
        shap_miss = -sv if not isinstance(shap_values, list) else shap_values[0]
        top_shap_df = get_top_shap_features(shap_miss, X_test, top_n=3)
        test_results = pd.concat([test_results.reset_index(drop=True), top_shap_df.reset_index(drop=True)], axis=1)
        
        all_artifacts = {
            "fe_artifacts": fe_artifacts,
            "threshold": current_thr,
            "feature_cols": feature_cols,
            "metrics": metrics
        }
        save_model_artifacts(model, all_artifacts, m_str, config, test_results=test_results, shap_values=sv, feature_names=feature_cols)
        
        # Save Global SHAP Reports (PNGs)
        report_dir = Path(config['paths']['models']) / m_str / "reports"
        save_global_shap_report(sv, X_test, report_dir, m_str)
        
        # Keep track for next month's calibration
        last_y_true = y_test.to_numpy()
        last_probs = probs_hit
        
    return pd.DataFrame(month_stats)
