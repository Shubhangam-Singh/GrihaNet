"""Network Monitoring Module API routes."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, NetworkDevice, Settings
from services.simulation import generate_bandwidth_history, simulate_speed_test

network_bp = Blueprint("network", __name__)


@network_bp.route("/devices", methods=["GET"])
@jwt_required()
def get_devices():
    """Get all network devices for current user."""
    uid = get_jwt_identity()
    devices = NetworkDevice.query.filter_by(user_id=uid).all()
    return jsonify([d.to_dict() for d in devices])


@network_bp.route("/devices/<int:did>/block", methods=["PUT"])
@jwt_required()
def toggle_block(did):
    """Block or unblock a device (must belong to current user)."""
    uid = get_jwt_identity()
    device = NetworkDevice.query.filter_by(id=did, user_id=uid).first_or_404()
    device.is_blocked = not device.is_blocked
    device.is_online = not device.is_blocked
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
    uid = get_jwt_identity()
    device = NetworkDevice.query.filter_by(id=did, user_id=uid).first_or_404()
    device.is_whitelisted = not device.is_whitelisted
    db.session.commit()
    return jsonify({
        "id": device.id, "whitelisted": device.is_whitelisted,
        "message": f"{device.name} {'whitelisted' if device.is_whitelisted else 'removed from whitelist'}",
    })


@network_bp.route("/devices/<int:did>/screentime", methods=["PUT"])
@jwt_required()
def update_screentime_limit(did):
    """Set screen time limit for a device."""
    uid = get_jwt_identity()
    device = NetworkDevice.query.filter_by(id=did, user_id=uid).first_or_404()
    data = request.get_json()
    val = data.get("daily_limit_hours")
    device.daily_limit_hours = float(val) if val else None
    db.session.commit()
    return jsonify({"message": "Screen time limit updated", "daily_limit_hours": device.daily_limit_hours})


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
    """Get network module summary for current user."""
    uid = get_jwt_identity()
    devices = NetworkDevice.query.filter_by(user_id=uid).all()
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
    """Get estimated screen time per device for current user."""
    uid = get_jwt_identity()
    devices = NetworkDevice.query.filter_by(user_id=uid, is_online=True).all()
    
    pc_setting = Settings.query.filter_by(user_id=uid, key="parentalControls").first()
    pc_enabled = (pc_setting and pc_setting.value == "true")

    result = []
    for d in devices:
        if d.bandwidth_used > 0:
            est_hours = round(d.bandwidth_used * 0.7, 1)
            limit_exceeded = False
            if pc_enabled and d.daily_limit_hours:
                if est_hours > d.daily_limit_hours:
                    limit_exceeded = True

            result.append({
                "id": d.id,
                "name": d.name,
                "type": d.device_type,
                "bandwidth": d.bandwidth_used,
                "estimatedHours": est_hours,
                "daily_limit_hours": d.daily_limit_hours if pc_enabled else None,
                "limit_exceeded": limit_exceeded
            })
    return jsonify(result)


@network_bp.route("/parental/block-exceeded", methods=["POST"])
@jwt_required()
def block_exceeded():
    """Block devices exceeding limits, mapped to user."""
    from models import Alert
    uid = get_jwt_identity()
    pc_setting = Settings.query.filter_by(user_id=uid, key="parentalControls").first()
    if not pc_setting or pc_setting.value != "true":
        return jsonify({"blocked": []})

    devices = NetworkDevice.query.filter_by(user_id=uid, is_online=True).all()
    blocked_names = []
    
    for d in devices:
        if d.daily_limit_hours and not d.is_blocked:
            est_hours = d.bandwidth_used * 0.7
            if est_hours > d.daily_limit_hours:
                d.is_blocked = True
                d.is_online = False
                db.session.add(Alert(
                    alert_type="danger",
                    message=f"Parental Controls: {d.name} blocked — daily screen time limit reached.",
                    icon="🧒", module="Network", user_id=uid
                ))
                blocked_names.append(d.name)
    
    db.session.commit()
    return jsonify({"blocked": blocked_names})
