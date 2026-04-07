"""
cameras.py
Surveillance & Security Module API routes.
"""

from flask import Blueprint, request, jsonify, current_app

from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Camera, MotionEvent, Alert
from services.simulation import generate_motion_event
from datetime import datetime, timezone
import cv2
from flask import Response
from services.vision_pipeline import VisionPipeline

cameras_bp = Blueprint("cameras", __name__)
vision = None

@cameras_bp.route("/<int:cid>/stream")
def stream_camera(cid):

    global vision

    if vision is None:
        vision = VisionPipeline(current_app._get_current_object())

    cam = Camera.query.filter_by(id=cid).first_or_404()

    if not cam.stream_url:
        return jsonify({"error": "No stream URL configured"}), 400

    user_id = cam.user_id
    camera_name = cam.name

    def generate():
        cap = cv2.VideoCapture(cam.stream_url)

        if not cap.isOpened():
            print("❌ Camera failed to open")
            return

        while True:
            success, frame = cap.read()
            if not success:
                break

            frame = cv2.resize(frame, (640, 480))

            # ✅ FIXED CALL
            frame = vision.process(
                frame,
                user_id=user_id,
                camera_name=camera_name
            )

            _, buffer = cv2.imencode(".jpg", frame)
            frame_bytes = buffer.tobytes()

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" +
                frame_bytes +
                b"\r\n"
            )

        cap.release()

    return Response(
        generate(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


@cameras_bp.route("/", methods=["GET"])
@jwt_required()
def get_cameras():
    """Get all cameras for the current user."""
    uid = get_jwt_identity()
    cameras = Camera.query.filter_by(user_id=uid).all()
    return jsonify([c.to_dict() for c in cameras])


@cameras_bp.route("/", methods=["POST"])
@jwt_required()
def add_camera():
    """Add a new camera for the current user."""
    uid = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    name     = data.get("name", "").strip()
    location = data.get("location", "").strip()
    stream_url = data.get("stream_url", "").strip()

    if not name or not location:
        return jsonify({"error": "Camera name and location are required"}), 400

    cam = Camera(name=name, location=location, stream_url=stream_url,
                 status="active", user_id=uid)
    db.session.add(cam)
    db.session.commit()
    return jsonify({"camera": cam.to_dict(), "message": f"Camera '{name}' added"}), 201


@cameras_bp.route("/<int:cid>", methods=["DELETE"])
@jwt_required()
def delete_camera(cid):
    """Delete a camera and all its motion events."""
    uid = int(get_jwt_identity())
    cam = Camera.query.filter_by(id=cid, user_id=uid).first_or_404()
    # Delete FK rows first (motion_events.camera_id NOT NULL)
    MotionEvent.query.filter_by(camera_id=cid).delete()
    db.session.delete(cam)
    db.session.commit()
    return jsonify({"message": f"Camera '{cam.name}' removed"})


@cameras_bp.route("/<int:cid>/toggle", methods=["PUT"])
@jwt_required()
def toggle_camera(cid):
    """Toggle camera active/offline."""
    uid = get_jwt_identity()
    camera = Camera.query.filter_by(id=cid, user_id=uid).first_or_404()
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
    """Simulate a motion event on a random active camera for the current user."""
    uid = get_jwt_identity()
    active_cams = Camera.query.filter_by(status="active", user_id=uid).all()
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

    # Map severity → alert type
    sev_to_type = {"high": "danger", "medium": "warning", "low": "info"}
    alert_type = sev_to_type.get(event_data["severity"], "info")

    # Always generate alert (not just for high severity)
    alert = Alert(
        alert_type=alert_type,
        message=f"{event_data['type']} detected at {cam.name} camera",
        icon="📹", module="Security", user_id=uid,
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
    """Get camera module summary for current user."""
    uid = get_jwt_identity()
    cameras = Camera.query.filter_by(user_id=uid).all()
    active = sum(1 for c in cameras if c.status == "active")
    # Motion events are global (not user-scoped), just count overall
    total_events = MotionEvent.query.count()
    persons = MotionEvent.query.filter_by(event_type="Person").count()

    return jsonify({
        "totalCameras": len(cameras),
        "activeCameras": active,
        "totalMotionEvents": total_events,
        "personsDetected": persons,
    })
