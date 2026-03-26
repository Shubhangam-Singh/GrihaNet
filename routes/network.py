"""Network Monitoring Module API routes."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from models import db, NetworkDevice, Settings
from services.simulation import generate_bandwidth_history, simulate_speed_test

network_bp = Blueprint("network", __name__)


@network_bp.route("/devices", methods=["GET"])
@jwt_required()
def get_devices():
    """Get all network devices."""
    devices = NetworkDevice.query.all()
    return jsonify([d.to_dict() for d in devices])


@network_bp.route("/devices/<int:did>/block", methods=["PUT"])
@jwt_required()
def toggle_block(did):
    """Block or unblock a device."""
    device = NetworkDevice.query.get_or_404(did)
    device.is_blocked = not device.is_blocked
    if device.is_blocked:
        device.is_online = False
    else:
        device.is_online = True
    db.session.commit()

    return jsonify({
        "id": device.id,
        "name": device.name,
        "blocked": device.is_blocked,
        "online": device.is_online,
        "message": f"{device.name} {'blocked' if device.is_blocked else 'unblocked'}",
    })


@network_bp.route("/devices/<int:did>/whitelist", methods=["PUT"])
@jwt_required()
def toggle_whitelist(did):
    """Toggle device whitelist status."""
    device = NetworkDevice.query.get_or_404(did)
    device.is_whitelisted = not device.is_whitelisted
    db.session.commit()
    return jsonify({
        "id": device.id, "whitelisted": device.is_whitelisted,
        "message": f"{device.name} {'whitelisted' if device.is_whitelisted else 'removed from whitelist'}",
    })


@network_bp.route("/bandwidth", methods=["GET"])
@jwt_required()
def bandwidth_history():
    """Get 24-hour bandwidth history."""
    data = generate_bandwidth_history()
    return jsonify(data)


@network_bp.route("/speedtest", methods=["POST"])
@jwt_required()
def speed_test():
    """Run a speed test (simulated)."""
    result = simulate_speed_test()
    return jsonify(result)


@network_bp.route("/summary", methods=["GET"])
@jwt_required()
def network_summary():
    """Get network module summary."""
    devices = NetworkDevice.query.all()
    online = [d for d in devices if d.is_online]
    blocked = [d for d in devices if d.is_blocked]
    unknown = [d for d in devices if not d.is_whitelisted]
    total_bw = round(sum(d.bandwidth_used for d in devices), 1)

    return jsonify({
        "totalDevices": len(devices),
        "onlineCount": len(online),
        "blockedCount": len(blocked),
        "unknownCount": len(unknown),
        "totalBandwidth": total_bw,
    })


@network_bp.route("/screentime", methods=["GET"])
@jwt_required()
def screen_time():
    """Get estimated screen time per device."""
    devices = NetworkDevice.query.filter_by(is_online=True).all()
    result = []
    for d in devices:
        if d.bandwidth_used > 0:
            result.append({
                "name": d.name,
                "type": d.device_type,
                "bandwidth": d.bandwidth_used,
                "estimatedHours": round(d.bandwidth_used * 0.7, 1),
            })
    return jsonify(result)
