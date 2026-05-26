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
    "ship to": {"business_name": "Ship-To Party", "technical_name": "Ship_To"},
    "ship_to": {"business_name": "Ship-To Party", "technical_name": "Ship_To"},
    "csr": {"business_name": "Customer Service Rep", "technical_name": "CSR"},
    "city": {"business_name": "City", "technical_name": "City"},
    "plant": {"business_name": "Plant", "technical_name": "Plant"},
    "hist miss rate material": {"business_name": "Historical Material Miss Rate", "technical_name": "Hist Miss Rate Material"},
    "mad gap days": {"business_name": "MAD Gap Days", "technical_name": "Mad Gap Days"},
    "mad_gap_days": {"business_name": "MAD Gap Days", "technical_name": "Mad Gap Days"},
    "material": {"business_name": "Material Code", "technical_name": "Material"},
    "customer name": {"business_name": "Customer Name", "technical_name": "Customer Name"},
    "division of business name": {"business_name": "Business Units", "technical_name": "Division of Business Name"},
    "sales order": {"business_name": "Sales Order", "technical_name": "Sales Order"},
    "so line": {"business_name": "SO Line Item", "technical_name": "SO Line"},
    "so create date": {"business_name": "Order Created Date", "technical_name": "SO create date"},
    "requested delivery date": {"business_name": "Requested Delivery Date", "technical_name": "Requested Delivery Date"},
    "abc indicator": {"business_name": "ABC Classification", "technical_name": "ABC Indicator"},
    "sales organization": {"business_name": "Sales Organization", "technical_name": "Sales Organization"},
    "delivery_date": {"business_name": "Delivery Date", "technical_name": "Delivery Date"},
    "plant region": {"business_name": "Plant Region", "technical_name": "Plant Region"},
    "routedays": {"business_name": "Route Days", "technical_name": "RouteDays"},
    "ordered_quantity_base_uom": {"business_name": "Ordered Qty (Base UOM)", "technical_name": "Ordered_Quantity_Base_UOM"},
    "confirmed_quantity_in_base_uom": {"business_name": "Confirmed Qty (Base UOM)", "technical_name": "Confirmed_Quantity_in_Base_UOM"},
    "ordered_in_base_uom": {"business_name": "Ordered in Base UOM", "technical_name": "Ordered_in_Base_UOM"},
    "incoterms_x": {"business_name": "Incoterms", "technical_name": "Incoterms_x"},
    "act_goods_mvnt_date": {"business_name": "Actual Goods Movement Date", "technical_name": "Act_Goods_Mvnt_Date"},
    "pland gds mvmnt date_otif_x": {"business_name": "Planned Goods Movement Date", "technical_name": "Pland Gds Mvmnt Date_OTIF_x"},
    "total_del": {"business_name": "Total Delivery", "technical_name": "total_del"},
    "mat_avl_date_otif": {"business_name": "Material Availability Date", "technical_name": "Mat_Avl_Date_OTIF"},
    "rule_applied": {"business_name": "Rule Applied", "technical_name": "rule_applied"},
    "combined_otif": {"business_name": "Model Output (Combined OTIF)", "technical_name": "combined_otif"},
}

# Business rule metadata (aligned with rule_applied column in model output)
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
    """Overwrite the Rules logic block with deterministic text from rule_applied."""
    bullets = _build_rules_logic_bullets(rule_applied)
    rule_codes = _parse_rules(rule_applied)
    named_bullets: list[str] = []
    for idx, bullet in enumerate(bullets):
        code = rule_codes[idx] if idx < len(rule_codes) else None
        meta = RULE_META.get(code, {}) if code else {}
        rule_name = meta.get("rule_name", "")
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


def _resolve_risk_label(data: Mapping[str, Any]) -> str:
    """
    Derive a High / Medium / Low risk label from available data fields.
    Priority: explicit risk_level field → prob_miss threshold → predicted_label.
    """
    raw = str(_pick(data, ["risk_level", "Risk Level", "RiskLevel", "risk"], default="")).strip().lower()
    if raw in ("high", "medium", "low"):
        return raw.capitalize()

    prob_miss = data.get("prob_miss", "")
    try:
        pm = float(prob_miss)
        if pm >= 0.65:
            return "High"
        elif pm >= 0.40:
            return "Medium"
        else:
            return "Low"
    except (TypeError, ValueError):
        pass

    predicted_label = int(data.get("predicted_label", 0))
    return "Low" if predicted_label == 1 else "High"


def _fmt_driver(raw_feat: str, val: Any) -> str:
    """Map a raw feature key to its business name for use inside the prompt."""
    if not raw_feat:
        return "None"
    mapping: dict = {}
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


def _resolve_risk_direction(shap_val: Any) -> str:
    """Convert a SHAP value to a human-readable direction label."""
    try:
        return "Risk" if float(shap_val) > 0 else "Supporting"
    except (TypeError, ValueError):
        return "Risk"


def build_prompt(data: Mapping[str, Any]) -> str:
    # ── Resolve core fields ───────────────────────────────────────────────────
    risk_label = _resolve_risk_label(data)

    rule_applied, combined_otif = _extract_rule_fields(data)
    model_only = _rule_driven_by_model_only(rule_applied)

    # Rule explanation in plain language (from RULE_META)
    rule_codes = _parse_rules(rule_applied)
    if model_only:
        rule_explanation = (
            "No single operational condition dominates; the current order outlook reflects "
            "the combined impact of current order conditions."
        )
    else:
        # Build a single, joined explanation from all fired rules
        explanations = []
        for code in rule_codes:
            meta = RULE_META.get(code)
            if meta and meta["driven_by"] == "rule":
                explanations.append(meta["explanation"])
        rule_explanation = " ".join(explanations) if explanations else ""

    # ── Top features ─────────────────────────────────────────────────────────
    features_block_lines: list[str] = []
    for i in (1, 2, 3):
        raw_feat = str(data.get(f"raw_top{i}_feature", data.get(f"top{i}_feature", ""))).strip()
        val = data.get(f"top{i}_value", "")
        shap_val = data.get(f"top{i}_shap", "")
        if not raw_feat:
            continue

        mapping: dict = {}
        key_lower = raw_feat.lower()
        if key_lower in FEATURE_NAME_MAP:
            mapping = FEATURE_NAME_MAP[key_lower]
        else:
            for k, v in FEATURE_NAME_MAP.items():
                k_lower = k.lower()
                if k_lower == key_lower or k_lower == f"f_{key_lower}" or f"f_{k_lower}" == key_lower:
                    mapping = v
                    break

        pillar = mapping.get("business_name", raw_feat.replace("f_", "").replace("_", " ").title())
        description = mapping.get("business_name", raw_feat.replace("f_", "").replace("_", " ").title())
        direction = _resolve_risk_direction(shap_val)

        features_block_lines.append(
            f"  - Pillar: {pillar}\n"
            f"    Description: {description}\n"
            f"    Direction: {direction}\n"
            f"    Actual Value: {val}"
        )

    features_block = "\n".join(features_block_lines) if features_block_lines else "  (no feature data available)"

    # ── Suggested actions (optional) ─────────────────────────────────────────
    suggested_actions = str(
        _pick(data, ["suggested_actions", "Suggested Actions", "SuggestedActions"], default="")
    ).strip()

    # ── Prompt ───────────────────────────────────────────────────────────────
    prompt = f"""You are a Supply Chain Planner generating concise OTIF explanations for daily order review.

AUDIENCE:
Supply chain planners and supply chain leadership.

OBJECTIVE:
Generate short business-friendly explanations that:
1. Explain delivery risk
2. Explain the business reason (if business logic influenced outcome)
3. Show strongest supporting signals
4. Recommend one operational next action

Use only provided inputs. Do not speculate.

====================
INPUTS
====================

Prediction: {risk_label}
Rule Applied: {"ModelOnly" if model_only else " | ".join(rule_codes)}
Rule Explanation: {rule_explanation}

Top Features:
{features_block}

Suggested Actions: {suggested_actions if suggested_actions else "(none provided)"}

====================
OUTPUT FORMAT
====================

<emoji> <Risk Level>

<Business reason sentence>

- <signal 1>
- <signal 2>

- <recommended action>

====================
LOGIC
====================

1. Risk Display:
🔴 High
🟠 Medium
🟢 Low

2. Business Reason

If Rule Applied is not ModelOnly:
- Restate the Rule Explanation in plain business language.
- Must be at least 7 to 11 words long.
- Explain the operational impact clearly.
- Do not use rule codes, rule names, or technical terms.
- Do not use words like "input", "rule", "model", "flag", or "parameter".

Examples:
- The shipment is planned to leave after the customer's requested delivery date, creating timing risk.
- The confirmed quantity falls short of what the customer ordered, creating a fulfillment gap.
- Historical delivery performance for this lane indicates elevated execution risk.

If Rule Applied is ModelOnly:
- No single operational condition dominates; the current order outlook reflects the combined impact of current order conditions.

3. Supporting Signals
- Select maximum 2 strongest features.
- Prefer Risk-direction features over Supporting-direction.
- Convert technical feature names into business language.
- Explain the business implication, not the metric.
- Do not repeat the business reason.
- Do not mention rankings, calculations, scores, or raw values unless essential for clarity.
- Signals must reinforce the stated risk level.

Examples:
- Available inventory is below the level needed to fulfill this order.
- Material constraints reduce shipment flexibility for this delivery.

4. Recommended Action
- Generate exactly 1 action.
- Priority order: Business reason → Features → Suggested Actions.
- Must directly address the strongest risk factor.
- Must be operational and immediately executable.
- Must start with a verb.
- Do not recommend analysis, review, or monitoring unless risk is Low.
- No generic or vague actions.

Examples by scenario:
Shipment timing → Expedite shipment planning and reconfirm the delivery commitment with the carrier.
Quantity shortfall → Validate allocation and secure the remaining order quantity before shipment.
Inventory issue → Reallocate available inventory to protect this order's fulfillment.
Production issue → Confirm production recovery timing directly with plant operations.
Customer execution → Confirm customer pickup readiness and lock in the delivery commitment.
Low risk → Continue execution and monitor delivery readiness through shipment.

====================
STYLE
====================
- Output only the explanation. No labels, headers, section titles, or field names.
- Do not include words like: Input, Rule Applied, Rule Explanation, Prediction, Features, Suggested Actions.
- Do not include words like: model, AI, algorithm, probability, override, confidence, flag, score, parameter.
- Do not include order identifiers or customer names.
- Business language only. Short, clear sentences.
- Maximum 90 words total.
"""
    return prompt


def generate_explanation(data: Mapping[str, Any]) -> str:
    prompt = build_prompt(data)

    system_instruction = (
        "You are an expert supply chain analyst explaining OTIF delivery risk for a single order. "
        "Follow the OUTPUT FORMAT in the user prompt exactly — output only the four elements: "
        "risk emoji + level, business reason sentence, two supporting signal bullets, one action bullet. "
        "Never include section headers, labels, or field names in your response. "
        "The business reason must be at least 7 words and written in plain operational language. "
        "When a hard operational condition drove the outcome (late goods issue, quantity shortfall, "
        "poor delivery history), lead with that as the primary reason. "
        "Keep every bullet to one short sentence."
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
    risk_label = _resolve_risk_label(data)
    prob_miss = data.get("prob_miss", "")

    rule_applied, _combined_otif = _extract_rule_fields(data)
    rules = _parse_rules(rule_applied)

    bullets = []
    for rule in rules:
        meta = RULE_META.get(rule)
        if meta and meta["driven_by"] == "rule":
            bullets.append(f"- {meta['label'].capitalize()}.")
        if len(bullets) >= 2:
            break

    for feat, _, _ in (list(drivers)[:3] if drivers else []):
        if len(bullets) >= 3:
            break
        bullets.append(f"- {_humanize_feature_name(str(feat))} contributed to this delivery risk.")

    if not bullets:
        bullets.append("- Supporting signals were not available for this order.")

    rule_bullets = [f"- {b}" for b in _build_rules_logic_bullets(rule_applied)]

    return (
        f"Risk: {risk_label}\n\n"
        f"Rules logic:\n"
        + "\n".join(rule_bullets)
        + "\n\nKey risk signals:\n"
        + "\n".join(bullets)
        + "\n\nRecommended actions:\n"
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
                driver_bits = [
                    _humanize_feature_name(str(feat))
                    for feat, _, _ in (list(drivers)[:3] if drivers else [])
                ]
                shap_one_liner = (
                    "Key drivers: " + ", ".join(driver_bits) if driver_bits else "Key drivers: (not available)"
                )

    # Remove SHAP numerical values from shap_one_liner (e.g. "(+2.848)")
    shap_one_liner = re.sub(r'\s*\(\s*[+-]?\s*\d+\.\d+\s*\)', '', shap_one_liner)

    summary_text = _replace_rules_logic_section("\n".join(lines).strip(), rule_applied)
    return summary_text, shap_one_liner.strip()