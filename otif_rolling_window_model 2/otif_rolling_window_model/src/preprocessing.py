import pandas as pd
import numpy as np

def _parse_dates(df, date_cols):
    out = df.copy()
    for col in date_cols:
        if col in out.columns:
            out[col] = pd.to_datetime(out[col], errors="coerce")
    return out

def _drop_leakage(df, leakage_cols):
    return df.drop(columns=[c for c in leakage_cols if c in df.columns], errors="ignore")

def _make_target(df, target_raw, target_col):
    if target_raw not in df.columns:
        return df
    out = df.copy()
    out[target_col] = (
        out[target_raw].astype(str).str.strip().str.lower().map({"hit": 1, "miss": 0})
    )
    # Only drop rows if target was expected but missing values
    out = out.dropna(subset=[target_col])
    out[target_col] = out[target_col].astype(int)
    return out

def preprocess_data(df, config):
    # 1. Parse dates using dayfirst if needed (notebook uses dayfirst=True in some cases, 
    # but pd.to_datetime usually handles it. Notebook line 899 uses dayfirst=True)
    df = _parse_dates(df, config['features']['date_cols'])
    
    # 2. Leakage and merge artifacts
    leakage_cols = [
        "Delivery_Date For Solenis",
        "Delivery_Date For Sigura and Diversey (Actual Goods Movement)",
        "Delivery Number",
        "Delivery Created On",
        "Delivered_Qty_in_Kgs",
        "Delivered_Quantity_in_Base_UOM",
        "OTIF_Type",
        "Time_Factor",
    ]
    df = _drop_leakage(df, leakage_cols)
    if "Orderd_Qty_y" in df.columns:
        df = df.drop(columns=["Orderd_Qty_y"])
        
    # 3. Categorical missing -> "Unknown"
    categorical_cols = [
        "Division of Business Name",
        "MATERIAL_TYPE",
        "Material_Product_line",
        "ABC Indicator",
        "Base_UOM",
        "Material Base Code Desc",
        "Ordered_Quantity_Base_UOM",
        "Local_Currency_Item"
    ]
    for col in categorical_cols:
        if col in df.columns:
            df[col] = df[col].fillna("Unknown")
            
    # 4. Target creation
    df = _make_target(df, config['features']['target_raw'], config['features']['target_col'])
    
        
    # 6. Split month
    split_date_col = config['features']['split_date_col']
    if split_date_col in df.columns:
        df = df.dropna(subset=[split_date_col])
        df["split_month"] = df[split_date_col].dt.to_period("M")
    
    return df
