"""Seed database with initial demo data."""

from models import db, User, Appliance, NetworkDevice, Camera, Alert, Settings
from datetime import datetime, timezone, timedelta


def seed_for_user(user_id):
    """Seed all demo data for a given user_id (appliances, devices, cameras, etc.)"""

    # ─── Appliances ───
    if Appliance.query.filter_by(user_id=user_id).count() == 0:
        appliances = [
            ("Split AC — Bedroom", "❄️", 1480, "Bedroom", True),
            ("Refrigerator", "🧊", 185, "Kitchen", True),
            ("Washing Machine", "👔", 520, "Bathroom", False),
            ("Geyser", "🔥", 2000, "Bathroom", True),
            ("LED TV 55″", "📺", 120, "Living Room", True),
            ("Ceiling Fans (×4)", "💨", 300, "All Rooms", True),
            ("Tube Lights (×6)", "💡", 216, "All Rooms", True),
            ("Wi-Fi Router", "📡", 12, "Living Room", True),
            ("Laptop Charger", "💻", 65, "Bedroom", True),
            ("Mixer Grinder", "🍹", 750, "Kitchen", False),
        ]
        for name, icon, watts, room, is_on in appliances:
            db.session.add(Appliance(
                name=name, icon=icon, watts=watts, room=room, is_on=is_on, user_id=user_id
            ))
        db.session.commit()

    # ─── Network Devices ───
    import random, string
    if NetworkDevice.query.filter_by(user_id=user_id).count() == 0:
        # Generate unique MACs per user by appending user_id
        def mac(base):
            return base[:-2] + f"{user_id:02X}"

        devices = [
            ("Arishem's iPhone", "192.168.1.4",  mac("A4:B1:C2:3D:E5:F6"), "phone",   2.4,  True,  True,  False),
            ("Dad's Laptop",     "192.168.1.7",  mac("F6:G7:H8:I9:J0:K1"), "laptop",  5.8,  True,  True,  False),
            ("Smart TV",         "192.168.1.10", mac("K1:L2:M3:N4:O5:P6"), "tv",      14.2, True,  True,  False),
            ("Mom's Phone",      "192.168.1.12", mac("P6:Q7:R8:S9:T0:U1"), "phone",   1.3,  True,  True,  False),
            ("PS5",              "192.168.1.15", mac("U1:V2:W3:X4:Y5:Z6"), "gaming",  0.0,  False, True,  False),
            ("Unknown Device",   "192.168.1.22", mac("Z6:A7:B8:C9:D0:E1"), "unknown", 0.8,  True,  False, False),
        ]
        for name, ip, m, dtype, bw, online, wl, blocked in devices:
            db.session.add(NetworkDevice(
                name=name, ip=ip, mac=m, device_type=dtype,
                bandwidth_used=bw, is_online=online,
                is_whitelisted=wl, is_blocked=blocked, user_id=user_id,
            ))
        db.session.commit()

    # ─── Cameras ───
    if Camera.query.filter_by(user_id=user_id).count() == 0:
        cams = [
            ("Front Door",  "Main Entrance", "active"),
            ("Backyard",    "Garden Area",   "active"),
            ("Garage",      "Parking",       "active"),
            ("Living Room", "Indoor",        "offline"),
        ]
        for name, loc, status in cams:
            db.session.add(Camera(name=name, location=loc, status=status, user_id=user_id))
        db.session.commit()

    # ─── Alerts ───
    if Alert.query.filter_by(user_id=user_id).count() == 0:
        now = datetime.now(timezone.utc)
        alerts = [
            ("danger",  "Geyser has been running continuously for 2+ hours",   "⚡", "Power",    False, now - timedelta(minutes=3)),
            ("warning", "Unknown device connected — MAC: Z6:A7:B8:C9:D0:E1",   "🌐", "Network",  False, now - timedelta(minutes=12)),
            ("info",    "Person detected at Front Door camera",                  "📹", "Security", False, now - timedelta(minutes=18)),
            ("success", "Today's energy usage is 11% lower than yesterday",     "✅", "Power",    True,  now - timedelta(hours=1)),
            ("warning", "Smart TV consumed 14.2 GB bandwidth today",            "📺", "Network",  True,  now - timedelta(hours=2)),
        ]
        for atype, msg, icon, module, read, created in alerts:
            db.session.add(Alert(
                alert_type=atype, message=msg, icon=icon,
                module=module, is_read=read, user_id=user_id, created_at=created,
            ))
        db.session.commit()

    # ─── Settings ───
    if Settings.query.filter_by(user_id=user_id).count() == 0:
        defaults = {
            "darkMode": "true", "autoRefresh": "true", "pushNotifications": "true",
            "soundAlerts": "false", "simulationMode": "true",
            "rate": "6.5", "highUsageThreshold": "4.5",
            "runtimeAlert": "2", "monthlyBudget": "2500",
            "autoBlockUnknown": "false", "bandwidthAlert": "true",
            "bandwidthThreshold": "10", "parentalControls": "false",
            "motionSensitivity": "High",
            "alertHoursStart": "23:00", "alertHoursEnd": "06:00",
            "snapshotOnMotion": "true", "recordClips": "false",
        }
        for k, v in defaults.items():
            db.session.add(Settings(user_id=user_id, key=k, value=v))
        db.session.commit()


def seed_database():
    """Populate tables if empty — seeds the default admin user + their data."""

    if User.query.count() == 0:
        admin = User(email="admin@grihanet.com", name="Admin", role="admin")
        admin.set_password("password123")
        db.session.add(admin)
        db.session.commit()

    # Seed data for admin (user_id=1)
    seed_for_user(1)

    print("  ✅ Database seeded successfully.")
