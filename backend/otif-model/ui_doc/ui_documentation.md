# OTIF Prediction & Insights - UI Documentation

This document provide a detailed explanation of the user interface for the OTIF (On-Time In-Full) Prediction system. The UI is built using Streamlit and is designed to provide both technical performance metrics and business-oriented risk insights.

## Sidebar Controls

- **Report Selection**: Allows users to select a specific "Test Month" to view historical performance or XAI insights for that period.
- **Navigation Guide**: Quick links and descriptions of the four main application tabs.

---

## 📊 Model Dashboard
The primary technical health check for the model.

### 🏆 Performance Overview
- **Miss Precision**: Accuracy in predicting late orders (How often is the model right when it says an order will be late?).
- **Miss Recall**: Capture rate of late orders (How many of the actual late orders did the model identify?).
- **Model Accuracy**: Overall correctness across both HIT and MISS categories.
- **AUC-ROC**: A measure of the model's ability to distinguish between on-time and late orders.

### 📈 Model Evaluation
- **Confusion Matrix**: A visual breakdown of True Positives, True Negatives, False Positives (Type I Error), and False Negatives (Type II Error).
- **ROC & Precision-Recall Curves**: Visualizations showing how model performance changes across different probability thresholds.

### 🎯 Prediction Distribution
- **Donut Chart**: Shows the percentage split between predicted "HIT" (On-time) and "MISS" (Late) for the selected month.
- **Raw Volume**: Numeric counts of total, HIT, and MISS predictions.

### 🛠️ Advanced Model Options
- **Force Re-train**: Triggers a clean training run for the selected month, bypassing existing artifacts.
- **Optimal Threshold**: Displays the adaptive threshold calculated during training to balance business objectives.
- **Download Data**: Export the raw predictions for further investigation in Excel.

---

## 🔍 XAI SHAP Explanation
Uses SHAP (SHapley Additive exPlanations) to demystify the "black box" of AI.

### Global SHAP Risk Drivers
- **Feature Importance Bar Chart**: Shows which supply chain variables have the highest overall influence on delivery reliability.
- **Risk Factor Interpretation**: Translates technical feature names (e.g., `f_lead_gap_days`) into business context (e.g., "Lead Time Tightness").

### 🖼️ Aggregated SHAP Reports
- **Global Summary (Beeswarm)**: Shows the direction of impact. For example, it visualizes how low lead time (blue dots) correlates with higher delay risk.

### Local Order-Level Risk Explanations
- **Searchable Table**: Allows users to look up specific Material IDs or Ship-To locations.
- **prob_miss**: The raw probability (0% to 100%) that an order will be late.
- **Local Drivers**: Displays the top 3 specific reasons *why* that individual order was flagged as high risk.

---

## 📥 Custom Prediction
Enables proactive risk scoring for current or upcoming orders.

### Workflow:
1. **Model Selection**: Choose a pre-trained model (usually the most recent stable month).
2. **File Upload**: Upload a CSV or Excel file containing order data.
3. **Generate Predictions**: The system cleans data, engineers features, and scores the batch in real-time.

### Insights:
- **Batch Highlights**: Automated summary of the most significant risk drivers found in the uploaded file.
- **Distribution Chart**: Visual split of risks within the batch.
- **Download Enhanced Export**: Saves the original file with added `prediction`, `risk_score`, and `top_drivers` columns.

---

## ⚙️ Data Management
Controls the data lifecycle and system maintenance.

- **Local Repository Status**: Shows how many orders are currently stored in the local `.parquet` database.
- **SQL Synchronization**: 
    - Fetch fresh data from the MSSQL server.
    - **Overwrite**: Replace the local database.
    - **Append**: Merge new data with the existing history.
- **Full Backtest**: A "One-Click" operation to re-train the entire 12-24 month window, usually run after a major feature engineering update.
- **Clear Repository**: Resets the local data store.
