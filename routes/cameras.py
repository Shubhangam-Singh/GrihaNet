"""Surveillance & Security Module API routes."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from models import db, Camera, MotionEvent, Alert
from services.simulation import generate_motion_event
from datetime import datetime, timezone

cameras_bp = Blueprint("cameras", __name__)


@cameras_bp.route("/", methods=["GET"])
@jwt_required()
def get_cameras():
    """Get all cameras with status."""
    cameras = Camera.query.all()
    return jsonify([c.to_dict() for c in cameras])


@cameras_bp.route("/<int:cid>/toggle", methods=["PUT"])
@jwt_required()
def toggle_camera(cid):
    """Toggle camera active/offline."""
    camera = Camera.query.get_or_404(cid)
    camera.status = "offline" if camera.status == "active" else "active"
    db.session.commit()

    return jsonify({
        "id": camera.id, "name": camera.name,
        "status": camera.status,
        "message": f"{camera.name} is now {camera.status}",
    })


@cameras_bp.route("/motions", methods=["GET"])
@jwt_required()
def get_motion_events():
    """Get recent motion events."""
    limit = request.args.get("limit", 20, type=int)
    events = MotionEvent.query.order_by(MotionEvent.timestamp.desc()).limit(limit).all()
    return jsonify([e.to_dict() for e in events])


@cameras_bp.route("/motions/simulate", methods=["POST"])
@jwt_required()
def simulate_motion():
    """Simulate a motion event on a random active camera (for demo)."""
    active_cams = Camera.query.filter_by(status="active").all()
    if not active_cams:
        return jsonify({"error": "No active cameras"}), 400

    import random
    cam = random.choice(active_cams)
    event_data = generate_motion_event()

    motion = MotionEvent(
        camera_id=cam.id,
        event_type=event_data["type"],
        severity=event_data["severity"],
        timestamp=datetime.now(timezone.utc),
    )
    db.session.add(motion)

    # Auto-generate alert for high severity
    if event_data["severity"] == "high":
        alert = Alert(
            alert_type="warning",
            message=f"{event_data['type']} detected at {cam.name} camera",
            icon="📹", module="Security", user_id=1,
        )
        db.session.add(alert)

    db.session.commit()

    return jsonify({
        **motion.to_dict(),
        "cam": cam.name,
        "alert_generated": event_data["severity"] == "high",
    })


@cameras_bp.route("/summary", methods=["GET"])
@jwt_required()
def camera_summary():
    """Get camera module summary."""
    cameras = Camera.query.all()
    active = sum(1 for c in cameras if c.status == "active")
    total_events = MotionEvent.query.count()
    persons = MotionEvent.query.filter_by(event_type="Person").count()

    return jsonify({
        "totalCameras": len(cameras),
        "activeCameras": active,
        "totalMotionEvents": total_events,
        "personsDetected": persons,
    })
