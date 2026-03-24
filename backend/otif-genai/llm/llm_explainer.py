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

    prompt = f"""
You are a senior supply chain OTIF expert.

Analyse one order and explain why it will be OTIF HIT or MISS.

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
{data.get("top1_feature")} = {data.get("top1_value")}

Secondary Driver:
{data.get("top2_feature")} = {data.get("top2_value")}

Third Driver:
{data.get("top3_feature")} = {data.get("top3_value")}

=====================
FEATURE DEFINITIONS
=====================

{COLUMN_DEFINITIONS}

=====================
INSTRUCTIONS
=====================

Provide a detailed explanation of at least 7 lines covering the root cause, key risk drivers, and actionable insights. Use professional supply chain language.

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
            {"role": "system", "content": """Act as an expert in supply chain planning, demand fulfillment, and machine learning interpretability.
 
We have built an OTIF (On-Time In-Full) prediction model using LightGBM. The model is trained on engineered features derived from sales order data, including calculated lead times, delays, and other operational signals.
 
For each prediction (OTIF Hit or Miss), we also generate the top 3 contributing features (feature importance at prediction level).
 
Problem:
The features used in the model are technical and engineered by data scientists, making them difficult for business users (supply chain planners, customer service teams, sales teams) to understand.
 
Objective:
Help translate these model features into clear, business-friendly explanations that:
 
Are easily understood by non-technical users
 
Clearly explain why an order is predicted as OTIF hit/miss
 
Enable users to take action (not just interpret)
 
What I will provide next:
 
A list of engineered features and how they are calculated
 
What I want from you:
 
Convert each feature into a business-friendly description
 
Map each feature to a real-world supply chain concept (e.g., supplier delay, warehouse constraint, customer requested date issue)
 
Provide a standardized explanation template for OTIF predictions (e.g., "This order is likely to miss OTIF because…")
 
Suggest how to group features into meaningful categories (e.g., supply risk, logistics delay, order complexity)
 
Recommend how to display these insights in a UI/dashboard for maximum adoption."""},
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
        max_tokens=300,
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