import pandas as pd
import numpy as np
from sklearn.metrics import confusion_matrix, precision_score, recall_score, f1_score, roc_auc_score

def fb_score(p, r, beta=1.0):
    if p <= 0 and r <= 0: return 0.0
    b2 = beta ** 2
    denom = (b2 * p + r)
    if denom == 0: return 0.0
    return (1 + b2) * (p * r) / denom

def evaluate_threshold_full(y_true, probs_hit, thr_hit, beta):
    y_pred = (probs_hit >= thr_hit).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    
    miss_p = precision_score(y_true, y_pred, pos_label=0, zero_division=0)
    miss_r = recall_score(y_true, y_pred, pos_label=0, zero_division=0)
    miss_f1 = f1_score(y_true, y_pred, pos_label=0, zero_division=0)
    miss_fbeta = fb_score(miss_p, miss_r, beta=beta)
    
    hit_p = precision_score(y_true, y_pred, pos_label=1, zero_division=0)
    hit_r = recall_score(y_true, y_pred, pos_label=1, zero_division=0)
    
    acc = (tp + tn) / (tp + tn + fp + fn)
    auc = roc_auc_score(y_true, probs_hit) if len(np.unique(y_true)) > 1 else np.nan
    
    return {
        "thr_hit": float(thr_hit), "auc": float(auc), "accuracy": float(acc),
        "miss_precision": float(miss_p), "miss_recall": float(miss_r),
        "miss_f1": float(miss_f1), "miss_fbeta": float(miss_fbeta),
        "hit_precision": float(hit_p), "hit_recall": float(hit_r),
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)
    }

def find_best_threshold(y_true, probs_hit, policy):
    beta = policy['beta']
    floor = policy['min_miss_precision']
    thresholds = np.linspace(0.01, 0.60, 120)
    
    best_ok = None
    best_any = None
    
    for thr in thresholds:
        m = evaluate_threshold_full(y_true, probs_hit, thr, beta)
        p, r, fb = m['miss_precision'], m['miss_recall'], m['miss_fbeta']
        
        if best_any is None or fb > best_any['miss_fbeta']:
            best_any = m
            
        if p >= floor:
            if best_ok is None or r > best_ok['miss_recall']:
                best_ok = m
    
    if best_ok:
        best_ok['reason'] = "max_recall_meets_precision_floor"
        return best_ok
    
    best_any['reason'] = "fallback_best_fbeta"
    return best_any

def adaptive_threshold_from_calib(prev_thr, y_true, probs_hit, policy):
    if y_true is None or len(y_true) < policy['min_samples']:
        return {"thr": prev_thr or policy['fallback_threshold'], "reason": "too_few_samples"}
    
    best = find_best_threshold(y_true, probs_hit, policy)
    thr_raw = best['thr_hit']
    thr_clamped = np.clip(thr_raw, policy['clamp_low'], policy['clamp_high'])
    
    # EMA smoothing
    if prev_thr is None:
        thr_final = thr_clamped
    else:
        alpha = policy['smooth_alpha']
        thr_final = alpha * thr_clamped + (1 - alpha) * prev_thr
    
    # Guardrail
    if prev_thr is not None:
        thr_final = np.clip(thr_final, prev_thr - policy['guardrail_max_step'], prev_thr + policy['guardrail_max_step'])
        
    return {"thr": float(thr_final), "reason": best['reason']}
