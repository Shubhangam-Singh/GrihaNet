"""Settings API routes."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from models import db, Settings

settings_bp = Blueprint("settings", __name__)


@settings_bp.route("/", methods=["GET"])
@jwt_required()
def get_settings():
    """Get all settings as key-value object."""
    settings = Settings.query.filter_by(user_id=1).all()
    result = {}
    for s in settings:
        # Auto-convert types
        v = s.value
        if v in ("true", "false"):
            result[s.key] = v == "true"
        else:
            try:
                result[s.key] = float(v) if "." in v else int(v)
            except ValueError:
                result[s.key] = v
    return jsonify(result)


@settings_bp.route("/", methods=["PUT"])
@jwt_required()
def update_settings():
    """Update one or more settings."""
    data = request.get_json()
    updated = []
    for key, value in data.items():
        setting = Settings.query.filter_by(user_id=1, key=key).first()
        if setting:
            setting.value = str(value).lower() if isinstance(value, bool) else str(value)
            updated.append(key)
        else:
            db.session.add(Settings(user_id=1, key=key, value=str(value)))
            updated.append(key)

    db.session.commit()
    return jsonify({"updated": updated, "message": "Settings saved"})


@settings_bp.route("/<key>", methods=["GET"])
@jwt_required()
def get_setting(key):
    """Get a single setting value."""
    setting = Settings.query.filter_by(user_id=1, key=key).first()
    if not setting:
        return jsonify({"error": f"Setting '{key}' not found"}), 404
    return jsonify({"key": setting.key, "value": setting.value})
