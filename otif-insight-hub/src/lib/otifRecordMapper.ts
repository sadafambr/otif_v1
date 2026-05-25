import type { OTIFRecord } from "@/types/otif";
import type { SpreadsheetTable } from "@/lib/spreadsheetParser";

function rowLookup(
  columnKeys: string[],
  values: string[],
): (key: string) => string {
  const indexByKey = new Map<string, number>();
  columnKeys.forEach((k, i) => indexByKey.set(k, i));
  const indexByLower = new Map<string, number>();
  columnKeys.forEach((k, i) => indexByLower.set(k.toLowerCase(), i));

  return (key: string) => {
    const idx = indexByKey.get(key) ?? indexByLower.get(key.toLowerCase());
    return idx !== undefined ? values[idx] ?? "" : "";
  };
}

export function mapSpreadsheetToOtifRecords(table: SpreadsheetTable): OTIFRecord[] {
  const { columnKeys, rows } = table;
  if (columnKeys.length === 0 || rows.length === 0) return [];

  const parsed: OTIFRecord[] = [];

  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i];
    const get = rowLookup(columnKeys, cols);

    const getAny = (...keys: string[]) => {
      for (const k of keys) {
        const v = get(k);
        if (v) return v;
      }
      return "";
    };

    const rawStatus = getAny(
      "otif_hit/miss",
      "otif_hit",
      "status",
      "prediction",
      "otif_status",
      "otif hit/miss",
    );

    const normalizedStatus = rawStatus.trim().toLowerCase();

    const parseProb = (value: string): number | null => {
      if (!value) return null;
      const n = parseFloat(value);
      if (!Number.isFinite(n)) return null;
      const pct = n >= 0 && n <= 1 ? n * 100 : n;
      return Math.max(0, Math.min(100, pct));
    };

    const probHit = parseProb(
      getAny("otif_hit", "prob_hit", "hit_probability", "hit probability", "probability_hit", "hit_prob"),
    );
    const probMiss = parseProb(
      getAny(
        "otif_miss",
        "prob_miss",
        "risk_score",
        "riskscore",
        "miss probability",
        "probability_miss",
        "miss_prob",
        "risk_percent",
      ),
    );

    let status: "Hit" | "Miss";
    if (probHit !== null && probMiss !== null) {
      status = probHit >= probMiss ? "Hit" : "Miss";
    } else if (
      normalizedStatus.includes("miss") ||
      normalizedStatus.includes("late") ||
      normalizedStatus === "0" ||
      normalizedStatus === "false"
    ) {
      status = "Miss";
    } else if (
      normalizedStatus.includes("hit") ||
      normalizedStatus.includes("on-time") ||
      normalizedStatus.includes("ontime") ||
      normalizedStatus.includes("on time") ||
      normalizedStatus === "1" ||
      normalizedStatus === "true"
    ) {
      status = "Hit";
    } else {
      status = "Hit";
    }

    let riskScore: number;
    const rawRisk = getAny("risk_score", "riskscore", "risk_percent", "risk");
    if (rawRisk) {
      const n = parseFloat(rawRisk);
      if (Number.isFinite(n)) {
        riskScore = n >= 0 && n <= 1 ? n * 100 : n;
      } else {
        riskScore = probMiss ?? (probHit != null ? 100 - probHit : 0);
      }
    } else if (probMiss != null) {
      riskScore = probMiss;
    } else if (probHit != null) {
      riskScore = 100 - probHit;
    } else {
      riskScore = 0;
    }
    riskScore = Math.max(0, Math.min(100, Math.round(riskScore * 10) / 10));

    let leadTime = getAny("lead_time", "leadtime", "lead days", "lead_days");
    if (!leadTime) {
      const gap = parseFloat(getAny("f_lead_gap_days", "lead_gap_days", "gap_days"));
      if (Number.isFinite(gap)) {
        leadTime = String(Math.max(0, Math.round(gap)));
      } else {
        const reqLead = parseFloat(getAny("f_request_lead_days", "request_lead_days", "request_lead"));
        const matLead = parseFloat(getAny("f_material_lead_days", "material_lead_days", "material_lead"));
        if (Number.isFinite(reqLead) && Number.isFinite(matLead)) {
          leadTime = String(Math.max(0, Math.round(reqLead - matLead)));
        } else {
          const rddStr = getAny(
            "requested delivery date",
            "requested_delivery_date",
            "req. deliv. date",
            "req_delivery",
            "requested_delivery",
            "req delivery date",
            "rdd",
          );
          const matAvlStr = getAny(
            "mat_avl_date_otif",
            "mat avl date otif",
            "material availability date",
            "mat_avail_date",
            "mad",
          );
          const soDateStr = getAny(
            "so create date",
            "so_create_date",
            "order date",
            "order_date",
            "sales order date",
            "so_date",
          );

          const parseDate = (s: string) => {
            if (!s) return null;
            const d = new Date(s);
            return isNaN(d.getTime()) ? null : d;
          };

          const rddDate = parseDate(rddStr);
          const matAvlDate = parseDate(matAvlStr);
          const soDate = parseDate(soDateStr);

          if (rddDate && matAvlDate) {
            const diffMs = rddDate.getTime() - matAvlDate.getTime();
            leadTime = String(Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24))));
          } else if (rddDate && soDate && matAvlDate) {
            const reqMs = rddDate.getTime() - soDate.getTime();
            const matMs = matAvlDate.getTime() - soDate.getTime();
            const gapDays = (reqMs - matMs) / (1000 * 60 * 60 * 24);
            leadTime = String(Math.max(0, Math.round(gapDays)));
          }
        }
      }
    }

    const shapSignals: string[] = [];
    for (const key of [
      "top1_feature",
      "top2_feature",
      "top3_feature",
      "top_feature_1",
      "top_feature_2",
      "top_feature_3",
      "shap_feature_1",
      "shap_feature_2",
      "shap_feature_3",
    ]) {
      const feat = get(key);
      if (feat) shapSignals.push(feat);
    }

    const top1Feature = getAny("top1_feature", "top_feature_1", "shap_feature_1") || undefined;
    const top1Value = getAny("top1_value", "top_value_1", "shap_value_1") || undefined;
    const top1ShapRaw = parseFloat(getAny("top1_shap", "top_shap_1", "shap_impact_1"));
    const top1Shap = Number.isFinite(top1ShapRaw) ? top1ShapRaw : undefined;

    const top2Feature = getAny("top2_feature", "top_feature_2", "shap_feature_2") || undefined;
    const top2Value = getAny("top2_value", "top_value_2", "shap_value_2") || undefined;
    const top2ShapRaw = parseFloat(getAny("top2_shap", "top_shap_2", "shap_impact_2"));
    const top2Shap = Number.isFinite(top2ShapRaw) ? top2ShapRaw : undefined;

    const top3Feature = getAny("top3_feature", "top_feature_3", "shap_feature_3") || undefined;
    const top3Value = getAny("top3_value", "top_value_3", "shap_value_3") || undefined;
    const top3ShapRaw = parseFloat(getAny("top3_shap", "top_shap_3", "shap_impact_3"));
    const top3Shap = Number.isFinite(top3ShapRaw) ? top3ShapRaw : undefined;

    const rawData: Record<string, string> = {};
    for (let h = 0; h < columnKeys.length; h++) {
      rawData[columnKeys[h]] = cols[h] ?? "";
    }

    parsed.push({
      rowNum: i + 1,
      salesOrder: getAny("sales_order", "salesorder", "order", "sales order", "so"),
      customer: getAny(
        "customer",
        "customer name",
        "customer_name",
        "ship-to name",
        "ship to name",
        "customer_id",
      ),
      material: getAny(
        "material",
        "material description",
        "material_description",
        "material id",
        "material code",
        "product",
      ),
      plant: getAny("plant", "plant name", "location"),
      reqDelivery: getAny(
        "req_delivery",
        "requested_delivery",
        "requested delivery date",
        "requested_delivery_date",
        "req. deliv. date",
        "req delivery date",
        "rdd",
      ),
      soCreateDate:
        getAny("so create date", "so_create_date", "order date", "order_date", "sales order date", "so_date") ||
        "",
      leadTime: leadTime || "",
      riskScore,
      status,
      probHit: probHit ?? undefined,
      probMiss: probMiss ?? undefined,
      riskSignals: shapSignals.length > 0 ? shapSignals.join("; ") : undefined,
      top1Feature,
      top1Value,
      top1Shap,
      top2Feature,
      top2Value,
      top2Shap,
      top3Feature,
      top3Value,
      top3Shap,
      rawData,
    });
  }

  return parsed;
}

export function buildHeaderLabelMap(table: SpreadsheetTable): Record<string, string> {
  const map: Record<string, string> = {};
  table.columnKeys.forEach((key, i) => {
    map[key] = table.columnLabels[i] ?? key;
  });
  return map;
}
