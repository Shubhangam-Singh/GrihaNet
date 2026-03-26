"""Automation routes — CRUD for IFTTT-style rules."""

import json
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Automation

automations_bp = Blueprint("automations", __name__)

VALID_TRIGGERS = ("power_exceeds", "camera_detects", "time_is", "appliance_on")
VALID_ACTIONS  = ("turn_on", "turn_off", "create_alert")


def _get_user_automation(auto_id, user_id):
    return Automation.query.filter_by(id=auto_id, user_id=user_id).first()


@automations_bp.route("/", methods=["GET"])
@jwt_required()
def list_automations():
    uid = int(get_jwt_identity())
    rules = Automation.query.filter_by(user_id=uid).order_by(Automation.created_at.desc()).all()
    return jsonify({"automations": [r.to_dict() for r in rules]})


@automations_bp.route("/", methods=["POST"])
@jwt_required()
def create_automation():
    uid  = int(get_jwt_identity())
    data = request.get_json() or {}

    name          = (data.get("name") or "").strip()
    trigger_type  = data.get("trigger_type", "")
    trigger_params = data.get("trigger_params", {})
    action_type   = data.get("action_type", "")
    action_params  = data.get("action_params", {})

    if not name:
        return jsonify({"error": "Rule name is required"}), 400
    if trigger_type not in VALID_TRIGGERS:
        return jsonify({"error": f"Invalid trigger_type: {trigger_type}"}), 400
    if action_type not in VALID_ACTIONS:
        return jsonify({"error": f"Invalid action_type: {action_type}"}), 400

    rule = Automation(
        user_id=uid, name=name,
        trigger_type=trigger_type,
        trigger_params=json.dumps(trigger_params),
        action_type=action_type,
        action_params=json.dumps(action_params),
    )
    db.session.add(rule)
    db.session.commit()
    return jsonify({"automation": rule.to_dict(), "message": "Automation created"}), 201


@automations_bp.route("/<int:auto_id>", methods=["PUT"])
@jwt_required()
def update_automation(auto_id):
    uid  = int(get_jwt_identity())
    rule = _get_user_automation(auto_id, uid)
    if not rule:
        return jsonify({"error": "Automation not found"}), 404

    data = request.get_json() or {}
    if "name" in data:
        rule.name = data["name"].strip() or rule.name
    if "enabled" in data:
        rule.enabled = bool(data["enabled"])
    if "trigger_type" in data and data["trigger_type"] in VALID_TRIGGERS:
        rule.trigger_type = data["trigger_type"]
    if "trigger_params" in data:
        rule.trigger_params = json.dumps(data["trigger_params"])
    if "action_type" in data and data["action_type"] in VALID_ACTIONS:
        rule.action_type = data["action_type"]
    if "action_params" in data:
        rule.action_params = json.dumps(data["action_params"])

    db.session.commit()
    return jsonify({"automation": rule.to_dict()})


@automations_bp.route("/<int:auto_id>", methods=["DELETE"])
@jwt_required()
def delete_automation(auto_id):
    uid  = int(get_jwt_identity())
    rule = _get_user_automation(auto_id, uid)
    if not rule:
        return jsonify({"error": "Automation not found"}), 404
    db.session.delete(rule)
    db.session.commit()
    return jsonify({"message": "Automation deleted"})
