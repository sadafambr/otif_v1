import os
import re
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence, Tuple

from dotenv import load_dotenv
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from utils.logger import get_logger
from config.column_definitions import COLUMN_DEFINITIONS

logger = get_logger(__name__)


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
INSTRUCTIONS
=====================

Provide a 2–3 sentence explanation covering the root cause and key risk drivers. Use professional supply chain language.

End your response with exactly one final line in this format (max 25 words):
SHAP_ONE_LINE: <one-line explanation of the key SHAP drivers>

"""

    return prompt


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10), reraise=True)
def _call_openai(prompt: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an expert OTIF supply chain analyst. Be concise."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
        max_tokens=150,
        timeout=15.0  # Prevent "stuck" loading states
    )
    return response.choices[0].message.content

def generate_explanation(data):
    logger.debug("Building prompt for explanation")
    prompt = build_prompt(data)

    if not os.getenv("OPENAI_API_KEY"):
        logger.error("OPENAI_API_KEY is missing from environment")
        raise ValueError("OPENAI_API_KEY is not set. Set it in environment or otif-genai/.env.")

    logger.info("Calling OpenAI API for explanation generation")
    try:
        explanation = _call_openai(prompt)
        logger.debug("Successfully generated explanation")
        return explanation
    except Exception as e:
        logger.error("Failed to generate explanation from OpenAI after retries", exc_info=True)
        raise RuntimeError(f"Failed to generate explanation: {str(e)}") from e


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
    logger.debug("Summary and SHAP one-liner successfully extracted")
    return summary_text, shap_one_liner.strip()