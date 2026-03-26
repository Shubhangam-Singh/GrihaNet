"""Alert Engine API routes."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from models import db, Alert

alerts_bp = Blueprint("alerts", __name__)


@alerts_bp.route("/", methods=["GET"])
@jwt_required()
def get_alerts():
    """Get all alerts, newest first."""
    alerts = Alert.query.order_by(Alert.created_at.desc()).all()
    return jsonify({
        "alerts": [a.to_dict() for a in alerts],
        "unread": sum(1 for a in alerts if not a.is_read),
        "total": len(alerts),
    })


@alerts_bp.route("/<int:aid>/dismiss", methods=["PUT"])
@jwt_required()
def dismiss_alert(aid):
    """Mark an alert as read."""
    alert = Alert.query.get_or_404(aid)
    alert.is_read = True
    db.session.commit()
    return jsonify({"id": aid, "read": True, "message": "Alert dismissed"})


@alerts_bp.route("/read-all", methods=["PUT"])
@jwt_required()
def read_all():
    """Mark all alerts as read."""
    Alert.query.filter_by(is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"message": "All alerts marked as read"})


@alerts_bp.route("/clear-read", methods=["DELETE"])
@jwt_required()
def clear_read():
    """Delete all read alerts."""
    Alert.query.filter_by(is_read=True).delete()
    db.session.commit()
    return jsonify({"message": "Read alerts cleared"})


@alerts_bp.route("/create", methods=["POST"])
@jwt_required()
def create_alert():
    """Create a new alert (used by internal services)."""
    data = request.get_json()
    alert = Alert(
        alert_type=data.get("type", "info"),
        message=data.get("message", ""),
        icon=data.get("icon", "🔔"),
        module=data.get("module", "System"),
        user_id=1,
    )
    db.session.add(alert)
    db.session.commit()
    return jsonify(alert.to_dict()), 201
