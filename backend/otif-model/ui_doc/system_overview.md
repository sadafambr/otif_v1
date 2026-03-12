# OTIF Rolling Window Model - System Overview

This document provides a deep dive into the internal mechanics, data pipelines, and architectural decisions of the OTIF Rolling Window AI Manager.

## 1. Data Lifecycle

The system utilizes a hybrid storage approach to balance performance with data freshness.

### SQL Ingestion (`src/data_ingestion.py`)
- **Source**: `SupplyChainAnalyticsDB` (MSSQL).
- **Process**: Data is fetched using a template query that filters by `Requested Delivery Date` (mapped from `Reporting_Date` in SQL).
- **Merge Logic**: The system automatically checks for existing records in the local repository to avoid duplicates, only appending new rows.

### Local Repository (`data/raw/master_orders.parquet`)
- **Format**: Apache Parquet (columnar storage).
- **Reasoning**: Local disk I/O for Parquet is ~10-20x faster than querying a remote SQL server during iterative model training.

---

## 2. The Rolling Window Engine (`src/trainer.py`)

Unlike static models, this system uses a "Rolling Window" training strategy to account for seasonality and shifting supply chain trends.

### Training Logic:
For any target test month (e.g., March 2025):
1. **Training Set**: Uses the preceding 12 months (March 2024 - February 2025).
2. **Feature Engineering**: Artifacts (like miss-rate maps) are calculated *only* using the training set to prevent data leakage.
3. **Model**: A LightGBM Classifier is trained with `class_weight` to handle the class imbalance.

### Artifact Versioning:
Every month has its own folder in `models/month_wise/{month}/`, containing:
- `model.joblib`: The trained LightGBM model.
- `artifacts.joblib`: Numerical thresholds, quantiles, and historical risk maps.
- `metrics.json`: Performance stats (AUC, Precision, Recall).
- `predictions.csv`: The validation results for that month.

---

## 3. Advanced Logic

### Adaptive Thresholding (`src/evaluator.py`)
Standard classifiers use a 0.5 probability (50/50) for predictions. This system uses **Adaptive Thresholding**:
- It searches for a threshold that maximizes **Recall** (capturing more late orders) while ensuring **Precision** stays above a minimum floor (preventing too many "false alarms").

### Risk Mapping (`src/feature_engineering.py`)
- **Miss-Rate Maps**: The system calculates the historical probability of delay for every Material, Plant, and Route. This "Target Encoding" allows the model to learn historical "hotspots" without needing massive categorical datasets.
- **Congestion Flags**: Calculates the volume of orders hitting a specific plant on the same day to flag potential bottleneck risks.

---

## 4. Integrated Diagnostics & XAI (`src/explainability.py`)

The system integrates SHAP (SHapley Additive exPlanations) directly into the pipeline.

- **Global Utility**: During training, a summary of feature importance is saved.
- **Local Utility**: During inference, the system calculates the "Force" of each feature on an individual order. If an order has a 75% risk score, the system identifies which specific factors (e.g., low tolerance + high price) contributed to that 75%.

---

## 5. UI-Inference Integration

The Streamlit app (`app/main.py`) acts as the orchestrator:
1. **Model Loading**: It reads the versioned artifacts for the selected month.
2. **State Management**: It caches the "Master Dataframe" in Streamlit's session state for instant filtering and tab switching.
3. **Dynamic FE**: When a user uploads a new file, the app reapplies the *exact* same transformation logic (using saved thresholds/maps) that was used during training to ensure consistency.
