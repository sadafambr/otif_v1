import pandas as pd
import sqlalchemy as sa
import logging
import os
import yaml
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def load_config(config_path="config/config.yaml"):
    with open(config_path, "r") as f:
        return yaml.safe_load(f)

def get_engine(config):
    db_cfg = config['database']
    connection_string = (
        f"mssql+pyodbc://@{db_cfg['server']}/{db_cfg['name']}"
        f"?driver={db_cfg['driver'].replace(' ', '+')}"
        "&trusted_connection=yes"
    )
    return sa.create_engine(connection_string)

def get_local_master_data(config):
    master_path = Path(config['paths']['raw_data']) / "master_orders.parquet"
    if master_path.exists():
        df = pd.read_parquet(master_path)
        date_col = config['features']['split_date_col']
        if date_col in df.columns:
            df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
        return df
    return None

def save_master_data(df, config):
    master_path = Path(config['paths']['raw_data']) / "master_orders.parquet"
    master_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(master_path, index=False)
    logger.info(f"Master data saved to {master_path}")

def append_to_master_data(new_df, config):
    master_path = Path(config['paths']['raw_data']) / "master_orders.parquet"
    if master_path.exists():
        existing_df = pd.read_parquet(master_path)
        # Assuming [Sales order] and [SO Line] are the unique keys
        combined = pd.concat([existing_df, new_df], ignore_index=True)
        # Drop duplicates based on keys
        key_cols = ["Sales order", "SO Line"]
        if all(k in combined.columns for k in key_cols):
            combined = combined.drop_duplicates(subset=key_cols, keep="last")
        else:
            combined = combined.drop_duplicates(keep="last")
        
        combined.to_parquet(master_path, index=False)
        logger.info(f"Appended {len(new_df)} rows to master data. New total: {len(combined)}")
        return combined
    else:
        save_master_data(new_df, config)
        return new_df

def fetch_data(config, query, start_date=None, end_date=None, use_cache=True):
    # If dates provided, we use a specific cache name for that slice
    cache_name = f"otif_data_{start_date}_{end_date}.parquet" if (start_date and end_date) else "otif_data_latest.parquet"
    cache_path = Path(config['paths']['raw_data']) / cache_name
    
    if use_cache and cache_path.exists():
        logger.info(f"Loading from cache: {cache_path}")
        return pd.read_parquet(cache_path)
    
    logger.info("Fetching from SQL...")
    if start_date and end_date:
        # Standard replacements for our specific template
        query = query.replace("'2023-09-01'", f"'{start_date}'")
        query = query.replace("'2026-02-01'", f"'{end_date}'")
    
    engine = get_engine(config)
    df = pd.read_sql(query, engine)
    
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(cache_path, index=False)
    return df

# Example query template from notebook
SQL_QUERY_TEMPLATE = """
WITH OTIF_Base_Data AS (
    SELECT 
        [Sales order],
        [SO Line],
        [SO create date],
        [Mat_Avl_Date_OTIF],
        Material, 
        [Material description],
        [ABC Indicator],
        Plant,
        Ship_To,
        [Sold-to party], 
        [Net value_y] AS [Net_Value(Header Level od Document)], 
        [Net value_x] AS [Net_Value(Item Level at Document)], 
        [Document Currency] AS [Local Currency],
        [Net weight] AS Ordered_Quantity, 
        [Sales Organization], 
        Reporting_Date AS [Requested Delivery Date], 
        CSR,
        Customer_Pickup, 
        [OTIF_HIT/MISS],
        [OTIF_Type], 
        Overdeliv_Tolerance_OTIF,
        Underdel_Tolerance_OTIF, 
        [Confirmed Quantity_OTIF] AS First_Confirmed_Quantity, 
        Time_Factor, 
        [Delivery Date_y_OTIF] AS [Delivery_Date For Solenis], 
        Act_Gd_Mvmnt_Date_OTIF AS [Delivery_Date For Sigura and Diversey (Actual Goods Movement)],
        TASKI_Indicator AS [TASKI Machine Indicator], 
        [Delivery Number], 
        [Delivery Created On], 
        Agg_Qty AS Orderd_Qty_y
    FROM [SupplyChainAnalyticsDB].dbo.SCA_N_OTIF_v3 a
    WHERE Reporting_Date >= '2023-09-01'
      AND Reporting_Date <  '2026-02-01'
      AND [Customer group] <> '99'
      AND [Item category] <> 'ZFTG'
      AND [Order reason] NOT IN ('Z70', 'Y42')
      AND [Customer_Pickup] = 'No'
      AND [OTIF_Type] = 'Internal Plant OTIF'
      AND EXISTS (
          SELECT 1
          FROM SupplyChainAnalyticsDB.dbo.SCA_Plant_Master b
          WHERE a.Plant = b.Plant
            AND b.[Plant Region] = 'NAM'
      )
),

VBAP AS (
    SELECT DISTINCT
        REPLACE(LTRIM(REPLACE(a.[VBELN: (PK) Sales Document],'0',' ')),' ','0') AS [Sales Order],
        REPLACE(LTRIM(REPLACE(a.[POSNR: (PK) Sales Document Item],'0',' ')),' ','0') AS [SOItem],
        a.[MATNR: Material Number] AS Material,
        a.[NTGEW: Net Weight of the Item],
        a.[GEWEI: Unit of Weight],
        a.[PSTYV: Sales Document Item Category] AS ItemCategory,
        a.[WERKS: Plant (Own or External)] AS Plant,
        b.[Location Type for Metrics],
        a.[NETWR: Net value of the order item in document currency] AS NetValue_in_Local_Currency,
        a.[WAERK: SD Document Currency] AS SD_Document_Currency,
        CASE 
            WHEN a.[GEWEI: Unit of Weight] = 'KG' THEN a.[NTGEW: Net Weight of the Item]
            WHEN a.[GEWEI: Unit of Weight] = 'G'  THEN a.[NTGEW: Net Weight of the Item] * 0.001
            WHEN a.[GEWEI: Unit of Weight] = 'LB' THEN a.[NTGEW: Net Weight of the Item] * 0.453592
            WHEN a.[GEWEI: Unit of Weight] = 'OZ' THEN a.[NTGEW: Net Weight of the Item] * 0.0283495
            ELSE a.[NTGEW: Net Weight of the Item]
        END AS NtWtInKGs,
        a.[MEINS: Base Unit of Measure] AS BaseUOM,
        [KWMENG: Cumulative Order Quantity in Sales Units] *
        (CAST([UMVKZ: Numerator (factor) for conversion of sales quantity into SKU] AS FLOAT) /
         NULLIF([UMVKN: Denominator (Divisor) for Conversion of Sales Qty into SKU], 0)) AS Base_Quanity
    FROM [LIB_EDW_RTP].[bv].[VBAP: Sales Document: Item Data] a
    LEFT JOIN (
        SELECT DISTINCT Plant, [Location Type for Metrics], [Legacy Firm]
        FROM SupplyChainAnalyticsDB.dbo.SCA_Plant_Master
    ) b
        ON a.[WERKS: Plant (Own or External)] = b.Plant
    WHERE EXISTS (
        SELECT 1
        FROM OTIF_Base_Data c
        WHERE REPLACE(LTRIM(REPLACE(a.[VBELN: (PK) Sales Document],'0',' ')),' ','0') = c.[Sales order]
          AND REPLACE(LTRIM(REPLACE(a.[POSNR: (PK) Sales Document Item],'0',' ')),' ','0') = c.[SO Line]
    )
),

LIPS AS (
    SELECT
        REPLACE(LTRIM(REPLACE(LIPS.[VGBEL: Document Number of Reference Document],'0',' ')),' ','0') AS [Sales Order],
        REPLACE(LTRIM(REPLACE(LIPS.[VGPOS: Item number of the reference item],'0',' ')),' ','0') AS [SOItem],
        LIPS.[MATNR: Material Number] AS Material,
        LIPS.[WERKS: Plant] AS Plant,
        LIPS.[MEINS: Base Unit of Measure] AS Base_UOM,
        SUM(
            CASE 
                WHEN LIPS.[GEWEI: Unit of Weight] = 'KG' THEN LIPS.[NTGEW: Net Weight]
                WHEN LIPS.[GEWEI: Unit of Weight] = 'G'  THEN LIPS.[NTGEW: Net Weight] * 0.001
                WHEN LIPS.[GEWEI: Unit of Weight] = 'LB' THEN LIPS.[NTGEW: Net Weight] * 0.453592
                WHEN LIPS.[GEWEI: Unit of Weight] = 'OZ' THEN LIPS.[NTGEW: Net Weight] * 0.0283495
                ELSE LIPS.[NTGEW: Net Weight]
            END
        ) AS Delivered_NtWtInKGs,
        SUM(
            LIPS.[LFIMG: Actual quantity delivered (in sales units)] *
            (CAST(LIPS.[UMVKZ: Numerator (factor) for conversion of sales quantity into SKU] AS FLOAT) /
             NULLIF(LIPS.[UMVKN: Denominator (Divisor) for Conversion of Sales Qty into SKU], 0))
        ) AS Delivered_Quantity_in_Base_UOM
    FROM [LIB_EDW_RTP].[bv].[LIPS: SD document: Delivery: Item data] LIPS
    WHERE EXISTS (
        SELECT 1
        FROM OTIF_Base_Data c
        WHERE REPLACE(LTRIM(REPLACE(LIPS.[VGBEL: Document Number of Reference Document],'0',' ')),' ','0') = c.[Sales order]
          AND REPLACE(LTRIM(REPLACE(LIPS.[VGPOS: Item number of the reference item],'0',' ')),' ','0') = c.[SO Line]
    )
    GROUP BY
        LIPS.[VGBEL: Document Number of Reference Document],
        LIPS.[VGPOS: Item number of the reference item],
        LIPS.[MATNR: Material Number],
        LIPS.[WERKS: Plant],
        LIPS.[MEINS: Base Unit of Measure]
)

SELECT
    a.*,
    b.NtWtInKGs AS Ordered_Qty_in_Kgs,
    b.BaseUOM AS Ordered_Quantity_Base_UOM,
    b.Base_Quanity AS Ordered_in_Base_UOM,
    b.NetValue_in_Local_Currency AS Ordered_Value_in_Currency,
    b.SD_Document_Currency AS Local_Currency_Item,
    c.Delivered_NtWtInKGs AS Delivered_Qty_in_Kgs,
    c.Delivered_Quantity_in_Base_UOM,
    c.Base_UOM,
    d.[Customer Name],
    d.City,
    d.Country,
    d.[State - Province],
    g.[Division of Business Name],
    g.[Product Line Name] AS Material_Product_line,
    g.MATERIAL_TYPE,
    g.[Material Base Code Desc]
FROM OTIF_Base_Data a
LEFT JOIN VBAP b
    ON a.[Sales order] = b.[Sales Order]
   AND a.[SO Line]     = b.[SOItem]
LEFT JOIN LIPS c
    ON a.[Sales order] = c.[Sales Order]
   AND a.[SO Line]     = c.[SOItem]
LEFT JOIN (
    SELECT DISTINCT
        REPLACE(LTRIM(REPLACE(Customer,'0',' ')),' ','0') AS Customer_Key,
        [Customer Name],
        City,
        [State - Province],
        Country
    FROM LIB_EDW_RTP.dim.Customer
) d
    ON REPLACE(LTRIM(REPLACE(a.Ship_To,'0',' ')),' ','0') = d.Customer_Key
LEFT JOIN (
    SELECT DISTINCT
        Material,
        [Division of Business Name],
        [Product Line Name],
        MATERIAL_TYPE,
        [Material Base Code Desc]
    FROM SupplyChainAnalyticsDB.dbo.SCA_Material_Master
) g
    ON a.Material = g.Material;
"""
