import pandas as pd
import numpy as np

def add_safe_features(df_in):
    out = df_in.copy()
    num_cols = [
        "Ordered_Qty_in_Kgs", "Ordered_Quantity",
        "Ordered_Value_in_Currency", "Net_Value(Item Level at Document)"
    ]
    for c in num_cols:
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce")

    qty_col = "Ordered_Qty_in_Kgs" if "Ordered_Qty_in_Kgs" in out.columns else "Ordered_Quantity"
    val_col = "Ordered_Value_in_Currency" if "Ordered_Value_in_Currency" in out.columns else "Net_Value(Item Level at Document)"

    out["f_so_to_rdd_days"] = (out["Requested Delivery Date"] - out["SO create date"]).dt.days
    out["f_so_to_mat_avail_days_from_dates"] = (out["Mat_Avl_Date_OTIF"] - out["SO create date"]).dt.days
    out["f_mat_avail_to_rdd_days"] = (out["Requested Delivery Date"] - out["Mat_Avl_Date_OTIF"]).dt.days
    out["f_mat_ready_after_rdd"] = (out["f_mat_avail_to_rdd_days"] < 0).astype("Int64")

    out["f_request_lead_days"] = out["f_so_to_rdd_days"]
    out["f_material_lead_days"] = out["f_so_to_mat_avail_days_from_dates"]

    out["f_lead_gap_days"] = out["f_request_lead_days"] - out["f_material_lead_days"]
    out["f_tight_ratio"] = out["f_request_lead_days"] / (out["f_material_lead_days"] + 1.0)
    out["f_is_tight_order"] = (out["f_tight_ratio"] < 1.0).astype("Int64")
    out["f_is_extremely_tight"] = (out["f_tight_ratio"] < 0.75).astype("Int64")

    out["f_critical_negative_gap"] = (out["f_lead_gap_days"] < -3).astype("Int64")
    out["f_mild_negative_gap"] = ((out["f_lead_gap_days"] < 0) & (out["f_lead_gap_days"] >= -3)).astype("Int64")
    out["f_large_positive_gap"] = (out["f_lead_gap_days"] > 7).astype("Int64")

    out["_qty"] = pd.to_numeric(out.get(qty_col), errors="coerce")
    out["_val"] = pd.to_numeric(out.get(val_col), errors="coerce")
    out["f_unit_price_log"] = np.log1p((out["_val"] / (out["_qty"] + 1e-9)).clip(lower=0))

    # seasonality
    for base, col in [("SO create date", "so"), ("Requested Delivery Date", "rdd")]:
        dt = out[base]
        w = dt.dt.isocalendar().week.astype("Int64").fillna(0).astype(float)
        out[f"f_{col}_woy_sin"] = np.sin(2 * np.pi * (w / 52.0))
        out[f"f_{col}_woy_cos"] = np.cos(2 * np.pi * (w / 52.0))

    out = out.drop(columns=[c for c in ["_qty", "_val"] if c in out.columns])
    return out

def build_miss_rate_maps_recent(train_df, target_col, split_date_col, alpha=20.0, recent_months=6, min_pair_count=20):
    cutoff = train_df[split_date_col].max() - pd.DateOffset(months=recent_months)
    recent_df = train_df[train_df[split_date_col] >= cutoff].copy()
    global_miss = 1.0 - recent_df[target_col].mean()

    maps = {}
    def _single_map(df, gcol):
        stats = df.groupby(gcol)[target_col].agg(["count", "mean"])
        stats["miss_rate"] = 1.0 - stats["mean"]
        stats["miss_rate_smooth"] = (stats["miss_rate"] * stats["count"] + alpha * global_miss) / (stats["count"] + alpha)
        return stats["miss_rate_smooth"].to_dict()

    def _pair_map(df, c1, c2):
        keys = list(zip(df[c1].astype(str), df[c2].astype(str)))
        tmp = df[[target_col]].copy()
        tmp["_k"] = keys
        stats = tmp.groupby("_k")[target_col].agg(["count", "mean"])
        stats = stats[stats["count"] >= min_pair_count]
        if len(stats) == 0: return {}
        stats["miss_rate"] = 1.0 - stats["mean"]
        stats["miss_rate_smooth"] = (stats["miss_rate"] * stats["count"] + alpha * global_miss) / (stats["count"] + alpha)
        return stats["miss_rate_smooth"].to_dict()

    single_specs = [("Ship_To", "f_customer_miss_rate"), ("Material", "f_material_miss_rate"),
                    ("Plant", "f_plant_miss_rate"), ("Division of Business Name", "f_bu_miss_rate")]
    for gcol, feat in single_specs:
        if gcol in recent_df.columns:
            maps[feat] = _single_map(recent_df, gcol)

    if "Material" in recent_df.columns and "Ship_To" in recent_df.columns:
        maps["f_mat_shipto_miss_rate"] = _pair_map(recent_df, "Material", "Ship_To")
    if "Plant" in recent_df.columns and "Material" in recent_df.columns:
        maps["f_plant_material_miss_rate"] = _pair_map(recent_df, "Plant", "Material")
    if "Plant" in recent_df.columns and "Ship_To" in recent_df.columns:
        maps["f_plant_shipto_miss_rate"] = _pair_map(recent_df, "Plant", "Ship_To")

    return float(global_miss), maps

def apply_miss_rate_maps(df, global_miss, maps):
    out = df.copy()
    def _apply_single(feat, gcol):
        if gcol in out.columns and feat in maps:
            out[feat] = out[gcol].astype(str).map(maps[feat]).fillna(global_miss)
        else:
            out[feat] = global_miss

    for feat, gcol in [("f_customer_miss_rate", "Ship_To"), ("f_material_miss_rate", "Material"),
                         ("f_plant_miss_rate", "Plant"), ("f_bu_miss_rate", "Division of Business Name")]:
        _apply_single(feat, gcol)

    def _apply_pair(feat, c1, c2, fb1, fb2):
        if c1 in out.columns and c2 in out.columns and feat in maps:
            keys = list(zip(out[c1].astype(str), out[c2].astype(str)))
            s = pd.Series(keys, index=out.index).map(maps[feat])
            out[feat] = s.fillna(out.get(fb1, global_miss)).fillna(out.get(fb2, global_miss)).fillna(global_miss)
        else:
            out[feat] = out.get(fb1, global_miss).fillna(out.get(fb2, global_miss)).fillna(global_miss)

    _apply_pair("f_mat_shipto_miss_rate", "Material", "Ship_To", "f_material_miss_rate", "f_customer_miss_rate")
    _apply_pair("f_plant_material_miss_rate", "Plant", "Material", "f_plant_miss_rate", "f_material_miss_rate")
    _apply_pair("f_plant_shipto_miss_rate", "Plant", "Ship_To", "f_plant_miss_rate", "f_customer_miss_rate")
    return out

def build_and_apply_congestion_features(train_df, test_df, date_col="SO create date", windows=(7, 30), plant_col="Plant", material_col="Material", shipto_col="Ship_To"):
    tr, te = train_df.copy(), test_df.copy()
    
    # Safety: Ensure date_col is datetime and grouping columns are strings
    for d in [tr, te]:
        if date_col in d.columns and not pd.api.types.is_datetime64_any_dtype(d[date_col]):
            d[date_col] = pd.to_datetime(d[date_col], errors='coerce')
    
    # Crucial: Save original index to restore order and labels later (merge_asof resets index)
    tr["_orig_idx_labels"] = tr.index
    te["_orig_idx_labels"] = te.index
            
    for col, prefix in [(plant_col, "f_plant_orders"), (material_col, "f_material_orders"), (shipto_col, "f_shipto_orders")]:
        if col in tr.columns:
            tr[col] = tr[col].astype(str)
            if col in te.columns:
                te[col] = te[col].astype(str)
                
            for w in windows:
                feat = f"{prefix}_{w}d"
                # Simplified rolling count on history
                daily = tr.groupby([col, tr[date_col].dt.floor("D")]).size().reset_index(name="cnt")
                rolled = daily.set_index(date_col).groupby(col)["cnt"].rolling(f"{w}D").sum().shift(1).reset_index(name=feat)
                
                # Merge back
                tr = pd.merge_asof(tr.sort_values(date_col), rolled.sort_values(date_col), on=date_col, by=col, direction="backward")
                te = pd.merge_asof(te.sort_values(date_col), rolled.sort_values(date_col), on=date_col, by=col, direction="backward")
                tr[feat] = tr[feat].fillna(0)
                te[feat] = te[feat].fillna(0)
    
    # Restore original order and labels
    tr = tr.set_index("_orig_idx_labels").sort_index()
    te = te.set_index("_orig_idx_labels").sort_index()
    return tr, te

def fit_train_thresholds(train_df, qty_col="Ordered_Qty_in_Kgs", value_col="f_unit_price_log", qty_q=0.90, value_q=0.90):
    qty_s = pd.to_numeric(train_df.get(qty_col), errors="coerce")
    qty_p90 = float(qty_s.quantile(qty_q)) if qty_s.notna().any() else 0.0
    val_s = pd.to_numeric(train_df.get(value_col), errors="coerce")
    value_p90 = float(val_s.quantile(value_q)) if val_s.notna().any() else 0.0
    return {"qty_p90": qty_p90, "value_p90": value_p90}

def add_order_complexity_features(df, thresholds, qty_col="Ordered_Qty_in_Kgs", value_col="f_unit_price_log"):
    out = df.copy()
    qty_s = out[qty_col] if qty_col in out.columns else pd.Series(0, index=out.index)
    qty = pd.to_numeric(qty_s, errors="coerce").fillna(0)
    out["f_qty_log"] = np.log1p(qty.clip(lower=0))
    out["f_high_qty_flag"] = (qty >= thresholds.get("qty_p90", 0)).astype(int)
    
    val_s = out[value_col] if value_col in out.columns else pd.Series(0, index=out.index)
    val = pd.to_numeric(val_s, errors="coerce").fillna(0)
    out["f_high_value_flag"] = (val >= thresholds.get("value_p90", 0)).astype(int)
    tight = out["f_is_extremely_tight"] if "f_is_extremely_tight" in out.columns else pd.Series(0, index=out.index)
    tight = tight.fillna(0).astype(int)
    out["f_high_value_x_tight"] = (out["f_high_value_flag"] * tight).astype(int)
    return out

def add_material_counts(train_df, test_df):
    tr, te = train_df.copy(), test_df.copy()
    if "Material" in tr.columns:
        mat_counts = tr.groupby("Material").size()
        tr["f_mat_total_orders_log"] = np.log1p(tr["Material"].map(mat_counts).fillna(0))
        te["f_mat_total_orders_log"] = np.log1p(te["Material"].map(mat_counts).fillna(0))
    else:
        tr["f_mat_total_orders_log"] = 0.0
        te["f_mat_total_orders_log"] = 0.0
    return tr, te

def build_recent_smoothed_rate_map(train_df, key_col, target_col, recent_months=6, alpha=20.0, global_fallback=0.2):
    d = train_df.copy()
    if "split_month" not in d.columns:
        # Fallback to last N months if split_month not precomputed correctly
        max_date = d["Requested Delivery Date"].max()
        cutoff = max_date - pd.DateOffset(months=recent_months)
        d = d[d["Requested Delivery Date"] >= cutoff]
    else:
        max_m = d["split_month"].max()
        recent_start = max_m - (recent_months - 1)
        d = d[d["split_month"] >= recent_start]
        
    y = d[target_col].astype(float)
    global_miss = 1.0 - y.mean() if not y.empty else global_fallback
    
    agg = d.groupby(key_col)[target_col].agg(["count", "mean"])
    miss_rate = 1.0 - agg["mean"]
    agg["smoothed_miss_rate"] = (miss_rate * agg["count"] + alpha * global_miss) / (agg["count"] + alpha)
    
    return global_miss, agg["smoothed_miss_rate"].to_dict()

def apply_rate_map(df, key_col, out_col, global_rate, rate_map):
    out = df.copy()
    out[out_col] = out[key_col].astype(str).map(rate_map).fillna(global_rate)
    return out

def add_tolerance_risk_features(df, over_col, under_col, extremely_tight_col="f_is_extremely_tight", gap_col="f_lead_gap_days", strict_cutoff=0.05):
    out = df.copy()
    over = pd.to_numeric(out.get(over_col), errors="coerce").fillna(0)
    under = pd.to_numeric(out.get(under_col), errors="coerce").fillna(0)
    
    # Auto-normalize if percentages (e.g. 5 instead of 0.05)
    if over.max() > 1 or under.max() > 1:
        over, under = over / 100.0, under / 100.0
        
    band = (over + under).clip(0, 1)
    out["f_tolerance_band"] = band
    out["f_strict_tolerance"] = (band < strict_cutoff).astype(int)
    
    tight = out["f_is_extremely_tight"] if "f_is_extremely_tight" in out.columns else pd.Series(0, index=out.index)
    tight = tight.fillna(0).astype(int)
    out["f_strict_x_tight"] = (out["f_strict_tolerance"] * tight).astype(int)
    
    # Fix: Inverted logic 
    # Strict tolerance (small band) amplifies risk of late orders (negative gap)
    gap = out.get(gap_col, 0.0).fillna(0.0).astype(float)
    negative_gap_mag = (-gap).clip(lower=0.0)
    strictness_proxy = 1.0 / (band + 1e-6)
    out["f_tolerance_x_gap"] = (negative_gap_mag * strictness_proxy).clip(upper=1e6)
    
    return out

def add_interaction_stack_features(df):
    out = df.copy()
    gap = out["f_lead_gap_days"] if "f_lead_gap_days" in out.columns else pd.Series(0.0, index=out.index)
    gap = gap.fillna(0.0).abs()
    
    tight = out["f_is_extremely_tight"] if "f_is_extremely_tight" in out.columns else pd.Series(0, index=out.index)
    tight = tight.fillna(0).astype(int)
    
    strict = out["f_strict_tolerance"] if "f_strict_tolerance" in out.columns else pd.Series(0, index=out.index)
    strict = strict.fillna(0).astype(int)
    
    plant_miss = out["f_plant_miss_rate"] if "f_plant_miss_rate" in out.columns else pd.Series(0.5, index=out.index)
    plant_miss = plant_miss.fillna(0.5)
    
    load = out["f_plant_orders_30d"] if "f_plant_orders_30d" in out.columns else pd.Series(0.0, index=out.index)
    load = load.fillna(0.0)
    
    pressure = out["f_tight_ratio"] if "f_tight_ratio" in out.columns else pd.Series(1.0, index=out.index)
    pressure = pressure.fillna(1.0)
    
    out["f_gap_x_load"] = gap * load
    out["f_tight_x_plant_load"] = tight * load
    out["f_strict_x_plant_miss_rate"] = strict * plant_miss
    
    mat_miss = out.get("f_material_miss_rate", 0.5).fillna(0.5)
    shipto_miss = out.get("f_customer_miss_rate", 0.5).fillna(0.5)
    out["f_mat_shipto_x_pressure"] = (mat_miss + shipto_miss) * pressure
    
    # Risk flags
    out["f_high_plant_risk"] = (out.get("f_plant_miss_rate", 0) > 0.25).astype(int)
    out["f_risk_stack"] = (out["f_high_plant_risk"] * tight).astype(int)
    out["f_otif_risk_score"] = (tight + out.get("f_critical_negative_gap", 0) + out["f_high_plant_risk"]).astype(float)
    
    return out

def run_fe_pipeline(train_df, test_df, config):
    tr, te = train_df.copy(), test_df.copy()
    target_col = config['features']['target_col']
    split_date_col = config['features']['split_date_col']
    
    # 1. Safe features
    tr = add_safe_features(tr)
    te = add_safe_features(te)
    
    # 2. Congestion
    tr, te = build_and_apply_congestion_features(tr, te)
    
    # 3. Miss rates (Standard)
    global_miss, maps = build_miss_rate_maps_recent(tr, target_col, split_date_col)
    tr = apply_miss_rate_maps(tr, global_miss, maps)
    te = apply_miss_rate_maps(te, global_miss, maps)
    
    # 4. State Miss Rate 
    g_state, state_map = build_recent_smoothed_rate_map(tr, "State - Province", target_col)
    tr = apply_rate_map(tr, "State - Province", "f_state_miss_rate", g_state, state_map)
    te = apply_rate_map(te, "State - Province", "f_state_miss_rate", g_state, state_map)
    
    # 5. Material History Counts 
    tr, te = add_material_counts(tr, te)
    
    # 6. Thresholds (qty, value)
    thresholds = fit_train_thresholds(tr)
    tr = add_order_complexity_features(tr, thresholds)
    te = add_order_complexity_features(te, thresholds)
    
    # 7. Tolerance
    tr = add_tolerance_risk_features(tr, "Overdeliv_Tolerance_OTIF", "Underdel_Tolerance_OTIF")
    te = add_tolerance_risk_features(te, "Overdeliv_Tolerance_OTIF", "Underdel_Tolerance_OTIF")
    
    # 8. Interaction stack
    tr = add_interaction_stack_features(tr)
    te = add_interaction_stack_features(te)
    
    # 9. Gap bin logic (Quantile on Train)
    gap_q = float(tr["f_lead_gap_days"].quantile(0.25))
    tr["f_gap_bin"] = (tr["f_lead_gap_days"] > gap_q).astype(int)
    te["f_gap_bin"] = (te["f_lead_gap_days"] > gap_q).astype(int)
    
    # 10. Robust Imputation (Median from Train)
    feature_cols = [c for c in tr.columns if c.startswith("f_")]
    med_vals = tr[feature_cols].median()
    tr[feature_cols] = tr[feature_cols].fillna(med_vals)
    te[feature_cols] = te[feature_cols].fillna(med_vals)
    
    return tr, te, {
        "global_miss": global_miss, 
        "maps": maps, 
        "state_map": state_map,
        "g_state": g_state,
        "thresholds": thresholds, 
        "gap_q": gap_q,
        "imputation": med_vals.to_dict()
    }

def run_inference_pipeline(df_input, fe_artifacts, config, history_df=None):
    """
    Unified inference pipeline to ensure consistency between training/backtest and custom prediction.
    """
    out = df_input.copy()
    
    # 1. Safe features
    out = add_safe_features(out)
    
    # 2. Congestion (Requires history)
    if history_df is not None:
        # We only need to compute congestion for the new records
        # build_and_apply_congestion_features expects both tr and te
        # We use history_df as tr and out as te
        _, out = build_and_apply_congestion_features(history_df, out)
    else:
        # Fallback if no history (not ideal, but prevents crash)
        for prefix in ["f_plant_orders", "f_material_orders", "f_shipto_orders"]:
            for w in [7, 30]:
                feat = f"{prefix}_{w}d"
                if feat not in out.columns:
                    out[feat] = 0.0
    
    # 3. Miss rates (Standard)
    out = apply_miss_rate_maps(out, fe_artifacts['global_miss'], fe_artifacts['maps'])
    
    # 4. State Miss Rate
    if 'state_map' in fe_artifacts:
        out = apply_rate_map(out, "State - Province", "f_state_miss_rate", fe_artifacts.get('g_state', 0.2), fe_artifacts['state_map'])
    
    # 5. Material History Counts
    if history_df is not None and "Material" in history_df.columns:
        mat_counts = history_df.groupby("Material").size()
        out["f_mat_total_orders_log"] = np.log1p(out["Material"].map(mat_counts).fillna(0))
    else:
        out["f_mat_total_orders_log"] = 0.0
        
    # 6. Thresholds (qty, value)
    out = add_order_complexity_features(out, fe_artifacts['thresholds'])
    
    # 7. Tolerance
    out = add_tolerance_risk_features(out, "Overdeliv_Tolerance_OTIF", "Underdel_Tolerance_OTIF")
    
    # 8. Interaction stack
    out = add_interaction_stack_features(out)
    
    # 9. Gap bin logic
    out["f_gap_bin"] = (out["f_lead_gap_days"] > fe_artifacts.get('gap_q', 0)).astype(int)
    
    # 10. Robust Imputation
    feature_cols = [c for c in out.columns if c.startswith("f_")]
    if 'imputation' in fe_artifacts:
        for col, val in fe_artifacts['imputation'].items():
            if col in out.columns:
                out[col] = out[col].fillna(val)
            else:
                out[col] = val
                
    return out
