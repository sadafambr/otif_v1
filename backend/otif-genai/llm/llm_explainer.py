import os
import re
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence, Tuple

from dotenv import load_dotenv
from openai import OpenAI

from config.column_definitions import COLUMN_DEFINITIONS


_DOTENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=_DOTENV_PATH, override=False)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

FEATURE_NAME_MAP = {
    "f_so_to_rdd_days": {"business_name": "Order-to-Delivery Window", "technical_name": "SO to RDD Lead Days"},
    "f_so_to_mat_avail_days": {"business_name": "Days Until Material Ready", "technical_name": "SO to Material Availability Days"},
    "f_mat_avail_to_rdd_days": {"business_name": "Material-to-Delivery Buffer", "technical_name": "Material Availability to RDD Buffer Days"},
    "f_mat_ready_after_rdd": {"business_name": "Late Material Flag", "technical_name": "Material Confirmed After RDD Indicator"},
    "f_request_lead_days": {"business_name": "Customer Requested Lead Time", "technical_name": "Customer Request Lead Days"},
    "f_material_lead_days": {"business_name": "Material Supply Lead Time", "technical_name": "Material Availability Lead Days"},
    "f_lead_gap_days": {"business_name": "Supply Cushion Days", "technical_name": "Lead Time Gap Days (RDD - Mat Avail)"},
    "f_tight_ratio": {"business_name": "Timeline Tightness Ratio", "technical_name": "Supply-to-Request Lead Time Ratio"},
    "f_is_tight_order": {"business_name": "Tight Order Flag", "technical_name": "Delivery Before Material Availability Indicator"},
    "f_is_extremely_tight": {"business_name": "Critical Timeline Flag", "technical_name": "Extreme Lead Gap Indicator"},
    "f_critical_negative_gap": {"business_name": "Severe Delay Risk Flag", "technical_name": "Material Arrival >3 Days After RDD Indicator"},
    "f_mild_negative_gap": {"business_name": "Minor Delay Risk Flag", "technical_name": "Material Arrival Slightly After RDD Indicator"},
    "f_large_positive_gap": {"business_name": "Comfortable Buffer Flag", "technical_name": "Lead Gap ≥7 Days Indicator"},
    "f_gap_bin": {"business_name": "Low Buffer Quartile Flag", "technical_name": "Gap Below 25th Percentile Bin Indicator"},
    "f_unit_price_log": {"business_name": "Unit Price (Log)", "technical_name": "Log-Transformed Unit Price"},
    "f_so_woy_sin": {"business_name": "Order Week Seasonality (Sin)", "technical_name": "SO Week-of-Year Sine Encoding"},
    "f_so_woy_cos": {"business_name": "Order Week Seasonality (Cos)", "technical_name": "SO Week-of-Year Cosine Encoding"},
    "f_rdd_woy_sin": {"business_name": "Delivery Week Seasonality (Sin)", "technical_name": "RDD Week-of-Year Sine Encoding"},
    "f_rdd_woy_cos": {"business_name": "Delivery Week Seasonality (Cos)", "technical_name": "RDD Week-of-Year Cosine Encoding"},
    "f_qty_log": {"business_name": "Order Volume (Log)", "technical_name": "Log-Transformed Order Quantity"},
    "f_high_qty_flag": {"business_name": "Large Order Flag", "technical_name": "High Quantity Outlier Indicator"},
    "f_high_value_flag": {"business_name": "High Value Order Flag", "technical_name": "High Commercial Value Indicator"},
    "f_high_value_x_tight": {"business_name": "High Value + Tight Timeline", "technical_name": "High Value × Tight Lead Interaction"},
    "f_tolerance_band": {"business_name": "Delivery Quantity Tolerance", "technical_name": "Customer Allowed Quantity Variance Band"},
    "f_strict_tolerance": {"business_name": "Strict Tolerance Customer", "technical_name": "Near-Zero Delivery Tolerance Indicator"},
    "f_strict_x_tight": {"business_name": "Strict Customer + Tight Deadline", "technical_name": "Strict Tolerance × Tight Lead Interaction"},
    "f_tolerance_x_gap": {"business_name": "Gap Exceeds Tolerance", "technical_name": "Supply Gap Beyond Tolerance Band"},
    "f_plant_orders_7d": {"business_name": "Plant Load (7 Days)", "technical_name": "Plant Order Volume – Rolling 7-Day Count"},
    "f_plant_orders_30d": {"business_name": "Plant Load (30 Days)", "technical_name": "Plant Order Volume – Rolling 30-Day Count"},
    "f_material_orders_7d": {"business_name": "Material Demand (7 Days)", "technical_name": "Material Order Frequency – Rolling 7-Day Count"},
    "f_material_orders_30d": {"business_name": "Material Demand (30 Days)", "technical_name": "Material Order Frequency – Rolling 30-Day Count"},
    "f_shipto_orders_7d": {"business_name": "Customer Site Volume (7 Days)", "technical_name": "Ship-To Order Count – Rolling 7-Day"},
    "f_shipto_orders_30d": {"business_name": "Customer Site Volume (30 Days)", "technical_name": "Ship-To Order Count – Rolling 30-Day"},
    "f_mat_total_orders_log": {"business_name": "Material Order Frequency (Log)", "technical_name": "Log-Transformed Total Material Order Count"},
    "f_gap_x_load": {"business_name": "Buffer Under Plant Pressure", "technical_name": "Lead Gap × Plant Load Interaction"},
    "f_tight_x_plant_load": {"business_name": "Tight Order at Busy Plant", "technical_name": "Tight Order × Plant Load Interaction"},
    "f_mat_shipto_x_pressure": {"business_name": "Material + Customer Risk Pressure", "technical_name": "Material–ShipTo Miss Rate × Tight Lead Interaction"},
    "f_customer_miss_rate": {"business_name": "Customer OTIF Miss Rate", "technical_name": "Historical Customer-Level OTIF Miss Rate"},
    "f_material_miss_rate": {"business_name": "Material OTIF Miss Rate", "technical_name": "Historical Material-Level OTIF Miss Rate"},
    "f_plant_miss_rate": {"business_name": "Plant OTIF Miss Rate", "technical_name": "Historical Plant-Level OTIF Miss Rate"},
    "f_bu_miss_rate": {"business_name": "Business Unit OTIF Miss Rate", "technical_name": "Historical Business Unit-Level OTIF Miss Rate"},
    "f_mat_shipto_miss_rate": {"business_name": "Material × Customer Miss Rate", "technical_name": "Historical Material–Ship-To OTIF Miss Rate"},
    "f_plant_material_miss_rate": {"business_name": "Material × Plant Miss Rate", "technical_name": "Historical Plant–Material OTIF Miss Rate"},
    "f_plant_shipto_miss_rate": {"business_name": "Plant × Customer Miss Rate", "technical_name": "Historical Plant–Ship-To OTIF Miss Rate"},
    "f_state_miss_rate": {"business_name": "Regional OTIF Miss Rate", "technical_name": "Historical State/Region-Level OTIF Miss Rate"},
    "f_strict_x_plant_miss": {"business_name": "Strict Customer at Weak Plant", "technical_name": "Strict Tolerance × Plant Miss Rate Interaction"},
    "f_high_plant_risk": {"business_name": "High Risk Plant Flag", "technical_name": "Structurally High Plant Risk Indicator"},
    "f_risk_stack": {"business_name": "Compounded Risk Flag", "technical_name": "Tight Order × High-Risk Plant Stacked Indicator"},
    "f_otif_risk_score": {"business_name": "Overall OTIF Risk Score", "technical_name": "Composite OTIF Risk Score (All Critical Flags)"},
}

def _pick(data: Mapping[str, Any], keys: Sequence[str], default: Any = "") -> Any:
    for k in keys:
        if k in data and data.get(k) not in (None, ""):
            return data.get(k)
    return default


def build_prompt(data):

    predicted_label = int(data.get("predicted_label", 0))
    prediction = "HIT" if predicted_label == 1 else "MISS"

    customer = _pick(data, ["Customer Name", "Customer", "Customer_Name", "Ship-To Name", "Ship To Name"])
    plant = _pick(data, ["Plant", "Plant Name"])
    material = _pick(data, ["Material description", "Material Description", "Material", "Material ID", "Material Code"])
    country = _pick(data, ["Country", "Ship-To Country", "Ship To Country"])
    requested_delivery_date = _pick(
        data,
        [
            "Requested Delivery Date",
            "Requested delivery date",
            "Req Delivery Date",
            "Req. Deliv. Date",
            "Requested_Delivery_Date",
        ],
    )
    material_availability_date = _pick(
        data,
        [
            "Mat_Avl_Date_OTIF",
            "Mat Avl Date OTIF",
            "Material Availability Date",
            "MAT_AVL_DATE_OTIF",
        ],
    )

    prob_hit = _pick(data, ["prob_hit", "hit_probability", "Hit Probability"], default="")
    prob_miss = _pick(data, ["prob_miss", "risk_score", "Miss Probability"], default="")

    def fmt_driver(raw_feat, val):
        if not raw_feat:
            return "None"
            
        mapping = {}
        key_lower = raw_feat.strip().lower()
        if key_lower in FEATURE_NAME_MAP:
            mapping = FEATURE_NAME_MAP[key_lower]
        else:
            for k, v in FEATURE_NAME_MAP.items():
                k_lower = k.lower()
                if k_lower == key_lower or k_lower == f"f_{key_lower}" or f"f_{k_lower}" == key_lower:
                    mapping = v
                    break

        biz = mapping.get("business_name") or raw_feat.replace("f_", "").replace("_", " ").title()
        tech = mapping.get("technical_name") or raw_feat
        return f"{biz} (Technical metric: {tech}) = {val}"

    top1 = fmt_driver(data.get("raw_top1_feature", data.get("top1_feature")), data.get("top1_value"))
    top2 = fmt_driver(data.get("raw_top2_feature", data.get("top2_feature")), data.get("top2_value"))
    top3 = fmt_driver(data.get("raw_top3_feature", data.get("top3_feature")), data.get("top3_value"))

    prompt = f"""
You are a senior supply chain OTIF expert.

Analyse one order and explain in exactly 3-4 sentences why it is predicted as OTIF {prediction}.
Be concise and direct. Focus only on the top drivers below. Use plain business language — no bullet points, no headers.

=====================
ORDER INFORMATION
=====================

Customer: {customer}
Plant: {plant}
Material: {material}
Country: {country}

Requested Delivery Date: {requested_delivery_date}
Material Availability Date: {material_availability_date}

Hit Probability: {prob_hit}
Miss Probability: {prob_miss}

Prediction: {prediction}

=====================
TOP DRIVERS
=====================

Primary Driver:
{top1}

Secondary Driver:
{top2}

Third Driver:
{top3}

=====================
FEATURE DEFINITIONS
=====================

{COLUMN_DEFINITIONS}

=====================
INSTRUCTIONS
=====================

Write exactly 3-4 sentences maximum. Cover the root cause and the most critical risk driver. Do not repeat the feature names verbatim — translate them into plain supply chain language.

End your response with exactly one final line in this format (max 25 words):
SHAP_ONE_LINE: <one-line explanation of the key SHAP drivers>

"""

    return prompt


def generate_explanation(data):

    prompt = build_prompt(data)

    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set. Set it in environment or otif-genai/.env.")

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an expert supply chain analyst. Your task is to explain the OTIF prediction for a single order in a concise, business-friendly paragraph. Your response must be a maximum of 50 tokens and exactly 3-4 sentences. Do not provide recommendations for UI/dashboards, just explain the risk drivers for this specific order."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
        max_tokens=50,
        timeout=15.0  # Prevent "stuck" loading states
    )

    return response.choices[0].message.content


def summarize_reason(
    *,
    prediction: int,
    prob_hit: float,
    prob_miss: float,
    drivers: Optional[Sequence[Tuple[str, Any, Any]]],
    row: Mapping[str, Any],
) -> tuple[str, str]:
    data: dict[str, Any] = dict(row)
    data["predicted_label"] = int(prediction)
    data["prob_hit"] = float(prob_hit)
    data["prob_miss"] = float(prob_miss)

    if not drivers:
        inferred: list[tuple[str, Any, Any]] = []
        for i in (1, 2, 3):
            feat = data.get(f"top{i}_feature")
            val = data.get(f"top{i}_value")
            shap_val = data.get(f"top{i}_shap")
            if feat not in (None, ""):
                inferred.append((str(feat), val, shap_val))
        drivers = inferred

    for idx, (feat, val, shap_val) in enumerate(list(drivers)[:3], start=1):
        data[f"top{idx}_feature"] = str(feat)
        data[f"top{idx}_value"] = val
        data[f"top{idx}_shap"] = shap_val

    full_text = generate_explanation(data) or ""

    lines = full_text.splitlines()
    shap_one_liner = ""
    for i in range(len(lines) - 1, -1, -1):
        ln = (lines[i] or "").strip()
        if not ln:
            continue
        m = re.match(r"(?i)^\s*shap_one_line\s*:\s*(.+)\s*$", ln)
        if m:
            shap_one_liner = m.group(1).strip()
            del lines[i]
            break

    if not shap_one_liner:
        driver_bits = []
        for feat, _, shap_val in (list(drivers)[:3] if drivers else []):
            if shap_val in (None, ""):
                driver_bits.append(str(feat))
            else:
                driver_bits.append(f"{feat} ({shap_val:+.3f})")
        shap_one_liner = "Key drivers: " + ", ".join(driver_bits) if driver_bits else "Key drivers: (not available)"

    summary_text = "\n".join(lines).strip()
    return summary_text, shap_one_liner.strip()