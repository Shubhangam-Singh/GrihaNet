"""
Hardware Integration Routes — GrihaNet
Accepts real sensor data from ESP32 + STM32 hardware nodes.

Authentication: Use a static device API key in the X-Device-Key header.
Generate one and set DEVICE_API_KEY in your .env / environment.

Example .env line:
    DEVICE_API_KEY=your-secret-hardware-key-here
"""

from flask import Blueprint, request, jsonify, current_app
from functools import wraps
from models import db, Appliance, Camera, Alert, MotionEvent, Settings, PowerReading
from datetime import datetime, timezone

hardware_bp = Blueprint("hardware", __name__)


def require_device_key(f):
    """Decorator: validates X-Device-Key header against DEVICE_API_KEY in config."""
    @wraps(f)
    def decorated(*args, **kwargs):
        key = request.headers.get("X-Device-Key", "")
        expected = current_app.config.get("DEVICE_API_KEY", "")
        if not expected or key != expected:
            return jsonify({"error": "Invalid or missing device key"}), 401
        return f(*args, **kwargs)
    return decorated


# ─────────────────────────────────────────────────────────────
# POWER TELEMETRY  (called by ESP32 every N seconds)
# POST /api/hardware/telemetry
# Body: { "user_id": 1, "voltage": 231.5, "current": 2.30,
#         "power": 532.4, "energy_kwh": 0.148,
#         "power_factor": 0.97, "frequency": 50.0,
#         "appliance_id": 4 }   ← optional: which appliance is being monitored
# ─────────────────────────────────────────────────────────────
@hardware_bp.route("/telemetry", methods=["POST"])
@require_device_key
def receive_telemetry():
    data = request.get_json() or {}
    user_id = data.get("user_id", 1)

    voltage      = float(data.get("voltage", 0))
    current      = float(data.get("current", 0))
    power_w      = float(data.get("power", 0))
    energy_kwh   = float(data.get("energy_kwh", 0))
    power_factor = float(data.get("power_factor", 1.0))
    frequency    = float(data.get("frequency", 50.0))
    appliance_id = data.get("appliance_id")   # optional

    # ── Update appliance watts with real measured value ──
    if appliance_id:
        app_row = Appliance.query.filter_by(id=appliance_id, user_id=user_id).first()
        if app_row:
            app_row.watts = max(1, int(round(power_w)))
            app_row.is_on = power_w > 5  # auto-sync ON/OFF state

    # ── High usage alert ──────────────────────────────────
    threshold_s = Settings.query.filter_by(user_id=user_id, key="highUsageThreshold").first()
    threshold_kw = float(threshold_s.value) if threshold_s else 4.5
    if (power_w / 1000) > threshold_kw:
        db.session.add(Alert(
            alert_type="danger",
            message=f"Real-time power spike: {power_w:.0f}W ({power_w/1000:.2f} kW) — above {threshold_kw} kW threshold",
            icon="⚡", module="Power", user_id=user_id,
        ))

    # ── Abnormal voltage alert ─────────────────────────────
    if voltage > 0 and (voltage < 200 or voltage > 250):
        db.session.add(Alert(
            alert_type="warning",
            message=f"Voltage out of range: {voltage:.1f}V (normal: 200–250V)",
            icon="⚠️", module="Power", user_id=user_id,
        ))

    db.session.commit()

    return jsonify({
        "status": "ok",
        "received": {
            "voltage": voltage, "current": current,
            "power_w": power_w, "energy_kwh": energy_kwh,
            "power_factor": power_factor, "frequency": frequency,
        }
    })


# ─────────────────────────────────────────────────────────────
# CAMERA STREAM URL REGISTRATION
# POST /api/hardware/camera/stream
# Body: { "user_id": 1, "camera_id": 1, "stream_url": "http://192.168.1.50/stream" }
# ─────────────────────────────────────────────────────────────
@hardware_bp.route("/camera/stream", methods=["POST"])
@require_device_key
def register_camera_stream():
    data = request.get_json() or {}
    user_id    = data.get("user_id", 1)
    camera_id  = data.get("camera_id")
    stream_url = data.get("stream_url", "").strip()

    if not camera_id or not stream_url:
        return jsonify({"error": "camera_id and stream_url are required"}), 400

    cam = Camera.query.filter_by(id=camera_id, user_id=user_id).first()
    if not cam:
        return jsonify({"error": "Camera not found"}), 404

    cam.stream_url = stream_url
    cam.status = "active"
    db.session.commit()

    return jsonify({"status": "ok", "camera": cam.name, "stream_url": stream_url})


# ─────────────────────────────────────────────────────────────
# REAL MOTION EVENT  (called when ESP32-CAM / PIR detects motion)
# POST /api/hardware/motion
# Body: { "user_id": 1, "camera_id": 1, "event_type": "Person",
#         "severity": "high" }
# ─────────────────────────────────────────────────────────────
@hardware_bp.route("/motion", methods=["POST"])
@require_device_key
def receive_motion():
    data = request.get_json() or {}
    user_id    = data.get("user_id", 1)
    camera_id  = data.get("camera_id")
    event_type = data.get("event_type", "Motion")
    severity   = data.get("severity", "medium")

    cam = Camera.query.filter_by(id=camera_id, user_id=user_id).first()
    if not cam:
        return jsonify({"error": "Camera not found"}), 404

    motion = MotionEvent(
        camera_id=camera_id,
        event_type=event_type,
        severity=severity,
        timestamp=datetime.now(timezone.utc),
    )
    db.session.add(motion)

    if severity == "high":
        db.session.add(Alert(
            alert_type="warning",
            message=f"{event_type} detected at {cam.name} (hardware trigger)",
            icon="📹", module="Security", user_id=user_id,
        ))

    db.session.commit()

    ICONS = {"Person": "👤", "Animal": "🐈", "Vehicle": "🚗", "Delivery": "📦", "Motion": "🔵"}
    return jsonify({
        "status": "ok",
        "cam": cam.name,
        "type": event_type,
        "severity": severity,
        "img": ICONS.get(event_type, "🔵"),
        "time": datetime.now(timezone.utc).strftime("%H:%M:%S"),
        "alert_generated": severity == "high",
    })


# ─────────────────────────────────────────────────────────────
# PING  (health check from device)
# GET /api/hardware/ping
# ─────────────────────────────────────────────────────────────
@hardware_bp.route("/ping", methods=["GET"])
@require_device_key
def ping():
    return jsonify({"status": "ok", "server_time": datetime.now(timezone.utc).isoformat()})
