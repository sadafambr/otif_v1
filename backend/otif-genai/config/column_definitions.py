COLUMN_DEFINITIONS = """

===============================
CORE BUSINESS DATES
===============================

SO create date:
Date when the sales order was created. This is the starting point of the fulfillment timeline.

Requested Delivery Date:
Date when the customer expects delivery. This defines the fulfillment deadline.

Mat_Avl_Date_OTIF:
Date when material becomes available for fulfillment. If this date is after the requested delivery date, OTIF miss risk increases.

Delivery_Date For Sigura and Diversey (Actual Goods Movement):
Actual shipment date. Used to evaluate OTIF performance.


===============================
CUSTOMER / MATERIAL / LOCATION
===============================

Customer Name:
Customer placing the order.

Ship-To:
Customer delivery location.
Used to measure location-specific logistics pressure and OTIF risk.

Business Unit:
Organizational unit responsible for fulfillment.
Used to evaluate business-level OTIF performance.

State:
Geographical delivery region used to capture regional logistics reliability.

Material:
Product identifier.

Material description:
Description of product.

ABC Indicator:
Material consumption classification based on movement and usage.

A → High consumption & movement (high priority, lower OTIF risk)
B → High movement, lower quantity (moderate risk)
C → High volume, low frequency (planning variability risk)
D → Low movement & low consumption (low priority, higher OTIF risk)
Z → Not consumed recently (inactive SKU, high stock-out risk)


===============================
LEAD TIME AND TIMING FEATURES
===============================

f_request_lead_days:
Number of days between order creation and requested delivery date.
Higher values provide more execution time and reduce risk.

f_material_lead_days:
Number of days between order creation and material availability date.
Higher values indicate slower material readiness and increase risk.

f_lead_gap_days:
Difference between request lead time and material lead time.
Positive gap = safe buffer → lower OTIF risk
Negative gap = insufficient time → higher OTIF risk

f_tight_ratio:
Ratio of request lead time divided by material lead time.
Ratio < 1 indicates insufficient time → high risk
Ratio > 1 indicates sufficient buffer → lower risk

f_is_tight_order:
Indicates order timing is tight and execution flexibility is limited.

f_is_extremely_tight:
Indicates severely constrained order where material readiness is far behind demand.
This strongly increases OTIF miss risk.


===============================
ADDITIONAL TIMING FEATURES (FROM EXCEL)
===============================

f_so_to_rdd_days:
Days between sales order creation and requested delivery date.
Represents customer lead time.

f_so_to_mat_avail_days:
Days between sales order creation and material availability.
Indicates readiness timeline.

f_mat_avail_to_rdd_days:
Buffer days between material readiness and requested delivery.
Higher values indicate safer fulfillment.

f_mat_ready_after_rdd:
Material becomes available after requested delivery date.
Strong OTIF miss indicator.

f_critical_negative_gap:
Material arrives more than 3 days after requested delivery.
Severe delivery risk.

f_mild_negative_gap:
Material arrives slightly after requested delivery.
Moderate risk.

f_large_positive_gap:
Material available well before delivery.
Indicates safe fulfillment.

f_gap_bin:
Categorized lead gap used for risk segmentation.


===============================
PLANT RISK FEATURES
===============================

Plant:
Manufacturing or fulfillment location.

f_plant_miss_rate:
Historical OTIF miss rate at plant.
Higher values indicate unreliable plant performance.

f_high_plant_risk:
Flag indicating plant has historically high failure rates.

f_plant_orders_7d:
Number of orders processed at plant in last 7 days.
Higher values indicate workload pressure.

f_plant_orders_30d:
Number of orders processed at plant in last 30 days.
Represents long-term workload pressure.


===============================
CUSTOMER AND MATERIAL RISK FEATURES
===============================

f_customer_miss_rate:
Historical OTIF miss rate for this customer.
Higher values indicate challenging fulfillment patterns.

f_material_miss_rate:
Historical OTIF miss rate for this material.
Higher values indicate supply chain difficulty.

f_material_orders_7d:
Material demand in last 7 days.
Higher demand increases supply pressure.

f_material_orders_30d:
Material demand in last 30 days.
Represents sustained demand pressure.

f_shipto_orders_7d:
Orders delivered to this location in last 7 days.
Indicates local logistics pressure.

f_shipto_orders_30d:
Orders delivered to this location in last 30 days.

f_bu_miss_rate:
Historical OTIF miss rate for business unit.

f_mat_shipto_miss_rate:
Miss rate for this material at this customer location.

f_plant_material_miss_rate:
Miss rate for this material at this plant.

f_plant_shipto_miss_rate:
Miss rate for plant to customer location deliveries.

f_state_miss_rate:
Historical OTIF miss rate for region.


===============================
COMBINED RISK FEATURES
===============================

f_gap_x_pressure:
Lead gap multiplied by plant workload pressure.
Higher values indicate higher execution difficulty.

f_tight_x_pressure:
Tightness combined with plant pressure.
Higher values indicate severe execution risk.

f_risk_stack:
Combined risk score from timing and plant risk.
Higher values indicate higher OTIF miss probability.

f_otif_risk_score:
Overall risk score combining multiple risk indicators.

f_gap_x_load:
Lead gap multiplied with plant workload.

f_tight_x_plant_load:
Tight order under high plant workload.

f_mat_shipto_x_pressure:
Material and customer pressure interaction.

f_strict_x_plant_miss:
Strict customer combined with weak plant performance.


===============================
QUANTITY AND DELIVERY FEATURES
===============================

Ordered_Quantity_Base_UOM:
Quantity ordered in base unit of measure.

Delivered_Quantity_in_Base_UOM:
Quantity delivered.

Overdeliv_Tolerance_OTIF:
Maximum allowed over-delivery tolerance.

Underdel_Tolerance_OTIF:
Maximum allowed under-delivery tolerance.

f_unit_price_log:
Log-transformed unit price representing commercial value.

f_qty_log:
Log-transformed ordered quantity.

f_high_qty_flag:
Flag indicating unusually large order.

f_high_value_flag:
Flag indicating high commercial value order.

f_high_value_x_tight:
High-value order with tight timeline.

f_tolerance_band:
Total allowed delivery tolerance.

f_strict_tolerance:
Customer allows minimal variation.

f_strict_x_tight:
Strict customer with tight deadline.

f_tolerance_x_gap:
Supply gap exceeding tolerance.


===============================
SEASONALITY FEATURES
===============================

f_so_woy_sin:
Seasonal pattern of sales order creation.

f_so_woy_cos:
Cyclical representation of order week.

f_rdd_woy_sin:
Seasonal pattern of requested delivery.

f_rdd_woy_cos:
Cyclical representation of delivery week.


===============================
MODEL OUTPUT FEATURES
===============================

prob_hit:
Probability that order will be delivered On-Time-In-Full.

prob_miss:
Probability that order will miss OTIF.

predicted_label:
Final model prediction.

Value = 1 → OTIF HIT
Value = 0 → OTIF MISS


===============================
SHAP EXPLANATION FEATURES
===============================

top1_feature:
Most important feature influencing prediction.

top1_value:
Value of most important feature.

top1_shap:
Impact strength of feature.

top2_feature:
Second most important feature.

top2_shap:
Impact strength of second feature.

top3_feature:
Third most important feature.

top3_shap:
Impact strength of third feature.


===============================
BUSINESS INTERPRETATION RULES
===============================

Higher OTIF success probability indicates reliable fulfillment.

Higher lead gap indicates safer fulfillment timeline.

Higher plant miss rate increases failure risk.

Extremely tight orders have highest failure risk.

Sufficient lead time and reliable plant increase OTIF success probability.

ABC A materials are usually stable and prioritized.

ABC Z materials have highest stock-out risk.

High plant pressure and tight timeline significantly increase OTIF miss probability.

"""