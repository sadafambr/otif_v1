import shap
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path

def get_shap_explainer(model):
    return shap.TreeExplainer(model)

def explain_predictions(model, X_test):
    explainer = get_shap_explainer(model)
    shap_values = explainer.shap_values(X_test)
    
    if isinstance(shap_values, list):
        shap_miss = shap_values[0]
        shap_hit = shap_values[1]
    else:
        shap_hit = shap_values
        shap_miss = -shap_values
        
    return shap_miss, shap_hit

def get_top_shap_features(shap_values, X_test, top_n=3):
    feature_names = X_test.columns.tolist()
    top_features_list = []
    
    for i in range(len(shap_values)):
        row_shap = shap_values[i]
        row_X = X_test.iloc[i]
        
        # Sort by absolute impact for "risk" (usually we want top contributors to MISS)
        # Assuming shap_values provided are for class 0 (MISS) or symmetric
        sorted_idx = np.argsort(np.abs(row_shap))[::-1]
        
        row_info = {}
        count = 0
        for rank, feat_idx in enumerate(sorted_idx, 1):
            feat_name = feature_names[feat_idx]
            row_info[f"top{rank}_feature"] = feat_name
            row_info[f"top{rank}_value"] = row_X[feat_name]
            row_info[f"top{rank}_shap"] = row_shap[feat_idx]
            count += 1
            if count == top_n:
                break
        
        while count < top_n:
            count += 1
            row_info[f"top{count}_feature"] = None
            row_info[f"top{count}_value"] = None
            row_info[f"top{count}_shap"] = None
            
        top_features_list.append(row_info)
    return pd.DataFrame(top_features_list)

def save_global_shap_report(shap_values, X_test, output_dir, month_str):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Global summary plot (Bar)
    plt.figure(figsize=(12, 8))
    shap.summary_plot(shap_values, X_test, plot_type="bar", show=False)
    plt.title(f"Global Risk Drivers - {month_str}")
    plt.tight_layout()
    bar_path = output_dir / f"global_shap_bar_{month_str}.png"
    plt.savefig(bar_path, bbox_inches='tight')
    plt.close()
    
    # Beeswarm plot
    plt.figure(figsize=(12, 8))
    # Increasing left margin via subplots_adjust to prevent label clipping
    plt.subplots_adjust(left=0.3)
    shap.summary_plot(shap_values, X_test, show=False)
    plt.title(f"Impact Direction - {month_str}")
    bee_path = output_dir / f"global_shap_beeswarm_{month_str}.png"
    plt.savefig(bee_path, bbox_inches='tight')
    plt.close()
    
    return bar_path, bee_path

def generate_text_insights(shap_summary, metrics, context_name):
    """
    Generates a text summary of the risk drivers.
    """
    top_feat = shap_summary.iloc[0]['feature'] if not shap_summary.empty else "N/A"
    precision = metrics.get('miss_precision', 0)
    
    insight = f"### 💡 Business Insights for {context_name}\n"
    insight += f"- **Primary Risk Driver**: The model identifies `{top_feat}` as the most significant factor affecting OTIF for this batch.\n"
    
    if precision > 0.7:
        insight += f"- **Confidence**: High confidence in risk flags ({precision:.1%} precision).\n"
    elif precision > 0.5:
        insight += f"- **Confidence**: Moderate confidence. Risk flags should be reviewed manually.\n"
    else:
        insight += f"- **Confidence**: Low precision for MISS class. Use these scores as relative risk indicators rather than absolute certainties.\n"
        
    insight += "\n#### 🛡️ Mitigation Strategies\n"
    if "lead_gap" in top_feat.lower() or "tight" in top_feat.lower():
        insight += "- **Lead Time**: Consider increasing buffer days for these specific material/plant combinations.\n"
    elif "congestion" in top_feat.lower() or "load" in top_feat.lower():
        insight += "- **Congestion**: High order volume at specific nodes. Coordinate with warehouse/logistics for prioritized picking.\n"
    else:
        insight += "- **General**: Review historical performance for the top-ranked features to identify root causes.\n"
    
    return insight

def export_pdf_report(metrics, shap_df, month_str, output_path, model_dir=None):
    """
    Generates a professional PDF report using fpdf2.
    """
    from fpdf import FPDF
    import os
    
    class PDF(FPDF):
        def header(self):
            self.set_font('Arial', 'B', 15)
            self.cell(0, 10, f'OTIF Risk Analysis Report - {month_str}', 0, 1, 'C')
            self.ln(5)

        def footer(self):
            self.set_y(-15)
            self.set_font('Arial', 'I', 8)
            self.cell(0, 10, 'Page ' + str(self.page_no()), 0, 0, 'C')

    pdf = PDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    
    # 1. Performance Overview
    pdf.set_font("Arial", 'B', 14)
    pdf.cell(200, 10, txt="1. Performance Metrics", ln=True)
    pdf.set_font("Arial", size=11)
    
    important_metrics = ['miss_precision', 'miss_recall', 'accuracy', 'auc']
    for k in important_metrics:
        if k in metrics:
            v = metrics.get(k, 0)
            pdf.cell(200, 8, txt=f"- {k.replace('_',' ').title()}: {v:.4f}", ln=True)
    
    pdf.ln(10)
    
    # 2. Key Risk Drivers
    pdf.set_font("Arial", 'B', 14)
    pdf.cell(200, 10, txt="2. Primary Risk Drivers (Global)", ln=True)
    pdf.set_font("Arial", size=11)
    for i, row in shap_df.head(10).iterrows():
        pdf.cell(200, 8, txt=f"{i+1}. {row['feature']}: {row['mean_abs_shap']:.4f}", ln=True)

    pdf.ln(10)
    
    # 3. Visualizations
    if model_dir:
        report_dir = model_dir / "reports"
        bar_path = report_dir / f"global_shap_bar_{month_str}.png"
        bee_path = report_dir / f"global_shap_beeswarm_{month_str}.png"
        
        # Helper to avoid clipping by adding a new page if needed
        def add_image_page(p, title):
            if p.exists():
                pdf.add_page()
                pdf.set_font("Arial", 'B', 14)
                pdf.cell(200, 10, txt=title, ln=True)
                # Position carefully to avoid overlapping footers
                pdf.image(str(p), x=10, y=30, w=190)
        
        add_image_page(bar_path, "3. Global Feature Importance (Bar)")
        add_image_page(bee_path, "4. Directional Impact (Beeswarm)")

    pdf.output(str(output_path))
    return output_path
