"""
GrihaNet Database Models
Entities: User, Appliance, PowerReading, NetworkDevice, BandwidthLog,
          Camera, MotionEvent, Alert, Settings
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


# ═══════════════════════════════════════════════
# USER
# ═══════════════════════════════════════════════
class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), default="user")
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id, "email": self.email,
            "name": self.name, "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.strftime("%d %b %Y") if self.created_at else "",
        }


# ═══════════════════════════════════════════════
# POWER MODULE
# ═══════════════════════════════════════════════
class Appliance(db.Model):
    __tablename__ = "appliances"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    icon = db.Column(db.String(10), default="🔌")
    watts = db.Column(db.Integer, nullable=False)
    room = db.Column(db.String(50), nullable=False)
    is_on = db.Column(db.Boolean, default=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), default=1)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    readings = db.relationship("PowerReading", backref="appliance", lazy=True)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "icon": self.icon,
            "watts": self.watts, "room": self.room, "on": self.is_on,
        }


class PowerReading(db.Model):
    __tablename__ = "power_readings"

    id = db.Column(db.Integer, primary_key=True)
    appliance_id = db.Column(db.Integer, db.ForeignKey("appliances.id"), nullable=False)
    watts = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id, "appliance_id": self.appliance_id,
            "watts": self.watts,
            "timestamp": self.timestamp.isoformat(),
        }


# ═══════════════════════════════════════════════
# NETWORK MODULE
# ═══════════════════════════════════════════════
class NetworkDevice(db.Model):
    __tablename__ = "network_devices"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    ip = db.Column(db.String(45), nullable=False)
    mac = db.Column(db.String(17), nullable=False, unique=True)
    device_type = db.Column(db.String(20), default="unknown")  # phone, laptop, tv, gaming, unknown
    bandwidth_used = db.Column(db.Float, default=0.0)  # GB today
    is_online = db.Column(db.Boolean, default=False)
    is_whitelisted = db.Column(db.Boolean, default=True)
    is_blocked = db.Column(db.Boolean, default=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), default=1)
    last_seen = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    bandwidth_logs = db.relationship("BandwidthLog", backref="device", lazy=True)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "ip": self.ip, "mac": self.mac,
            "type": self.device_type, "bw": self.bandwidth_used,
            "online": self.is_online, "wl": self.is_whitelisted,
            "blocked": self.is_blocked,
        }


class BandwidthLog(db.Model):
    __tablename__ = "bandwidth_logs"

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey("network_devices.id"), nullable=False)
    download_mb = db.Column(db.Float, default=0.0)
    upload_mb = db.Column(db.Float, default=0.0)
    hour = db.Column(db.Integer, nullable=False)  # 0-23
    date = db.Column(db.Date, default=lambda: datetime.now(timezone.utc).date())

    def to_dict(self):
        return {
            "id": self.id, "device_id": self.device_id,
            "down": round(self.download_mb / 1024, 1),
            "up": round(self.upload_mb / 1024, 1),
            "hour": f"{self.hour:02d}:00",
        }


# ═══════════════════════════════════════════════
# SURVEILLANCE MODULE
# ═══════════════════════════════════════════════
class Camera(db.Model):
    __tablename__ = "cameras"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    location = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(20), default="active")  # active, offline
    stream_url = db.Column(db.String(255), default="")
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), default=1)

    motion_events = db.relationship("MotionEvent", backref="camera", lazy=True)

    def to_dict(self):
        events_today = MotionEvent.query.filter_by(camera_id=self.id).count()
        return {
            "id": self.id, "name": self.name, "location": self.location,
            "status": self.status, "motionEvents": events_today,
        }


class MotionEvent(db.Model):
    __tablename__ = "motion_events"

    id = db.Column(db.Integer, primary_key=True)
    camera_id = db.Column(db.Integer, db.ForeignKey("cameras.id"), nullable=False)
    event_type = db.Column(db.String(30), nullable=False)  # Person, Animal, Vehicle, Delivery, Motion
    severity = db.Column(db.String(10), default="medium")  # high, medium, low
    snapshot_path = db.Column(db.String(255), default="")
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    ICONS = {"Person": "👤", "Animal": "🐈", "Vehicle": "🚗", "Delivery": "📦", "Motion": "🔵"}

    def to_dict(self):
        return {
            "id": self.id, "cam": self.camera.name if self.camera else "",
            "type": self.event_type, "severity": self.severity,
            "img": self.ICONS.get(self.event_type, "🔵"),
            "time": self.timestamp.strftime("%H:%M:%S"),
            "timestamp": self.timestamp.isoformat(),
        }


# ═══════════════════════════════════════════════
# ALERT ENGINE
# ═══════════════════════════════════════════════
class Alert(db.Model):
    __tablename__ = "alerts"

    id = db.Column(db.Integer, primary_key=True)
    alert_type = db.Column(db.String(20), nullable=False)  # danger, warning, info, success
    message = db.Column(db.String(500), nullable=False)
    icon = db.Column(db.String(10), default="🔔")
    module = db.Column(db.String(20), nullable=False)  # Power, Network, Security
    is_read = db.Column(db.Boolean, default=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), default=1)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        from services.time_utils import time_ago
        return {
            "id": self.id, "type": self.alert_type, "msg": self.message,
            "icon": self.icon, "module": self.module, "read": self.is_read,
            "time": time_ago(self.created_at),
        }


# ═══════════════════════════════════════════════
# SETTINGS
# ═══════════════════════════════════════════════
class Settings(db.Model):
    __tablename__ = "settings"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), default=1)
    key = db.Column(db.String(50), nullable=False)
    value = db.Column(db.String(200), nullable=False)

    def to_dict(self):
        return {"key": self.key, "value": self.value}


# ═══════════════════════════════════════════════
# AUTOMATIONS
# ═══════════════════════════════════════════════
class Automation(db.Model):
    __tablename__ = "automations"

    id            = db.Column(db.Integer, primary_key=True)
    user_id       = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    name          = db.Column(db.String(100), nullable=False)
    enabled       = db.Column(db.Boolean, default=True)

    # Trigger: "power_exceeds" | "camera_detects" | "time_is" | "appliance_on"
    trigger_type   = db.Column(db.String(30), nullable=False)
    trigger_params = db.Column(db.Text, default="{}")   # JSON string

    # Action: "turn_on" | "turn_off" | "create_alert"
    action_type   = db.Column(db.String(30), nullable=False)
    action_params = db.Column(db.Text, default="{}")    # JSON string

    last_fired    = db.Column(db.DateTime, nullable=True)
    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        import json
        return {
            "id":             self.id,
            "name":           self.name,
            "enabled":        self.enabled,
            "trigger_type":   self.trigger_type,
            "trigger_params": json.loads(self.trigger_params or "{}"),
            "action_type":    self.action_type,
            "action_params":  json.loads(self.action_params or "{}"),
            "last_fired":     self.last_fired.isoformat() if self.last_fired else None,
            "created_at":     self.created_at.isoformat(),
        }

