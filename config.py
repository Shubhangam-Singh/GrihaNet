"""
app.py
Application configuration.
"""

import os
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

# Detect read-only filesystem (Vercel serverless) by attempting a write
def _is_readonly_fs():
    try:
        test = os.path.join(BASE_DIR, ".writable_test")
        with open(test, "w") as f:
            f.write("test")
        os.remove(test)
        return False
    except OSError:
        return True

_SERVERLESS = os.environ.get("VERCEL") or _is_readonly_fs()


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "grihanet-secret-key-2026")
    _db_path = "/tmp/grihanet.db" if _SERVERLESS else os.path.join(BASE_DIR, "grihanet.db")
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", f"sqlite:///{_db_path}")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "grihanet-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_TOKEN_LOCATION = ["headers", "cookies"]
    JWT_COOKIE_SECURE = False  # Set True in production

    # App settings
    RATE_PER_KWH = 6.5
    HIGH_USAGE_THRESHOLD = 4.5  # kW
    MONTHLY_BUDGET = 2500  # INR

    # Hardware device API key — set this in your .env file
    # ESP32 must send: X-Device-Key: <this value>
    DEVICE_API_KEY = os.environ.get("DEVICE_API_KEY", "grihanet-hw-key-change-me")
