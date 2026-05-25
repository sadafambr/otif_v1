import os
import re
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence, Tuple

from dotenv import load_dotenv
from google import genai
from google.genai import types

from config.column_definitions import COLUMN_DEFINITIONS


_DOTENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=_DOTENV_PATH, override=False)

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

_client: Optional[genai.Client] = None

def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set. Set it in environment or otif-genai/.env.")
        _client = genai.Client(api_key=api_key)
    return _client

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

# Business rule metadata (aligned with rule_applied column in model output) ─
RULE_META = {
    "R6:ModelOnly": {
        "rule_name": "Rule 6",
        "label": "Model prediction only",
        "ui_display": "Predicted by model based on historical patterns",
        "triggered_when": "No other rule fired",
        "meaning": "CatBoost model is the sole decision-maker. No operational signal overrides it.",
        "impact": "Hit or Miss purely from model probability",
        "explanation": "No operational override was triggered. The prediction is based entirely on the machine-learning model using historical order patterns.",
        "driven_by": "model",
    },
    "R1:QtyShort": {
        "rule_name": "Rule 1",
        "label": "Confirmed quantity short",
        "ui_display": "Confirmed quantity is less than ordered quantity",
        "triggered_when": "max(Confirmed, Delivered) < Ordered_in_Base_UOM",
        "meaning": "The quantity confirmed or delivered is less than what was ordered — a direct shortfall signal",
        "impact": "Pushes toward Miss",
        "explanation": "The maximum of confirmed and delivered quantity is less than the ordered quantity — a direct shortfall signal that risks an OTIF miss on the 'In-Full' dimension.",
        "driven_by": "rule",
    },
    "R2:PGILate": {
        "rule_name": "Rule 2",
        "label": "Planned goods issue date is past the delivery deadline",
        "ui_display": "Goods issue date is past the delivery deadline",
        "triggered_when": "Plan GI Date > Requested Delivery Date",
        "meaning": "Goods issue is planned after the delivery deadline — shipment cannot arrive on time",
        "impact": "Hard override → always Miss",
        "explanation": "The planned goods-issue (PGI) date falls after the requested delivery date, making on-time shipment physically impossible. This is a hard override that sets the outcome to Miss.",
        "driven_by": "rule",
    },
    "R2b:PGIExc1d": {
        "rule_name": "Rule 2b",
        "label": "PGI is 1 day late but no route assigned (treated as within tolerance)",
        "ui_display": "Goods issue slightly exceeds deadline (within tolerance)",
        "triggered_when": "Plan GI is exactly 1 day late AND RouteDays = 0",
        "meaning": "PGI is technically late by 1 day but no route is assigned (Route=0), treated as within tolerance",
        "impact": "Stays Hit (exception to R2)",
        "explanation": "PGI is technically one day after the deadline but the route-day count is zero, so the system treats this as within acceptable tolerance and keeps the Hit status.",
        "driven_by": "rule",
    },
    "R3:ConfMiss": {
        "rule_name": "Rule 3",
        "label": "Ship-to location has a very high historical miss rate (>70%)",
        "ui_display": "Ship-to location consistently misses delivery (>70% miss rate)",
        "triggered_when": "Ship-to has ≥ 10 orders AND miss rate > 70% (Customer Pickup=Yes)",
        "meaning": "This ship-to location has a very strong pattern of missing delivery — high confidence",
        "impact": "Pushes strongly toward Miss",
        "explanation": "This ship-to location has at least 10 prior orders and has missed OTIF more than 70% of the time, providing high-confidence evidence of a structural delivery problem.",
        "driven_by": "rule",
    },
    "R4:LeanMiss": {
        "rule_name": "Rule 4",
        "label": "Ship-to location misses delivery more than 50% of the time",
        "ui_display": "Ship-to location has missed delivery more than 50% of the time",
        "triggered_when": "Ship-to has ≥ 5 orders AND miss rate > 50% (Customer Pickup=Yes)",
        "meaning": "This ship-to misses more often than not — moderate confidence warning",
        "impact": "Pushes toward Miss",
        "explanation": "This ship-to location has at least 5 prior orders and misses more often than not, providing a moderate-confidence warning of elevated delivery risk.",
        "driven_by": "rule",
    },
    "R5:ConfHit": {
        "rule_name": "Rule 5",
        "label": "Ship-to location has a strong on-time delivery history (<30% miss rate)",
        "ui_display": "Ship-to location has a strong on-time delivery history",
        "triggered_when": "Ship-to has ≥ 10 orders AND miss rate < 30% (Customer Pickup=Yes)",
        "meaning": "This ship-to has a reliable on-time delivery history — overrides risk signals",
        "impact": "Pushes toward Hit",
        "explanation": "This ship-to location has at least 10 prior orders and misses fewer than 30% of the time, indicating a reliable delivery track record that overrides risk signals.",
        "driven_by": "rule",
    },
}

# Exact rule_applied column values → UI interpretation (pipe-delimited combos)
RULE_APPLIED_COMBO_UI: dict[str, str] = {
    "R6:ModelOnly": RULE_META["R6:ModelOnly"]["ui_display"],
    "R1:QtyShort": RULE_META["R1:QtyShort"]["ui_display"],
    "R5:ConfHit": RULE_META["R5:ConfHit"]["ui_display"],
    "R4:LeanMiss": RULE_META["R4:LeanMiss"]["ui_display"],
    "R3:ConfMiss": RULE_META["R3:ConfMiss"]["ui_display"],
    "R2:PGILate": RULE_META["R2:PGILate"]["ui_display"],
    "R1:QtyShort|R5:ConfHit": "Short confirmed quantity, but ship-to has strong delivery record",
    "R1:QtyShort|R3:ConfMiss": "Short confirmed quantity and ship-to has poor delivery history",
    "R1:QtyShort|R4:LeanMiss": "Short confirmed quantity and ship-to has elevated miss rate",
    "R2b:PGIExc1d|R5:ConfHit": "Goods issue slightly exceeds deadline, but ship-to is reliable",
    "R2:PGILate|R5:ConfHit": "Goods issue is late, but ship-to has strong delivery record",
}

# Same combos keyed by sorted rule codes (order in file may vary)
RULE_APPLIED_COMBO_UI_SORTED: dict[str, str] = {
    "|".join(sorted(k.split("|"))): v for k, v in RULE_APPLIED_COMBO_UI.items() if "|" in k
}

def _parse_rules(rule_applied: str) -> list[str]:
    """Split a pipe-delimited rule string into individual rule codes."""
    if not rule_applied:
        return ["R6:ModelOnly"]
    return [r.strip() for r in rule_applied.split("|") if r.strip()]


def _normalize_field_key(key: str) -> str:
    return re.sub(r"[\s_]+", "_", str(key).strip().lower())


def _extract_rule_fields(data: Mapping[str, Any]) -> tuple[str, str]:
    """Read rule_applied and combined_otif from row data (any header casing)."""
    rule_applied = str(
        _pick(data, ["rule_applied", "RULE_APPLIED", "Rule Applied"], default="") or ""
    ).strip()
    combined_otif = str(
        _pick(data, ["combined_otif", "COMBINED_OTIF", "Combined OTIF"], default="") or ""
    ).strip()

    for k, v in data.items():
        if v in (None, ""):
            continue
        nk = _normalize_field_key(k)
        if nk == "rule_applied" and not rule_applied:
            rule_applied = str(v).strip()
        elif nk == "combined_otif" and not combined_otif:
            combined_otif = str(v).strip()

    if not rule_applied:
        rule_applied = "R6:ModelOnly"
    return rule_applied, combined_otif


def _lookup_combo_ui(rule_applied: str) -> Optional[str]:
    canonical = "|".join(_parse_rules(rule_applied))
    if not canonical:
        canonical = "R6:ModelOnly"
    if canonical in RULE_APPLIED_COMBO_UI:
        return RULE_APPLIED_COMBO_UI[canonical]
    parts = _parse_rules(rule_applied)
    if len(parts) > 1:
        sorted_key = "|".join(sorted(parts))
        return RULE_APPLIED_COMBO_UI_SORTED.get(sorted_key)
    return None


def _build_rules_logic_bullets(rule_applied: str) -> list[str]:
    """UI-facing Rules logic lines sourced from the rule_applied column."""
    combo_text = _lookup_combo_ui(rule_applied)
    if combo_text:
        # For combo, prefix with rule names if we can resolve them
        codes = _parse_rules(rule_applied)
        rule_names = [RULE_META[c]["rule_name"] for c in codes if c in RULE_META]
        if rule_names:
            prefix = " & ".join(rule_names)
            return [f"{prefix}: {combo_text}"]
        return [combo_text]

    bullets: list[str] = []
    for code in _parse_rules(rule_applied):
        meta = RULE_META.get(code)
        if not meta:
            bullets.append(f"Operational rule applied ({code}).")
            continue
        rule_name = meta.get("rule_name", code)
        line = meta.get("ui_display") or meta.get("label", code)
        impact = meta.get("impact")
        if impact:
            line = f"{line} — {impact}"
        bullets.append(f"{rule_name}: {line}")

    if not bullets:
        meta = RULE_META["R6:ModelOnly"]
        bullets.append(f"{meta['rule_name']}: {meta['ui_display']}")
    return bullets


def _replace_rules_logic_section(text: str, rule_applied: str) -> str:
    """Overwrite the Rules logic block with deterministic text from rule_applied.

    This always replaces the LLM's Rules logic bullets with the pre-built
    rule-name-prefixed bullets so the rule number (e.g. "Rule 5:") is
    guaranteed to appear regardless of what the model wrote.
    """
    bullets = _build_rules_logic_bullets(rule_applied)
    # Ensure every bullet is prefixed with a rule name — safety net in case
    # _build_rules_logic_bullets somehow returned bare text.
    rule_codes = _parse_rules(rule_applied)
    named_bullets: list[str] = []
    for idx, bullet in enumerate(bullets):
        code = rule_codes[idx] if idx < len(rule_codes) else None
        meta = RULE_META.get(code, {}) if code else {}
        rule_name = meta.get("rule_name", "")
        # If bullet doesn't already start with "Rule N:" pattern, prepend it
        if rule_name and not re.match(rf"(?i)^{re.escape(rule_name)}\s*:", bullet):
            named_bullets.append(f"{rule_name}: {bullet}")
        else:
            named_bullets.append(bullet)

    lines = text.splitlines()
    out: list[str] = []
    i = 0
    section_re = re.compile(
        r"(?i)^\s*(rules logic|decision logic|key risk signals|recommended actions|risk)\s*:"
    )
    found = False

    while i < len(lines):
        line = lines[i]
        if re.match(r"(?i)^\s*rules logic\s*:", line):
            found = True
            out.append("Rules logic:")
            for b in named_bullets:
                out.append(f"- {b}")
            i += 1
            while i < len(lines) and not section_re.match(lines[i].strip()):
                i += 1
            continue
        out.append(line)
        i += 1

    if not found:
        block = ["Rules logic:", *[f"- {b}" for b in named_bullets], ""]
        insert_at = 0
        for idx, line in enumerate(out):
            if re.match(r"(?i)^\s*key risk signals\s*:", line.strip()):
                insert_at = idx
                break
            if re.match(r"(?i)^\s*risk\s*:", line.strip()):
                insert_at = idx + 1
                while insert_at < len(out) and out[insert_at].strip():
                    insert_at += 1
        out[insert_at:insert_at] = block

    return "\n".join(out).strip()


def _build_rule_section(rule_applied: str) -> str:
    """Return a human-readable block describing the rule(s) that fired."""
    combo = _lookup_combo_ui(rule_applied)
    if combo:
        codes = _parse_rules(rule_applied)
        rule_names = [RULE_META[c]["rule_name"] for c in codes if c in RULE_META]
        prefix = " & ".join(rule_names) if rule_names else rule_applied
        return f"  • {prefix}: {combo}"

    rules = _parse_rules(rule_applied)
    lines = []
    for rule in rules:
        meta = RULE_META.get(rule)
        if meta:
            rule_name = meta.get("rule_name", rule)
            lines.append(
                f"  • {rule_name} ({rule}): {meta.get('ui_display', meta['label'])}. "
                f"Definition — {meta.get('meaning', 'n/a')}. "
                f"Triggered when: {meta.get('triggered_when', 'n/a')}. "
                f"Impact: {meta.get('impact', 'n/a')}."
            )
        else:
            lines.append(f"  • [{rule}] (unknown rule)")
    return "\n".join(lines)


def _rule_driven_by_model_only(rule_applied: str) -> bool:
    rules = _parse_rules(rule_applied)
    return rules == ["R6:ModelOnly"]


def _has_rule(rule_applied: str, code: str) -> bool:
    return code in _parse_rules(rule_applied)


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

    # Rule context (from rule_applied / combined_otif columns) 
    rule_applied, combined_otif = _extract_rule_fields(data)
    data["rule_applied"] = rule_applied
    data["combined_otif"] = combined_otif
    rule_section = _build_rule_section(rule_applied)
    model_only = _rule_driven_by_model_only(rule_applied)

    # Compose a concise decision-logic summary for the LLM
    if model_only:
        decision_logic = (
            "The final outcome was determined solely by the CatBoost model probability. "
            "No operational business rule overrode the model score. "
            "Focus the explanation on the SHAP feature drivers below."
        )
    else:
        parsed = _parse_rules(rule_applied)
        rule_labels = [RULE_META.get(r, {}).get("label", r) for r in parsed]
        decision_logic = (
            f"The final outcome was influenced by {len(parsed)} business rule(s): "
            + "; ".join(f'"{lb}"' for lb in rule_labels)
            + ". "
            "Prioritise these rule signals in the explanation. "
            "The SHAP feature drivers provide supporting context."
        )

        # Hard-override guidance
        if _has_rule(rule_applied, "R2:PGILate"):
            decision_logic += (
                " IMPORTANT: R2:PGILate is a hard override — the planned goods-issue date is "
                "after the delivery deadline, so this order will definitely miss on time. "
                "State this clearly as the primary reason."
            )
        if _has_rule(rule_applied, "R1:QtyShort"):
            decision_logic += (
                " R1:QtyShort indicates the confirmed or delivered quantity is below the ordered "
                "quantity — a direct 'In-Full' risk. Highlight this prominently."
            )
        if _has_rule(rule_applied, "R3:ConfMiss"):
            decision_logic += (
                " R3:ConfMiss signals that this ship-to location has a very strong pattern of "
                "missing delivery (>70% miss rate over ≥10 orders). Treat this as a high-confidence "
                "structural risk."
            )
        if _has_rule(rule_applied, "R5:ConfHit"):
            decision_logic += (
                " R5:ConfHit indicates this ship-to location has a reliable on-time record (<30% "
                "miss rate over ≥10 orders). Acknowledge this as a mitigating factor even if other "
                "risk signals exist."
            )

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

    rules_logic_hint = _lookup_combo_ui(rule_applied) or (
        _build_rules_logic_bullets(rule_applied)[0] if _build_rules_logic_bullets(rule_applied) else ""
    )

    prompt = f"""
You are an expert in supply chain planning and OTIF (On-Time In-Full) performance.

=====================
ORDER CONTEXT
=====================
Customer: {customer}
Plant: {plant}
Material: {material}
Country: {country}
Requested Delivery Date: {requested_delivery_date}
Material Availability Date: {material_availability_date}
Prediction: {prediction} (Hit: {prob_hit} / Miss: {prob_miss})
Model output (combined_otif): {combined_otif or prediction}

=====================
DECISION LOGIC
=====================
rule_applied column: {rule_applied or "R6:ModelOnly"}
Rules logic (use this exact meaning in the Rules logic section):
- {rules_logic_hint}

Rule(s) Applied: {rule_applied or "R6:ModelOnly"}

{rule_section}

Guidance for this explanation:
{decision_logic}

=====================
TOP DRIVERS (SHAP)
=====================
1. {top1}
2. {top2}
3. {top3}

=====================
FEATURE DEFINITIONS
=====================
{COLUMN_DEFINITIONS}

=====================
INSTRUCTIONS
=====================
This prediction combines a machine-learning model score with operational business rules (see DECISION LOGIC above).

Follow these rules when writing the explanation:
- If a hard business rule fired (e.g. R2:PGILate, R1:QtyShort, R3:ConfMiss), lead with that rule as the primary reason. Do not bury it.
- If R5:ConfHit fired alongside risk rules, acknowledge the mitigating delivery track record.
- If only R6:ModelOnly fired, focus entirely on the SHAP feature drivers.
- In the Rules logic section, always mention the rule by its human-readable name (e.g. "Rule 2", "Rule 1") followed by a colon and its plain-language definition. Example: "Rule 2: The planned goods-issue date is past the delivery deadline, making on-time shipment impossible."
- Translate all technical feature names into plain supply chain language.
- Focus on risk signals rather than claiming exact certainty.
- Use a structured, bulleted format as defined below.
- Keep descriptions concise and professional.
- Stick strictly to the provided input data only. Do not include any numbers, percentages, or statistics that are not explicitly provided in the order context or drivers.

=====================
OUTPUT FORMAT
=====================
Risk: <Insert 🔴 High / 🟡 Medium / 🟢 Low based on prediction and probabilities>

Rules logic:
- <Bullet point 1: Start with the rule name e.g. "Rule 2" then a colon, then the plain-language definition of that rule and how it influenced the outcome. Example: "Rule 2: The planned goods-issue date falls after the delivery deadline, making on-time shipment physically impossible — hard override to Miss.">
- <Bullet point 2: If a second rule fired, follow the same "Rule N: definition" format. If only model-based (Rule 6), write: "Rule 6: No operational rule was triggered — outcome determined entirely by the machine-learning model.">

Key risk signals:
- <Bullet point 1: primary risk signal — lead with any hard rule override if present>
- <Bullet point 2: secondary risk signal>
- <Bullet point 3: third risk signal>

Recommended actions:
- <Action 1: logical mitigation step>
- <Action 2: logical mitigation step>
"""
    return prompt


def generate_explanation(data: Mapping[str, Any]) -> str:
    prompt = build_prompt(data)

    system_instruction = (
        "You are an expert supply chain analyst explaining OTIF predictions for a single order. "
        "Follow the OUTPUT FORMAT in the user prompt exactly. "
        "In the Rules logic section, always begin each bullet with the rule name (e.g. 'Rule 1:', 'Rule 2:') "
        "followed by a plain-language definition of what that rule means and how it influenced the outcome. "
        "When a hard operational rule (quantity shortfall, late goods issue, poor ship-to history) "
        "drove the outcome, lead with that fact as the primary signal. "
        "Use plain supply-chain language for all other sections. "
        "Keep each bullet to one short sentence."
    )

    client = _get_client()
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.2,
            max_output_tokens=1024,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )

    return (response.text or "").strip()


def _humanize_feature_name(raw_feat: str) -> str:
    key_lower = raw_feat.strip().lower()
    if key_lower in FEATURE_NAME_MAP:
        return FEATURE_NAME_MAP[key_lower]["business_name"]
    for k, v in FEATURE_NAME_MAP.items():
        k_lower = k.lower()
        if k_lower == key_lower or k_lower == f"f_{key_lower}" or f"f_{k_lower}" == key_lower:
            return v["business_name"]
    return raw_feat.removeprefix("f_").replace("_", " ").title()


def _fallback_explanation(data: Mapping[str, Any], drivers: Optional[Sequence[Tuple[str, Any, Any]]]) -> str:
    predicted_label = int(data.get("predicted_label", 0))
    prediction = "HIT" if predicted_label == 1 else "MISS"
    prob_miss = data.get("prob_miss", "")
    risk = "Low" if prediction == "HIT" else "High"

    rule_applied, _combined_otif = _extract_rule_fields(data)
    rules = _parse_rules(rule_applied)

    bullets = []
    # Prioritise hard rule signals in fallback too
    for rule in rules:
        meta = RULE_META.get(rule)
        if meta and meta["driven_by"] == "rule":
            bullets.append(f"- {meta['label'].capitalize()}.")
        if len(bullets) >= 2:
            break

    for feat, _, _ in (list(drivers)[:3] if drivers else []):
        if len(bullets) >= 3:
            break
        bullets.append(f"- {_humanize_feature_name(str(feat))} influenced this {prediction} prediction.")

    if not bullets:
        bullets.append("- SHAP drivers were not available for this order.")

    rule_bullets = [f"- {b}" for b in _build_rules_logic_bullets(rule_applied)]

    return (
        f"Risk: {risk}\n\n"
        f"Rules logic:\n"
        + "\n".join(rule_bullets)
        + f"\n\nKey risk signals:\n"
        + "\n".join(bullets)
        + f"\n\nRecommended actions:\n"
        f"- Review material availability against the requested delivery date.\n"
        f"- Monitor plant and customer historical OTIF performance (miss probability {prob_miss}%)."
    )


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
    rule_applied, combined_otif = _extract_rule_fields(data)
    data["rule_applied"] = rule_applied
    data["combined_otif"] = combined_otif

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
        raw_key = str(feat)
        data[f"raw_top{idx}_feature"] = raw_key
        data[f"top{idx}_feature"] = raw_key
        data[f"top{idx}_value"] = val
        data[f"top{idx}_shap"] = shap_val

    try:
        full_text = generate_explanation(data) or ""
    except Exception:
        full_text = _fallback_explanation(data, drivers)

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
        combo_ui = _lookup_combo_ui(rule_applied)
        if combo_ui:
            shap_one_liner = f"Key signals: {combo_ui}"
        else:
            rules = _parse_rules(rule_applied)
            rule_labels = [
                RULE_META[r].get("ui_display") or RULE_META[r]["label"]
                for r in rules
                if r in RULE_META and RULE_META[r]["driven_by"] == "rule"
            ]
            if rule_labels:
                shap_one_liner = "Key signals: " + "; ".join(rule_labels)
            else:
                driver_bits = [_humanize_feature_name(str(feat)) for feat, _, _ in (list(drivers)[:3] if drivers else [])]
                shap_one_liner = "Key drivers: " + ", ".join(driver_bits) if driver_bits else "Key drivers: (not available)"

    # Remove SHAP numerical values from shap_one_liner (e.g., remove "(+2.848)" or " (+2.848)")
    shap_one_liner = re.sub(r'\s*\(\s*[+-]?\s*\d+\.\d+\s*\)', '', shap_one_liner)

    summary_text = _replace_rules_logic_section("\n".join(lines).strip(), rule_applied)
    return summary_text, shap_one_liner.strip()