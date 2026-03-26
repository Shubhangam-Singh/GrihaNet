"""Dashboard and frontend serving routes."""

from flask import Blueprint, send_from_directory, jsonify, render_template
import os

dashboard_bp = Blueprint("dashboard", __name__)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "static")


@dashboard_bp.route("/")
def index():
    """Serve the main dashboard."""
    return render_template("index.html")


@dashboard_bp.route("/api")
def api_docs():
    """API endpoint overview."""
    return jsonify({
        "name": "GrihaNet API",
        "version": "1.0.0",
        "description": "Unified Smart Home Monitoring System",
        "endpoints": {
            "auth": {
                "POST /api/auth/login": "Authenticate user",
                "POST /api/auth/logout": "End session",
                "GET  /api/auth/me": "Current user info",
            },
            "power": {
                "GET  /api/power/live": "Live power draw",
                "GET  /api/power/appliances": "List appliances",
                "PUT  /api/power/appliances/:id/toggle": "Toggle appliance",
                "GET  /api/power/history": "24hr power history",
                "GET  /api/power/weekly": "Weekly consumption",
                "GET  /api/power/rooms": "Room breakdown",
                "GET  /api/power/recommendations": "Energy tips",
                "GET  /api/power/summary": "Power overview",
            },
            "network": {
                "GET  /api/network/devices": "List devices",
                "PUT  /api/network/devices/:id/block": "Block/unblock",
                "GET  /api/network/bandwidth": "Bandwidth history",
                "POST /api/network/speedtest": "Run speed test",
                "GET  /api/network/summary": "Network overview",
                "GET  /api/network/screentime": "Screen time estimates",
            },
            "cameras": {
                "GET  /api/cameras/": "List cameras",
                "PUT  /api/cameras/:id/toggle": "Toggle camera",
                "GET  /api/cameras/motions": "Motion events",
                "POST /api/cameras/motions/simulate": "Simulate motion",
                "GET  /api/cameras/summary": "Camera overview",
            },
            "alerts": {
                "GET    /api/alerts/": "List alerts",
                "PUT    /api/alerts/:id/dismiss": "Dismiss alert",
                "PUT    /api/alerts/read-all": "Mark all read",
                "DELETE /api/alerts/clear-read": "Clear read alerts",
                "POST   /api/alerts/create": "Create alert",
            },
            "settings": {
                "GET /api/settings/": "Get all settings",
                "PUT /api/settings/": "Update settings",
            },
        },
    })
