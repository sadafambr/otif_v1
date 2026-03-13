import requests
import json

API_BASE = "http://localhost:8000"

def test_order_summary():
    payload = {
        "salesOrder": "123456",
        "customer": "Test Customer",
        "material": "Test Material",
        "plant": "Test Plant",
        "reqDelivery": "2024-03-20",
        "leadTime": "5",
        "status": "Miss",
        "probMiss": 85.5,
        "top1Feature": "f_lead_gap_days",
        "top1Value": "2",
        "top1Shap": 3.5
    }
    
    print(f"Testing /orders/summary with payload: {json.dumps(payload, indent=2)}")
    try:
        res = requests.post(f"{API_BASE}/orders/summary", json=payload)
        res.raise_for_status()
        data = res.json()
        print("\nResponse:")
        print(json.dumps(data, indent=2))
        
        assert data["prediction"] == "Miss"
        assert abs(data["probMiss"] - 85.5) < 0.1
        assert any(d["name"] == "Lead Time Gap" for d in data["riskDrivers"])
        print("\nTest passed!")
    except Exception as e:
        print(f"\nTest failed: {e}")

if __name__ == "__main__":
    test_order_summary()
