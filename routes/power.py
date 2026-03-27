"""Power Monitoring Module API routes."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Appliance, PowerReading, Settings
from services.simulation import (
    generate_power_history_24h, generate_weekly_data, get_energy_recommendations
)

power_bp = Blueprint("power", __name__)


def _user_rate(uid):
    s = Settings.query.filter_by(user_id=uid, key="rate").first()
    return float(s.value) if s else 6.5


@power_bp.route("/live", methods=["GET"])
@jwt_required()
def live_power():
    """Get current live power draw from all ON appliances for current user."""
    uid = get_jwt_identity()
    appliances = Appliance.query.filter_by(user_id=uid, is_on=True).all()
    total_watts = sum(a.watts for a in appliances)
    rate = _user_rate(uid)

    return jsonify({
        "totalWatts": total_watts,
        "totalKw": round(total_watts / 1000, 2),
        "activeCount": len(appliances),
        "costPerHour": round((total_watts / 1000) * rate, 2),
        "rate": rate,
    })


@power_bp.route("/appliances", methods=["GET"])
@jwt_required()
def get_appliances():
    """Get all registered appliances for current user."""
    uid = get_jwt_identity()
    appliances = Appliance.query.filter_by(user_id=uid).all()
    rate = _user_rate(uid)

    result = []
    for a in appliances:
        d = a.to_dict()
        d["costPerHour"] = round((a.watts / 1000) * rate, 1) if a.is_on else 0
        result.append(d)
    return jsonify(result)


@power_bp.route("/appliances/<int:aid>/toggle", methods=["PUT"])
@jwt_required()
def toggle_appliance(aid):
    """Toggle an appliance on/off (must belong to current user)."""
    uid = get_jwt_identity()
    appliance = Appliance.query.filter_by(id=aid, user_id=uid).first_or_404()
    appliance.is_on = not appliance.is_on
    db.session.commit()

    return jsonify({
        "id": appliance.id,
        "name": appliance.name,
        "on": appliance.is_on,
        "watts": appliance.watts,
        "message": f"{appliance.name} turned {'ON' if appliance.is_on else 'OFF'}",
    })


@power_bp.route("/history", methods=["GET"])
@jwt_required()
def power_history():
    """Get 24-hour power consumption history."""
    data = generate_power_history_24h()
    return jsonify(data)


@power_bp.route("/weekly", methods=["GET"])
@jwt_required()
def weekly_data():
    """Get 7-day consumption and cost breakdown."""
    data = generate_weekly_data()
    return jsonify(data)


@power_bp.route("/rooms", methods=["GET"])
@jwt_required()
def room_breakdown():
    """Get power consumption grouped by room for current user."""
    uid = get_jwt_identity()
    appliances = Appliance.query.filter_by(user_id=uid, is_on=True).all()
    rooms = {}
    for a in appliances:
        rooms[a.room] = rooms.get(a.room, 0) + a.watts

    colors = {
        "Bedroom": "#3391ff", "Kitchen": "#ff8c42",
        "Living Room": "#a855f7", "Bathroom": "#06d6a0",
        "All Rooms": "#00e5a0",
    }
    result = [
        {"name": room, "value": watts, "color": colors.get(room, "#888")}
        for room, watts in rooms.items() if watts > 0
    ]
    return jsonify(result)


@power_bp.route("/recommendations", methods=["GET"])
@jwt_required()
def recommendations():
    """Get energy-saving recommendations for current user."""
    uid = get_jwt_identity()
    appliances = Appliance.query.filter_by(user_id=uid).all()
    rate = _user_rate(uid)
    recs = get_energy_recommendations(appliances, rate)
    return jsonify(recs)


@power_bp.route("/summary", methods=["GET"])
@jwt_required()
def power_summary():
    """Get power module summary for current user."""
    uid = get_jwt_identity()
    appliances = Appliance.query.filter_by(user_id=uid).all()
    on_apps = [a for a in appliances if a.is_on]
    total_watts = sum(a.watts for a in on_apps)
    history = generate_power_history_24h()
    total_kwh = round(sum(h["kw"] for h in history), 1)

    rate = _user_rate(uid)
    budget_s = Settings.query.filter_by(user_id=uid, key="monthlyBudget").first()
    budget = float(budget_s.value) if budget_s else 2500

    today_cost = round(total_kwh * rate, 0)
    monthly_est = today_cost * 30

    return jsonify({
        "liveWatts": total_watts,
        "liveKw": round(total_watts / 1000, 2),
        "todayKwh": total_kwh,
        "todayCost": today_cost,
        "monthlyEstimate": monthly_est,
        "monthlyBudget": budget,
        "overBudget": monthly_est > budget,
        "activeAppliances": len(on_apps),
        "totalAppliances": len(appliances),
        "peakKw": max(h["kw"] for h in history),
        "rate": rate,
    })
