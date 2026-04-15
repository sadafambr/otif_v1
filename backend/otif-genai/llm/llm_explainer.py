import json
import os
import re
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence, Tuple, cast

from dotenv import load_dotenv
from openai import OpenAI


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


def _format_driver_line(raw_feat: Any, val: Any) -> str:
    if not raw_feat:
        return "None"
    mapping: dict[str, str] = cast(dict[str, str], {})
    key_lower = str(raw_feat).strip().lower()
    if key_lower in FEATURE_NAME_MAP:
        mapping = cast(dict[str, str], FEATURE_NAME_MAP[key_lower])
    else:
        for k, v in FEATURE_NAME_MAP.items():
            k_lower = k.lower()
            if k_lower == key_lower or k_lower == f"f_{key_lower}" or f"f_{k_lower}" == key_lower:
                mapping = cast(dict[str, str], v)
                break
    biz = mapping.get("business_name") or str(raw_feat).replace("f_", "").replace("_", " ").title()
    tech = mapping.get("technical_name") or str(raw_feat)
    return f"{biz} (Technical metric: {tech}) = {val}"


def _order_context_blocks(data: Mapping[str, Any]) -> dict[str, str]:
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
    top1 = _format_driver_line(data.get("raw_top1_feature", data.get("top1_feature")), data.get("top1_value"))
    top2 = _format_driver_line(data.get("raw_top2_feature", data.get("top2_feature")), data.get("top2_value"))
    top3 = _format_driver_line(data.get("raw_top3_feature", data.get("top3_feature")), data.get("top3_value"))
    return {
        "prediction": prediction,
        "customer": str(customer or ""),
        "plant": str(plant or ""),
        "material": str(material or ""),
        "country": str(country or ""),
        "requested_delivery_date": str(requested_delivery_date or ""),
        "material_availability_date": str(material_availability_date or ""),
        "prob_hit": str(prob_hit),
        "prob_miss": str(prob_miss),
        "top1": top1,
        "top2": top2,
        "top3": top3,
    }


def build_json_user_prompt(data: Mapping[str, Any]) -> str:
    c = _order_context_blocks(data)
    return f"""You are an expert in supply chain planning.

Context: Predictions use sales-order data only. Describe risk SIGNALS and patterns — do not assert exact root causes.

Order:
- Customer: {c["customer"]}
- Plant: {c["plant"]}
- Material: {c["material"]}
- Country: {c["country"]}
- Requested delivery: {c["requested_delivery_date"]}
- Material availability (if known): {c["material_availability_date"]}
- Hit %: {c["prob_hit"]}, Miss %: {c["prob_miss"]}
- Model label: OTIF {c["prediction"]}

Top model drivers (translate to plain language in your JSON strings, not jargon):
1) {c["top1"]}
2) {c["top2"]}
3) {c["top3"]}

TASK: Output ONE JSON object only (no markdown, no prose outside JSON) with exactly these keys:
- "risk_level": must be "High", "Medium", or "Low" (align with OTIF {c["prediction"]} and probabilities)
- "risk_emoji": must be "", or "🔴", or "🟡", or "🟢" (suggest 🔴 for High, 🟡 Medium, 🟢 Low)
- "key_risk_signals": array of 1 to 3 short strings (each one risk signal, not a paragraph)
- "recommended_actions": array of 1 to 2 generic supply-chain planning actions

Example shape (content must reflect THIS order):
{{"risk_level":"High","risk_emoji":"🔴","key_risk_signals":["Material timeline looks tight vs requested date","Plant historical miss pattern is elevated"],"recommended_actions":["Confirm material readiness with supply","Align plant capacity for the requested window"]}}
"""


def _parse_json_object(raw: str) -> Optional[dict[str, Any]]:
    text = (raw or "").strip()
    if not text:
        return None
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```\s*$", "", text)
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def _split_runon_signal_strings(signals: list[str]) -> list[str]:
    """If the model returns one paragraph as a single 'signal', split into up to 3 short lines."""
    if len(signals) != 1:
        return signals
    text = signals[0].strip()
    if len(text) < 120 or text.count(". ") < 1:
        return signals
    parts = re.split(r"(?<=[.!?])\s+", text)
    split = [p.strip() for p in parts if p.strip()]
    return split[:3] if len(split) >= 2 else signals


def _format_bullets_from_json(obj: dict[str, Any]) -> str:
    risk = str(obj.get("risk_level") or "Medium").strip()
    if risk not in ("High", "Medium", "Low"):
        risk = "Medium"
    emoji = str(obj.get("risk_emoji") or "").strip()
    if emoji not in ("", "🔴", "🟡", "🟢"):
        emoji = ""
    risk_line = f"Risk: {emoji} {risk}".replace("  ", " ").strip() if emoji else f"Risk: {risk}"

    signals_raw = obj.get("key_risk_signals")
    actions_raw = obj.get("recommended_actions")
    signals: list[str] = []
    if isinstance(signals_raw, list):
        for s in signals_raw:
            t = str(s).strip()
            if t:
                signals.append(t)
    signals = _split_runon_signal_strings(signals)
    signals = signals[:3]
    actions: list[str] = []
    if isinstance(actions_raw, list):
        for a in actions_raw:
            t = str(a).strip()
            if t:
                actions.append(t)
    actions = actions[:2]

    lines: list[str] = [risk_line, "", "Key risk signals:"]
    if signals:
        for s in signals:
            lines.append(f"- {s}")
    else:
        lines.append("- Model points to timing or historical-pattern risk for this order.")
    lines.extend(["", "Recommended actions:"])
    if actions:
        for a in actions:
            lines.append(f"- {a}")
    else:
        lines.append("- Review material and delivery dates with planning.")
        lines.append("- Confirm plant capacity for the requested window.")
    return "\n".join(lines).strip()


def _fallback_bullets_from_data(data: Mapping[str, Any]) -> str:
    predicted_label = int(data.get("predicted_label", 0))
    miss = predicted_label == 0
    risk_line = "Risk: 🔴 High" if miss else "Risk: 🟢 Low"
    signals: list[str] = []
    for i in (1, 2, 3):
        feat = data.get(f"top{i}_feature")
        val = data.get(f"top{i}_value")
        if feat not in (None, ""):
            line = _format_driver_line(feat, val)
            if line != "None":
                base = line.split("(Technical metric:")[0].strip()
                if val not in (None, ""):
                    signals.append(f"{base} (value: {val})")
                else:
                    signals.append(base)
    if not signals:
        signals = [
            "Elevated predicted miss probability on this order line.",
        ]
    signals = signals[:3]
    lines = [risk_line, "", "Key risk signals:"]
    for s in signals:
        lines.append(f"- {s}")
    lines.extend(
        [
            "",
            "Recommended actions:",
            "- Confirm material readiness and the requested delivery date.",
            "- Validate plant capacity against the order timeline.",
        ]
    )
    return "\n".join(lines)


def generate_explanation(data: dict[str, Any]) -> str:
    user_prompt = build_json_user_prompt(data)

    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set. Set it in environment or otif-genai/.env.")

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You reply with a single JSON object only. "
                    "No introductory text, no closing explanation, no markdown code fences."
                ),
            },
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=600,
        timeout=45.0,
    )

    raw = response.choices[0].message.content or ""
    parsed = _parse_json_object(raw)
    if parsed:
        try:
            return _format_bullets_from_json(parsed)
        except Exception:
            pass
    return _fallback_bullets_from_data(data)


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

    lines = [ln.rstrip() for ln in full_text.splitlines()]
    # Strip legacy one-line suffix if the model still emits it
    cleaned: list[str] = []
    for ln in lines:
        if re.match(r"(?i)^\s*shap_one_line\s*:", (ln or "").strip()):
            continue
        cleaned.append(ln)

    summary_text = "\n".join(cleaned).strip()
    # API consumers no longer expose SHAP insight; keep second value empty for compatibility
    return summary_text, ""