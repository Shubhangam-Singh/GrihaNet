"""Authentication routes — login, register, me, logout."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, jwt_required, get_jwt_identity
)
from models import db, User

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401

    if not user.is_active:
        return jsonify({"error": "Your account has been deactivated. Contact the administrator."}), 403

    token = create_access_token(identity=str(user.id))
    return jsonify({
        "token": token,
        "user": user.to_dict(),
        "message": "Login successful",
    })


@auth_bp.route("/register", methods=["POST"])
def register():
    from seed import seed_for_user

    data = request.get_json() or {}
    name            = data.get("name", "").strip()
    email           = data.get("email", "").strip().lower()
    password        = data.get("password", "")
    confirm_password = data.get("confirm_password", "")

    # ── Validation ──────────────────────────────────────
    if not name or not email or not password:
        return jsonify({"error": "Name, email, and password are required"}), 400

    if len(name) < 2:
        return jsonify({"error": "Name must be at least 2 characters"}), 400

    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "Please enter a valid email address"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    if password != confirm_password:
        return jsonify({"error": "Passwords do not match"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with this email already exists"}), 409

    # ── Create user ─────────────────────────────────────
    user = User(email=email, name=name, role="user")
    user.set_password(password)          # bcrypt hash via werkzeug
    db.session.add(user)
    db.session.commit()

    # Seed fresh demo data for this new user
    seed_for_user(user.id)

    token = create_access_token(identity=str(user.id))
    return jsonify({
        "token": token,
        "user": user.to_dict(),
        "message": f"Welcome to GrihaNet, {name}!",
    }), 201


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"user": user.to_dict()})


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    return jsonify({"message": "Logged out successfully"})
