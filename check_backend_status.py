import requests
import sys

try:
    print("Testing connection to http://127.0.0.1:8000/analytics/marketing/ ...")
    response = requests.get('http://127.0.0.1:8000/analytics/marketing/', timeout=5)
    print(f"Status Code: {response.status_code}")
    print("Response Headers:", response.headers)
    print("Response Content Preview:")
    print(response.text[:2000])
except Exception as e:
    print(f"Connection Failed: {e}")
