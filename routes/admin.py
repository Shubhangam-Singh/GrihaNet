"""Admin-only API routes — user management, platform stats."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from functools import wraps
from models import db, User, Appliance, NetworkDevice, Camera, Alert, Automation, Settings
from seed import seed_for_user

admin_bp = Blueprint("admin", __name__)


# ─── Decorator: JWT required + admin role check ───────────────────────────────
def admin_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        uid = int(get_jwt_identity())
        caller = User.query.get(uid)
        if not caller or caller.role != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, caller=caller, **kwargs)
    return wrapper


# ─── Helper: aggregate stats for one user ─────────────────────────────────────
def _user_stats(user):
    return {
        "appliances": Appliance.query.filter_by(user_id=user.id).count(),
        "cameras":    Camera.query.filter_by(user_id=user.id).count(),
        "devices":    NetworkDevice.query.filter_by(user_id=user.id).count(),
        "alerts":     Alert.query.filter_by(user_id=user.id).count(),
        "automations":Automation.query.filter_by(user_id=user.id).count(),
    }


# ═══ GET /api/admin/users — list all users ════════════════════════════════════
@admin_bp.route("/users", methods=["GET"])
@admin_required
def list_users(caller):
    users = User.query.order_by(User.created_at).all()
    result = []
    for u in users:
        d = u.to_dict()
        d["stats"] = _user_stats(u)
        result.append(d)
    return jsonify({"users": result, "total": len(result)})


# ═══ POST /api/admin/users — add new member ═══════════════════════════════════
@admin_bp.route("/users", methods=["POST"])
@admin_required
def add_member(caller):
    data = request.get_json() or {}
    name     = data.get("name", "").strip()
    email    = data.get("email", "").strip().lower()
    password = data.get("password", "")
    role     = data.get("role", "user")

    if not name or not email or not password:
        return jsonify({"error": "Name, email, and password are required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if role not in ("admin", "user"):
        return jsonify({"error": "Role must be 'admin' or 'user'"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with this email already exists"}), 409

    new_user = User(email=email, name=name, role=role)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()
    seed_for_user(new_user.id)

    d = new_user.to_dict()
    d["stats"] = _user_stats(new_user)
    return jsonify({"user": d, "message": f"Member '{name}' created successfully"}), 201


# ═══ DELETE /api/admin/users/<id> ═════════════════════════════════════════════
@admin_bp.route("/users/<int:uid>", methods=["DELETE"])
@admin_required
def delete_member(caller, uid):
    if uid == caller.id:
        return jsonify({"error": "You cannot delete your own account"}), 400
    if uid == 1:
        return jsonify({"error": "The GrihaNet super admin account cannot be deleted"}), 403

    target = User.query.get_or_404(uid)

    # Cascade delete all user data in the correct FK-safe order
    Automation.query.filter_by(user_id=uid).delete()
    Alert.query.filter_by(user_id=uid).delete()
    # Delete motion_events before cameras (camera_id FK is NOT NULL)
    from models import MotionEvent
    for cam in Camera.query.filter_by(user_id=uid).all():
        MotionEvent.query.filter_by(camera_id=cam.id).delete()
        db.session.delete(cam)
    # Delete network devices
    NetworkDevice.query.filter_by(user_id=uid).delete()
    Appliance.query.filter_by(user_id=uid).delete()
    Settings.query.filter_by(user_id=uid).delete()
    db.session.delete(target)
    db.session.commit()

    return jsonify({"message": f"User '{target.name}' deleted successfully"})


# ═══ PUT /api/admin/users/<id>/role — promote / demote ═══════════════════════
@admin_bp.route("/users/<int:uid>/role", methods=["PUT"])
@admin_required
def change_role(caller, uid):
    if uid == caller.id:
        return jsonify({"error": "You cannot change your own role"}), 400
    if uid == 1:
        return jsonify({"error": "The GrihaNet super admin role cannot be changed"}), 403

    target = User.query.get_or_404(uid)
    data = request.get_json(silent=True) or {}  # silent=True: empty body → {} instead of 400
    new_role = data.get("role")

    if new_role not in ("admin", "user"):
        # If no explicit role given, toggle
        new_role = "admin" if target.role == "user" else "user"

    target.role = new_role
    db.session.commit()
    return jsonify({"user": target.to_dict(), "message": f"{target.name} is now {new_role}"})


# ═══ PUT /api/admin/users/<id>/password — reset password ══════════════════════
@admin_bp.route("/users/<int:uid>/password", methods=["PUT"])
@admin_required
def reset_password(caller, uid):
    target = User.query.get_or_404(uid)
    data = request.get_json() or {}
    new_password = data.get("password", "")

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400

    target.set_password(new_password)
    db.session.commit()
    return jsonify({"message": f"Password reset successfully for {target.name}"})


# ═══ PUT /api/admin/users/<id>/active — activate / deactivate ════════════════
@admin_bp.route("/users/<int:uid>/active", methods=["PUT"])
@admin_required
def toggle_active(caller, uid):
    if uid == caller.id:
        return jsonify({"error": "You cannot deactivate your own account"}), 400
    if uid == 1:
        return jsonify({"error": "The GrihaNet super admin account cannot be deactivated"}), 403

    target = User.query.get_or_404(uid)
    target.is_active = not target.is_active
    db.session.commit()
    status = "activated" if target.is_active else "deactivated"
    return jsonify({"user": target.to_dict(), "message": f"{target.name} {status}"})


# ═══ GET /api/admin/stats — platform-wide ════════════════════════════════════
@admin_bp.route("/stats", methods=["GET"])
@admin_required
def platform_stats(caller):
    return jsonify({
        "total_users":       User.query.count(),
        "active_users":      User.query.filter_by(is_active=True).count(),
        "admin_count":       User.query.filter_by(role="admin").count(),
        "total_appliances":  Appliance.query.count(),
        "total_cameras":     Camera.query.count(),
        "total_devices":     NetworkDevice.query.count(),
        "total_alerts":      Alert.query.count(),
        "total_automations": Automation.query.count(),
    })
