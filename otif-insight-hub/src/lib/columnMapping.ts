/**
 * Column name mapping: raw CSV header → business-friendly display name.
 * Keys are lowercase for case-insensitive lookup.
 * Unknown columns from custom datasets are displayed as-is.
 */

const COLUMN_DISPLAY_NAMES: Record<string, string> = {
    "sales order": "Sales Order",
    "so line": "SO Line Item",
    "so create date": "Order Created Date",
    "mat_avl_date_otif": "Material Availability Date",
    "material": "Material Code",
    "material description": "Material Description",
    "abc indicator": "ABC Classification",
    "plant": "Plant",
    "ship_to": "Ship-To Party",
    "sold-to party": "Sold-To Party",
    "net_value (header level of document)": "Net Value (Header)",
    "net_value (item level at document)": "Net Value (Item)",
    "local currency": "Currency",
    "ordered_quantity": "Ordered Quantity",
    "sales organization": "Sales Organization",
    "requested delivery date": "Requested Delivery Date",
    "csr": "Customer Service Rep",
    "customer_pickup": "Customer Pickup",
    "otif_hit/miss": "OTIF Status",
    "overdeliv_tolerance_otif": "Overdelivery Tolerance",
    "underdel_tolerance_otif": "Underdelivery Tolerance",
    "first_confirmed_quantity": "First Confirmed Qty",
    "taski machine indicator": "TASKI Machine Flag",
    "orderd_qty_y": "Ordered Qty (Alt)",
    "ordered_qty_in_kgs": "Ordered Qty (KG)",
    "ordered_quantity_base_uom": "Ordered Qty (Base UOM)",
    "ordered_value_in_currency": "Ordered Value",
    "base_uom": "Base Unit of Measure",
    "customer name": "Customer Name",
    "city": "City",
    "country": "Country",
    "state - province": "State / Province",
    "division of business name": "Business Units",
    "material_product_line": "Product Line",
    "material_type": "Material Type",
    "material base code desc": "Material Base Code",
    "prob_hit": "Hit Probability",
    "prob_miss": "Miss Probability",
    "predicted_label": "Predicted Label",
    "top1_feature": "Top Risk Factor 1",
    "top1_value": "Risk Factor 1 Value",
    "top1_shap": "Risk Factor 1 Impact",
    "top2_feature": "Top Risk Factor 2",
    "top2_value": "Risk Factor 2 Value",
    "top2_shap": "Risk Factor 2 Impact",
    "top3_feature": "Top Risk Factor 3",
    "top3_value": "Risk Factor 3 Value",
    "top3_shap": "Risk Factor 3 Impact",
};

/**
 * Get a business-friendly display name for a raw CSV header.
 * Falls back to the raw header for unknown columns.
 */
export function getDisplayName(rawHeader: string): string {
    const key = rawHeader.trim().toLowerCase();
    return COLUMN_DISPLAY_NAMES[key] || rawHeader;
}

/**
 * Default column keys (lowercase) shown in the table on first load.
 * These correspond to the original 9 columns.
 */
export const DEFAULT_COLUMN_KEYS = [
    "sales order",
    "so create date",
    "customer name",
    "division of business name",
    "material",
    "plant",
    "requested delivery date",
    "leadTime",
    "riskScore",
    "status",
    "riskSignals"
];

/**
 * Find the best matching raw header for a default column key.
 * Falls back to the key itself if no match is found.
 */
export function resolveDefaultColumn(defaultKey: string, availableHeaders: string[]): string {
    // Exact match (case-insensitive)
    const lower = defaultKey.toLowerCase();
    const exact = availableHeaders.find(h => h.toLowerCase() === lower);
    if (exact) return exact;

    // Alias maps for common variations
    const aliases: Record<string, string[]> = {
        "sales order": ["sales_order", "salesorder", "order"],
        "customer name": ["customer", "customer_name", "ship-to name", "ship to name"],
        "material": ["material id", "material code", "material_code"],
        "plant": ["plant name"],
        "requested delivery date": ["req_delivery", "requested_delivery", "requested_delivery_date", "req. deliv. date", "req delivery date"],
        "so create date": ["so_create_date", "order date", "order_date", "sales order date"],
        "riskscore": ["risk_score", "prob_miss", "miss probability"],
        "status": ["otif_hit/miss", "otif_hit", "prediction"],
        "risksignals": ["risk signals"],
        "top1_feature": [],
    };

    const candidates = aliases[lower] || [];
    for (const alias of candidates) {
        const match = availableHeaders.find(h => h.toLowerCase() === alias.toLowerCase());
        if (match) return match;
    }

    return defaultKey;
}
