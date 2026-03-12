import streamlit as st
import pandas as pd
import numpy as np
import sys
import os
import joblib
import plotly.express as px
from datetime import datetime
from pathlib import Path

# Add project root to sys.path
root_path = str(Path(__file__).parent.parent)
if root_path not in sys.path:
    sys.path.append(root_path)

import joblib
import plotly.graph_objects as go

# Import local modules
import src.data_ingestion as di
import src.preprocessing as pp
import src.trainer as tr
import src.evaluator as ev
import src.explainability as exp
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import confusion_matrix, precision_recall_curve, roc_curve, auc, f1_score
import importlib
importlib.reload(exp) # Force reload to pick up new functions

st.set_page_config(page_title="OTIF Prediction & Insights UI", layout="wide")

def main():
    st.title("OTIF Prediction & Insights UI")
    
    config = di.load_config()
    
    # Global Data Loading
    if st.session_state.get("master_df") is None:
        st.session_state.master_df = di.get_local_master_data(config)
    
    # 1. Shared Month Selection
    date_col = config['features']['split_date_col']
    all_months = get_available_months_from_data(st.session_state.master_df, date_col)
    
    if not all_months:
        st.warning("No data found in local repository. Please go to 'Data Management' to sync from SQL.")
        return
        
    st.sidebar.header("Report Selection")
    if "selected_month" not in st.session_state:
        st.session_state.selected_month = all_months[-1]
        
    selected_month = st.sidebar.selectbox("Select Test Month", all_months, 
                                         index=all_months.index(st.session_state.selected_month))
    st.session_state.selected_month = selected_month

    st.sidebar.divider()
    st.sidebar.write("### Navigation Guide")
    st.sidebar.info("""
    - **Model Dashboard**: Technical health and performance metrics.
    - **XAI SHAP Explaination**: Business-friendly risk drivers and insights.
    - **Custom Prediction**: Upload your own orders for live risk scoring.
    - **Data Management**: Sync local repository with SQL server.
    """)

    tab1, tab2, tab3, tab4 = st.tabs([
        "📊 Model Dashboard", 
        "🔍 XAI SHAP Explaination", 
        "📥 Custom Prediction",
        "⚙️ Data Management"
    ])
    
    with tab1:
        # Performance Metrics & Diagnostics
        render_diagnostics_tab(config)
        
    with tab2:
        # Explainability & Risk Drivers
        render_shap_tab(config)
        
    with tab3:
        render_upload_tab(config)
        
    with tab4:
        render_mgmt_tab(config)

def get_available_months_from_data(df, date_col):
    if df is None or date_col not in df.columns:
        return [str(p) for p in pd.period_range("2024-01", "2025-12", freq="M")]
    
    dates = pd.to_datetime(df[date_col], errors='coerce').dropna()
    if dates.empty:
        return [str(p) for p in pd.period_range("2024-01", "2025-12", freq="M")]
    
    periods = sorted(dates.dt.to_period("M").unique())
    return [str(p) for p in periods]

def plot_confusion_matrix_custom(y_true, y_pred):
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    fig, ax = plt.subplots(figsize=(5, 4))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=ax,
                xticklabels=['MISS', 'HIT'], yticklabels=['MISS', 'HIT'])
    ax.set_xlabel('Predicted')
    ax.set_ylabel('Actual')
    ax.set_title('Confusion Matrix')
    return fig

def plot_performance_curves(y_true, y_prob):
    # ROC Curve
    fpr, tpr, _ = roc_curve(y_true, y_prob)
    roc_auc = auc(fpr, tpr)
    
    # PR Curve
    precision, recall, _ = precision_recall_curve(y_true, y_prob)
    
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))
    
    ax1.plot(fpr, tpr, color='darkorange', lw=2, label=f'ROC (AUC = {roc_auc:.2f})')
    ax1.plot([0, 1], [0, 1], color='navy', lw=2, linestyle='--')
    ax1.set_xlabel('False Positive Rate')
    ax1.set_ylabel('True Positive Rate')
    ax1.set_title('ROC Curve')
    ax1.legend(loc="lower right")
    
    ax2.plot(recall, precision, color='blue', lw=2)
    ax2.set_xlabel('Recall')
    ax2.set_ylabel('Precision')
    ax2.set_title('Precision-Recall Curve')
    
    plt.tight_layout()
    return fig

def plot_predicted_distribution(y_pred):
    counts = pd.Series(y_pred).value_counts().sort_index()
    labels = [ "MISS" if k == 0 else "HIT" for k in counts.index]
    
    fig = px.pie(
        names=labels,
        values=counts.values,
        title="Predicted OTIF Distribution",
        color=labels,
        color_discrete_map={"HIT": "#2ecc71", "MISS": "#e74c3c"},
        hole=0.4
    )
    fig.update_traces(textposition='inside', textinfo='percent+label+value')
    return fig


def render_diagnostics_tab(config):
    selected_month = st.session_state.selected_month
    st.subheader(f"📊 Model Performance: {selected_month}")
    
    model, artifacts = tr.load_model_artifacts(selected_month, config)
    
    if model is None:
        st.warning(f"No trained model found for **{selected_month}**.")
        if st.button(f"Train Model for {selected_month}", key="train_diag"):
            import time
            start_time = time.time()
            with st.status(f"Training Model for {selected_month}...", expanded=True) as status:
                st.write("Preprocessing data...")
                df_processed = pp.preprocess_data(st.session_state.master_df, config)
                st.write("Running training...")
                tr.run_rolling_training(df_processed, config, selected_month, selected_month)
                elapsed_time = time.time() - start_time
                status.update(label=f"✅ Training Complete! (Took {elapsed_time:.2f}s)", state="complete", expanded=False)
            st.rerun()
        return

    metrics = artifacts.get('metrics', {})
    
    # Hero Metrics
    st.markdown("### 🏆 Performance Overview")
    m1, m2, m3, m4 = st.columns(4)
    with m1:
        st.metric("Miss Precision", f"{metrics.get('miss_precision', 0):.2%}", help="Accuracy in predicting late orders")
    with m2:
        st.metric("Miss Recall", f"{metrics.get('miss_recall', 0):.2%}", help="Proportion of actual late orders captured")
    with m3:
        st.metric("Model Accuracy", f"{metrics.get('accuracy', 0):.2%}", help="Overall proportion of correct predictions (HIT and MISS)")
    with m4:
        st.metric("AUC-ROC", f"{metrics.get('auc', 0):.3f}", help="Standard metric for model's ability to distinguish classes")
        
    with st.expander("🛠️ Advanced Model Options"):
        if st.button(f"🔄 Force Re-train {selected_month}"):
            import time
            start_time = time.time()
            with st.status("Re-training model...", expanded=True) as status:
                st.write("Preprocessing data...")
                df_processed = pp.preprocess_data(st.session_state.master_df, config)
                st.write("Running training...")
                tr.run_rolling_training(df_processed, config, selected_month, selected_month)
                elapsed_time = time.time() - start_time
                status.update(label=f"✅ Re-build Complete! (Took {elapsed_time:.2f}s)", state="complete", expanded=False)
            st.rerun()

    st.divider()
    
    # Detailed Analytics Row 1: Confusion Matrix & Business Lift
    st.markdown("### 📈 Model Evaluation")
    col1, col2 = st.columns([1, 1.5])
    
    pred_path = Path(config['paths']['models']) / selected_month / "predictions.csv"
    if pred_path.exists():
        df_p = pd.read_csv(pred_path)
        y_true = df_p['y_true']
        y_prob = df_p['hit_probability']
        y_pred = df_p['predicted_hit']
        
        with col1:
            st.pyplot(plot_confusion_matrix_custom(y_true, y_pred))
            
        with col2:
            st.pyplot(plot_performance_curves(y_true, y_prob))

    st.divider()
    st.markdown("### 🎯 Prediction Distribution")
    if pred_path.exists():
        d_col1, d_col2 = st.columns([1, 1])
        with d_col1:
            st.plotly_chart(plot_predicted_distribution(y_pred), use_container_width=True)
        with d_col2:
            miss_count = (y_pred == 0).sum()
            hit_count = (y_pred == 1).sum()
            total = len(y_pred)
            st.write(f"**Total Predictions**: {total:,}")
            st.write(f"- **MISS Predictions**: {miss_count:,} ({miss_count/total:.1%})")
            st.write(f"- **HIT Predictions**: {hit_count:,} ({hit_count/total:.1%})")
            st.info("💡 High MISS percentage suggests the model is flagging significant supply chain risks in this period.")

    st.divider()
    

    st.divider()
    
    st.write("### 📜 Final Evaluation Snapshot")
    snapshot_col1, snapshot_col2 = st.columns(2)
    with snapshot_col1:
        st.markdown(f"""
        - **Optimal Threshold**: `{artifacts.get('threshold', 0.5):.3f}`
        - **Threshold Tuning Logic**: `{metrics.get('thr_reason', 'N/A')}`
        - **Total Test Sample Size**: `{len(df_p) if pred_path.exists() else 'N/A'}`
        """)
    with snapshot_col2:
        if pred_path.exists():
            st.download_button(f"📥 Download Raw Predictions ({selected_month})", 
                               df_p.to_csv(index=False), 
                               file_name=f"OTIF_Predictions_{selected_month}.csv", 
                               mime="text/csv")

def render_shap_tab(config):
    selected_month = st.session_state.selected_month
    st.subheader(f"🔍 XAI SHAP Explaination: {selected_month}")
    
    model, artifacts = tr.load_model_artifacts(selected_month, config)
    if model is None:
        st.warning("Please train/load a model first.")
        return

    # Load artifacts
    model_dir = Path(config['paths']['models']) / selected_month
    shap_df = pd.read_csv(model_dir / "shap_summary.csv")
    
    # Risk factor interpretation mapping
    risk_mapping = {
        "f_lead_gap_days": "Lead Time Tightness: Small gap between ready and requested dates increases delay risk.",
        "f_congestion": "Node Congestion: High activity at plant/warehouse slow down order processing.",
        "f_unit_price": "Value Sensitivity: High-value orders often have complex logistics or higher handling requirements.",
        "f_line_count": "Complexity: Higher item count per order increases picking and packing time.",
        "f_miss_rate": "Historical Risk: The specific Plant/Material combination shows a trend of delays.",
        "f_tolerance": "Tolerance Strictness: Extreme precision required by customer leaves no buffer for error."
    }

    # 1. Global Feature Importance (Top Features)
    st.markdown("### Global SHAP Risk Drivers")
    col_g1, col_g2 = st.columns([1.5, 1])
    
    with col_g1:
        # Fixed Plotly Bar Chart with better margins
        fig = px.bar(shap_df.head(15), x='mean_abs_shap', y='feature', orientation='h',
                     title="Top 15 Global Features (Mean |SHAP|)",
                     labels={'mean_abs_shap': 'Mean Impact (Magnitude)', 'feature': 'Feature Name'},
                     color='mean_abs_shap', color_continuous_scale='Reds')
        fig.update_layout(yaxis={'categoryorder': 'total ascending'}, 
                          margin=dict(l=200, r=20, t=50, b=50)) # Increased left margin
        st.plotly_chart(fig, use_container_width=True)
        
    with col_g2:
        st.write("#### Risk Factor Interpretation")
        interp_data = []
        for feat in shap_df.head(8)['feature']:
            desc = "Variable impact on supply chain stability."
            for key in risk_mapping:
                if key in feat:
                    desc = risk_mapping[key]
                    break
            interp_data.append({"Feature": feat, "Business Context": desc})
        st.table(pd.DataFrame(interp_data))

    st.divider()

    # 2. Local Risk Explanations (Searchable Table)
    st.markdown("### Local Order-Level Risk Explanations")
    pred_path = model_dir / "predictions.csv"
    if pred_path.exists():
        df_p = pd.read_csv(pred_path)
        
        # Prepare dataframe for display
        df_display = df_p.copy()
        
        # Rename risk_score to prob_miss for better clarity
        if 'risk_score' in df_display.columns:
            df_display = df_display.rename(columns={'risk_score': 'prob_miss'})
            
        # Add labels for readability
        if 'predicted_hit' in df_display.columns:
            df_display['Prediction'] = df_display['predicted_hit'].map({1: "HIT", 0: "MISS"})
            df_display = df_display.drop(columns=['predicted_hit'])
        
        # Searching/Filtering
        search = st.text_input("Search orders (Material or Ship-To)", "")
        if search:
            mask = df_display.astype(str).apply(lambda row: row.str.contains(search, case=False).any(), axis=1)
            df_display = df_display[mask]
            
        st.dataframe(df_display, use_container_width=True)
        st.info("💡 Showing full order details with **prob_miss** and local SHAP drivers.")

    st.divider()

    # 3. Static Reports
    st.markdown("### 🖼️ Aggregated SHAP Reports")
    col_r1, col_r2 = st.columns(2)
    with col_r1:
        if (model_dir / "reports" / f"global_shap_bar_{selected_month}.png").exists():
            st.image(str(model_dir / "reports" / f"global_shap_bar_{selected_month}.png"), 
                     caption="Global SHAP Bar Summary")
    with col_r2:
        if (model_dir / "reports" / f"global_shap_beeswarm_{selected_month}.png").exists():
            st.image(str(model_dir / "reports" / f"global_shap_beeswarm_{selected_month}.png"), 
                     caption="Global SHAP Beeswarm (Directional Impact)")

    # Export
    st.divider()
    c_exp1, c_exp2 = st.columns(2)
    with c_exp1:
        if st.button("📊 Export Performance & SHAP (CSV)"):
            report_df = pd.concat([pd.DataFrame([artifacts.get('metrics', {})]), shap_df], axis=1)
            st.download_button("Download CSV", report_df.to_csv(index=False), 
                               file_name=f"OTIF_Report_{selected_month}.csv", mime="text/csv")
    with c_exp2:
        if st.button("📄 Export Business Report (PDF)"):
            pdf_path = model_dir / f"OTIF_Report_{selected_month}.pdf"
            exp.export_pdf_report(artifacts.get('metrics', {}), shap_df, selected_month, pdf_path, model_dir=model_dir)
            with open(pdf_path, "rb") as f:
                st.download_button("Download PDF", f.read(), 
                                   file_name=f"OTIF_Report_{selected_month}.pdf", mime="application/pdf")

def render_upload_tab(config):
    st.header("Custom Order Prediction")
    st.write("Upload a file to get predictions using a pre-trained model.")
    
    models_root = Path(config['paths']['models'])
    available_models = sorted([d.name for d in models_root.iterdir() if d.is_dir()], reverse=True)
    
    if not available_models:
        st.error("No models found. Train a model in the Backtest tab first.")
        return
        
    selected_model_date = st.selectbox("Select Model for Inference", available_models)
    model, artifacts = tr.load_model_artifacts(selected_model_date, config)
    
    uploaded_file = st.file_uploader("Upload CSV or Excel", type=["csv", "xlsx"])
    
    if uploaded_file and model:
        try:
            # Use session state to cache results and avoid re-processing on every UI interaction
            if "upload_result" not in st.session_state or st.session_state.get("uploaded_filename") != uploaded_file.name:
                df_input = pd.read_csv(uploaded_file) if uploaded_file.name.endswith('.csv') else pd.read_excel(uploaded_file)
                st.session_state.upload_raw_df = df_input
                st.session_state.uploaded_filename = uploaded_file.name
                st.session_state.upload_result = None

            if st.button("Generate Predictions") or st.session_state.upload_result is not None:
                if st.session_state.upload_result is None:
                    import time
                    start_time = time.time()
                    with st.status("Processing & Scoring Batch Data...", expanded=True) as status:
                        st.write("🔄 Cleaning input data...")
                        df_input = st.session_state.upload_raw_df
                        df_clean = pp.preprocess_data(df_input, config)
                        fe_art = artifacts['fe_artifacts']
                        
                        from src.feature_engineering import run_inference_pipeline
                        
                        st.write("🛠️ Engineering features...")
                        # Pass master_df for congestion and history features
                        history_df = st.session_state.get("master_df")
                        df_fe = run_inference_pipeline(df_clean, fe_art, config, history_df=history_df)
                        
                        st.write("🔮 Generating predictions...")
                        X_infer = df_fe[artifacts['feature_cols']]
                        probs_hit = model.predict_proba(X_infer)[:, 1]
                        
                        output_df = df_input.copy()
                        # Use index-aware assignment
                        output_df.loc[df_fe.index, 'hit_probability'] = probs_hit
                        output_df['risk_score'] = 1.0 - output_df['hit_probability']
                        output_df['prediction'] = np.where(output_df['hit_probability'] >= artifacts['threshold'], "HIT", "MISS")
                        
                        # Accuracy Metrics logic if target exists
                        target_col_raw = config['features']['target_raw']
                        metrics_eval = None
                        if target_col_raw in df_input.columns:
                            st.write("📊 Evaluating performance...")
                            # Align y_true with the processed indices
                            y_true_numeric = (df_input.loc[df_fe.index, target_col_raw].astype(str).str.strip().str.lower() == "hit").astype(int)
                            y_pred_numeric = (probs_hit >= artifacts['threshold']).astype(int)
                            from sklearn.metrics import recall_score, precision_score, accuracy_score
                            metrics_eval = {
                                "miss_precision": precision_score(y_true_numeric, y_pred_numeric, pos_label=0, zero_division=0),
                                "miss_recall": recall_score(y_true_numeric, y_pred_numeric, pos_label=0, zero_division=0),
                                "accuracy": accuracy_score(y_true_numeric, y_pred_numeric),
                                "y_true": y_true_numeric,
                                "y_prob": probs_hit
                            }

                        # Local SHAP
                        st.write("🧬 Calculating SHAP explanations...")
                        import shap
                        explainer = shap.TreeExplainer(model)
                        sv = explainer.shap_values(X_infer)
                        shap_miss = -sv if not isinstance(sv, list) else sv[0]
                        top_shap_df = exp.get_top_shap_features(shap_miss, X_infer, top_n=3)
                        
                        # Ensure enhanced_df maintains correct indices
                        enhanced_df = pd.concat([output_df.loc[df_fe.index].reset_index(drop=True), top_shap_df.reset_index(drop=True)], axis=1)
                        
                        shap_summary = pd.DataFrame({
                            "feature": artifacts['feature_cols'],
                            "mean_abs_shap": np.abs(shap_miss).mean(axis=0)
                        }).sort_values("mean_abs_shap", ascending=False)

                        elapsed_time = time.time() - start_time
                        status.update(label=f"✅ Batch Processing Complete! (Took {elapsed_time:.2f}s)", state="complete", expanded=False)

                        st.session_state.upload_result = {
                            "enhanced_df": enhanced_df,
                            "metrics": metrics_eval,
                            "shap_summary": shap_summary,
                            "batch_insights": exp.generate_text_insights(shap_summary, metrics_eval or {"miss_precision":0, "miss_recall":0}, "Uploaded Batch")
                        }

                # Display Results
                res = st.session_state.upload_result
                st.success("Batch Prediction Complete!")
                
                # 1. Metrics section (if available)
                if res['metrics']:
                    st.divider()
                    st.subheader("📈 Performance Validation (Target Found in Upload)")
                    m1, m2, m3 = st.columns(3)
                    m1.metric("Miss Precision", f"{res['metrics']['miss_precision']:.2%}")
                    m2.metric("Miss Recall", f"{res['metrics']['miss_recall']:.2%}")
                    m3.metric("Overall Accuracy", f"{res['metrics']['accuracy']:.2%}")
                    
                    c1, c2 = st.columns(2)
                    with c1:
                        st.pyplot(plot_confusion_matrix_custom(res['metrics']['y_true'], (res['metrics']['y_prob'] >= artifacts['threshold']).astype(int)))
                    with c2:
                        st.pyplot(plot_performance_curves(res['metrics']['y_true'], res['metrics']['y_prob']))

                st.divider()
                st.subheader("📊 Batch Insights")
                st.markdown(res['batch_insights'])
                
                dist_col1, dist_col2 = st.columns([1, 1])
                with dist_col1:
                    y_pred_batch = (res['enhanced_df']['hit_probability'] >= artifacts['threshold']).astype(int)
                    st.plotly_chart(plot_predicted_distribution(y_pred_batch), use_container_width=True)
                with dist_col2:
                    st.write("#### 📋 Detailed Predictions")
                    search = st.text_input("Filter Results (Material/Ship-To)", "")
                    df_disp = res['enhanced_df']
                    if search:
                        mask = df_disp.astype(str).apply(lambda row: row.str.contains(search, case=False).any(), axis=1)
                        df_disp = df_disp[mask]
                    st.dataframe(df_disp.head(100), use_container_width=True)

                st.divider()
                st.subheader("🔍 Top Risk Drivers (Interactive)")
                # Use Interactive Plotly Bar Chart to avoid clipping and allow hover
                fig_shap = px.bar(res['shap_summary'].head(15), x='mean_abs_shap', y='feature', orientation='h',
                                 title="Top 15 Risk Drivers (Uploaded Batch)",
                                 labels={'mean_abs_shap': 'Mean Impact (Magnitude)', 'feature': 'Feature Name'},
                                 color='mean_abs_shap', color_continuous_scale='Reds')
                fig_shap.update_layout(yaxis={'categoryorder': 'total ascending'}, 
                                      margin=dict(l=200, r=20, t=50, b=50))
                st.plotly_chart(fig_shap, use_container_width=True)

                st.divider()
                st.subheader("📥 Export & Reporting")
                ce1, ce2 = st.columns(2)
                with ce1:
                    st.download_button("📊 Download Enhanced CSV", 
                                       res['enhanced_df'].to_csv(index=False), 
                                       file_name=f"OTIF_Predictions_{selected_model_date}.csv", 
                                       mime="text/csv")
                with ce2:
                    if st.button("📄 Generate Business PDF Report"):
                        pdf_path = Path(config['paths']['models']) / selected_model_date / f"OTIF_Report_Custom_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
                        exp.export_pdf_report(res['metrics'] or {}, res['shap_summary'], "Custom Upload", pdf_path)
                        with open(pdf_path, "rb") as f:
                            st.download_button("Download PDF", f.read(), file_name=f"OTIF_Custom_Report.pdf")
                            
        except Exception as e:
            st.error(f"Prediction Error: {e}")
            import traceback
            st.error(traceback.format_exc())

def render_mgmt_tab(config):
    st.header("⚙️ Data Retention & Management")
    st.write("Control your local order repository. Fetching data from SQL and saving it locally ensures faster training and predictions.")
    
    if st.session_state.master_df is not None:
        df = st.session_state.master_df
        min_date = df[config['features']['split_date_col']].min()
        max_date = df[config['features']['split_date_col']].max()
        st.info(f"📂 **Local Repository Status**: {len(df):,} orders found from {str(min_date)[:10]} to {str(max_date)[:10]}.")
    else:
        st.warning("⚠️ **Local Repository is empty**. Please sync from SQL below.")

    st.subheader("🔄 Sync from SQL Server")
    col1, col2 = st.columns(2)
    start_sync = col1.date_input("Start Date", datetime(2023, 9, 1))
    end_sync = col2.date_input("End Date", datetime.now())
    force_sql = st.checkbox("Force SQL Refresh (Ignore local repo)")
    
    if st.button("Fetch and Preview Data"):
        date_col = config['features']['split_date_col']
        start_ts = pd.Timestamp(start_sync)
        end_ts = pd.Timestamp(end_sync)
        
        found_local = False
        if not force_sql and st.session_state.master_df is not None:
            df = st.session_state.master_df
            # Ensure datetime type for robust comparison
            col_data = pd.to_datetime(df[date_col], errors='coerce')
            mask = (col_data >= start_ts) & (col_data <= end_ts)
            preview = df.loc[mask]
            
            if not preview.empty:
                st.info(f"💡 Found {len(preview):,} records in local repository for this range. Showing local preview.")
                st.session_state.preview_df = preview
                found_local = True
        
        if not found_local:
            with st.spinner(f"Fetching fresh data from SQL ({start_sync} to {end_sync})..."):
                try:
                    df_new = di.fetch_data(config, di.SQL_QUERY_TEMPLATE, start_date=start_sync, end_date=end_sync, use_cache=False)
                    st.session_state.preview_df = df_new
                    st.success(f"Fetched {len(df_new):,} records from SQL.")
                except Exception as e:
                    st.error(f"SQL Fetch failed: {e}")

    if "preview_df" in st.session_state:
        st.dataframe(st.session_state.preview_df.head(100))
        c1, c2 = st.columns(2)
        if c1.button("💾 Overwrite Local Repository"):
            di.save_master_data(st.session_state.preview_df, config)
            st.session_state.master_df = st.session_state.preview_df
            del st.session_state.preview_df
            st.success("Master repository overwritten!")
            st.rerun()
            
        if c2.button("➕ Append to Local Repository"):
            new_master = di.append_to_master_data(st.session_state.preview_df, config)
            st.session_state.master_df = new_master
            del st.session_state.preview_df
            st.success("Data appended to repository!")
            st.rerun()

    st.divider()
    st.subheader("Bulk Operations (Temporary)")
    if st.button("Run Full Backtest (Jan 2024 - Dec 2025)"):
        if st.session_state.master_df is None:
            st.error("Cannot run backtest: Local Repository is empty.")
        else:
            import time
            start_time = time.time()
            with st.status("Running full rolling backtest...", expanded=True) as status:
                try:
                    st.write("Preprocessing data...")
                    df_processed = pp.preprocess_data(st.session_state.master_df, config)
                    st.write("Running multi-month training & validation...")
                    # Run for the full requested window
                    stats = tr.run_rolling_training(df_processed, config, "2024-01", "2025-12")
                    elapsed_time = time.time() - start_time
                    status.update(label=f"✅ Full Backtest Complete! (Took {elapsed_time/60:.2f} min)", state="complete", expanded=False)
                    st.success("Full backtest completed successfully!")
                    st.dataframe(stats)
                except Exception as e:
                    status.update(label=f"❌ Backtest Failed: {e}", state="error")
                    st.error(f"Backtest failed: {e}")

    st.divider()
    if st.button("🗑️ Clear Local Repository"):
        master_path = Path(config['paths']['raw_data']) / "master_orders.parquet"
        if master_path.exists():
            os.remove(master_path)
            st.session_state.master_df = None
            st.success("Repository cleared.")
            st.rerun()

if __name__ == "__main__":
    main()
