# OTIF Rolling Window Model Productionization

This repository contains the productionized version of the On-Time, In-Full (OTIF) classification model, originally developed in a rolling window research notebook.

## Key Modules

- **Data Ingestion**: SQL extraction from MSSQL with local file caching.
- **Modular Preprocessing**: Clean pipeline for date parsing and leakage removal.
- **Advanced Feature Engineering**: 30+ features including congestion flags, miss-rate maps, and interaction risk scores.
- **Rolling Training**: Monthly training cycles (Train M-12 to M-1) with saved artifacts for each test month.
- **Adaptive Thresholding**: Policy-driven threshold tuning that balances recall and precision.
- **SHAP Explanations**: Seamlessly integrated global and local model interpretability.

## 📚 Documentation
- [**UI Documentation**](file:///c:/Work/otif_rolling_window_model/ui_documentation.md): Detailed guide for the Streamlit application and its features.
- [**System Overview**](file:///c:/Work/otif_rolling_window_model/system_overview.md): Technical deep dive into the data lifecycle, rolling training, and adaptive logic.
- [**System Architecture**](file:///c:/Work/otif_rolling_window_model/architecture.md): Data flow diagram and component roles.

## Project Structure

```text
├── app/
│   └── main.py              # Streamlit Application 
├── config/
│   └── config.yaml          # Model params & Database config
├── data/
│   └── raw/                 # Local Master Repository (master_orders.parquet)
├── models/
│   └── month_wise/          # Versioned Artifacts (Model, Metrics, SHAP Reports)
├── notebooks/               # Experimentation & Research files
├── src/                     # Core Processing Engine
│   ├── data_ingestion.py    # SQL Sync & Local caching
│   ├── preprocessing.py     # In-memory data cleaning
│   ├── feature_engineering.py # Supply chain risk logic
│   ├── trainer.py           # Stateful rolling automation
│   ├── evaluator.py         # Adaptive thresholding logic
│   └── explainability.py    # SHAP & Advanced Analytics
├── architecture.md          # Detailed system data flow
└── requirements.txt         # Production dependencies
```

## Quick Start

1. **Setup Environment**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run Streamlit App**:
   ```bash
   streamlit run app/main.py
   ```

3. **Database Access**:
   Ensure you are on the company network with access to the `SDVWEDWSHSS01` server.

## Pipeline Details

### Training & Calibration
The `Model Training` tab executes a rolling window backtest. For each month, it:
1. Trains a new LightGBM model.
2. Tunes the threshold using a calibration strategy (maximizing recall while meeting a precision floor).
3. Saves all artifacts (miss-rate maps, quantity/value quantiles) needed to recreate the exact feature set during inference.

### Daily Inference
The `Daily Prediction` tab allows operators to:
1. Upload current order lists.
2. Select a target model month.
3. Generate risk labels with directional SHAP explainers (e.g., "Top Risk Factor: Plant Congestion").
