"""
GrihaNet — Unified Smart Home Monitoring System
Main Application Entry Point
VIT Vellore | Software Engineering Project | 2026
"""

from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import Config
from models import db
from seed import seed_database

def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config.from_object(Config)

    # Extensions
    db.init_app(app)
    CORS(app, supports_credentials=True)
    JWTManager(app)

    # Register blueprints
    from routes.auth import auth_bp
    from routes.power import power_bp
    from routes.network import network_bp
    from routes.cameras import cameras_bp
    from routes.alerts import alerts_bp
    from routes.settings import settings_bp
    from routes.dashboard import dashboard_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(power_bp, url_prefix="/api/power")
    app.register_blueprint(network_bp, url_prefix="/api/network")
    app.register_blueprint(cameras_bp, url_prefix="/api/cameras")
    app.register_blueprint(alerts_bp, url_prefix="/api/alerts")
    app.register_blueprint(settings_bp, url_prefix="/api/settings")
    app.register_blueprint(dashboard_bp)

    # Error handlers
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error"}), 500

    # Create tables and seed
    with app.app_context():
        db.create_all()
        seed_database()

    return app


if __name__ == "__main__":
    app = create_app()
    print("\n" + "=" * 55)
    print("  🏠 GrihaNet — Smart Home Monitoring System")
    print("  📡 Server running at: http://localhost:5000")
    print("  📊 API docs at:       http://localhost:5000/api")
    print("=" * 55 + "\n")
    app.run(debug=True, host="0.0.0.0", port=5000)
