"""
Simulation service — generates realistic data for demo/testing.
Used when actual IoT hardware is not connected.
"""

import random
import math
from datetime import datetime, timezone


def generate_power_history_24h():
    """Generate realistic 24-hour power consumption data."""
    data = []
    for h in range(24):
        # Base load (fridge, router, standby)
        base = 0.4 + random.uniform(0, 0.15)
        # Morning peak (6-9 AM): geyser, lights
        morning = 1.2 * max(0, 1 - abs(h - 7.5) / 2.5) if 5 <= h <= 10 else 0
        # Afternoon (12-3 PM): AC, cooking
        afternoon = 0.8 * max(0, 1 - abs(h - 13.5) / 2) if 11 <= h <= 16 else 0
        # Evening peak (6-10 PM): AC, TV, lights, cooking
        evening = 2.0 * max(0, 1 - abs(h - 20) / 3) if 17 <= h <= 23 else 0
        # Night (11 PM - 5 AM): low
        night = 0.1 if h >= 23 or h <= 5 else 0

        kw = base + morning + afternoon + evening + night + random.uniform(-0.15, 0.15)
        data.append({"hour": f"{h:02d}:00", "kw": round(max(0.2, kw), 2)})
    return data


def generate_weekly_data():
    """Generate 7-day consumption and cost data."""
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return [
        {
            "day": d,
            "kwh": round(8 + random.uniform(0, 14), 1),
            "cost": round(50 + random.uniform(0, 90), 0),
        }
        for d in days
    ]


def generate_bandwidth_history():
    """Generate 24-hour bandwidth data."""
    data = []
    for h in range(24):
        # Higher bandwidth in evening (streaming, gaming)
        peak = 1.5 if 19 <= h <= 23 else 0.5 if 8 <= h <= 18 else 0.2
        data.append({
            "hour": f"{h:02d}:00",
            "down": round(random.uniform(2, 15) * peak + 3, 1),
            "up": round(random.uniform(0.5, 4) * peak + 0.5, 1),
        })
    return data


def simulate_speed_test():
    """Simulate an internet speed test result."""
    return {
        "download": round(60 + random.uniform(0, 40), 1),
        "upload": round(25 + random.uniform(0, 25), 1),
        "ping": round(5 + random.uniform(0, 20), 0),
        "jitter": round(1 + random.uniform(0, 5), 1),
    }


def generate_motion_event():
    """Generate a random motion detection event."""
    types = [
        {"type": "Person", "severity": "high", "img": "👤"},
        {"type": "Motion", "severity": "medium", "img": "🔵"},
        {"type": "Animal", "severity": "low", "img": "🐈"},
        {"type": "Delivery", "severity": "medium", "img": "📦"},
        {"type": "Vehicle", "severity": "low", "img": "🚗"},
    ]
    event = random.choice(types)
    event["time"] = datetime.now(timezone.utc).strftime("%H:%M:%S")
    return event


def get_energy_recommendations(appliances, rate=6.5):
    """Generate contextual energy-saving recommendations."""
    recs = []
    on_appliances = [a for a in appliances if a.is_on]
    total_watts = sum(a.watts for a in on_appliances)

    # Check for high-watt appliances
    for a in on_appliances:
        if a.watts >= 1500:
            cost_per_hr = (a.watts / 1000) * rate
            recs.append({
                "tip": f"{a.name} is consuming {a.watts}W (₹{cost_per_hr:.0f}/hr). Turn it off if not needed.",
                "severity": "high",
            })

    # General tips
    if total_watts > 3000:
        recs.append({
            "tip": f"Current draw is {total_watts}W. Consider turning off non-essential appliances.",
            "severity": "high",
        })

    recs.append({
        "tip": "Setting AC to 26°C instead of 24°C saves approximately 20% electricity.",
        "severity": "medium",
    })
    recs.append({
        "tip": "Off-peak hours (10 PM – 6 AM) may have lower tariffs. Schedule heavy appliances accordingly.",
        "severity": "low",
    })

    return recs
