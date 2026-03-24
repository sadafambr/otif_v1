import requests
import sys

def run_smoke_test():
    """
    Basic smoke test to ensure the FastAPI backend is responsive.
    Assumes the server is running locally on port 8000.
    """
    url = "http://localhost:8000/admin/data/status"
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            print("✅ Backend Smoke Test Passed: Server is responsive and data status retrieved.")
            sys.exit(0)
        else:
            print(f"❌ Backend Smoke Test Failed: Received unexpected status code {response.status_code}.")
            sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"❌ Backend Smoke Test Failed: Could not connect to the server. Is it running on port 8000? Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_smoke_test()
