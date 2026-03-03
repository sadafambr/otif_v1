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


===============================
CUSTOMER AND MATERIAL RISK FEATURES
===============================

Customer Name:
Customer placing the order.

f_customer_miss_rate:
Historical OTIF miss rate for this customer.
Higher values indicate challenging fulfillment patterns.

Material:
Product identifier.

Material description:
Description of product.

f_material_miss_rate:
Historical OTIF miss rate for this material.
Higher values indicate supply chain difficulty.


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


===============================
MODEL OUTPUT FEATURES
===============================

prob_hit:
Probability that order will be delivered On-Time-In-Full.

prob_miss:
Probability that order will miss OTIF.

predicted_label:
Final model prediction.

Value = 1 → OTIF HIT (successful delivery expected)
Value = 0 → OTIF MISS (delivery failure risk)


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

top3_feature:
Third most important feature.


===============================
BUSINESS INTERPRETATION RULES
===============================

Higher OTIF success probability indicates reliable fulfillment.

Higher lead gap indicates safer fulfillment timeline.

Higher plant miss rate increases failure risk.

Extremely tight orders have highest failure risk.

Sufficient lead time and reliable plant increase OTIF success probability.

"""