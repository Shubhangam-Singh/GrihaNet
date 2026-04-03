"""Settings API routes."""

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from fpdf import FPDF
from models import db, Settings, User, Appliance, Camera, NetworkDevice, Alert

settings_bp = Blueprint("settings", __name__)


@settings_bp.route("/", methods=["GET"])
@jwt_required()
def get_settings():
    """Get all settings as key-value object."""
    settings = Settings.query.filter_by(user_id=int(get_jwt_identity())).all()
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
        setting = Settings.query.filter_by(user_id=int(get_jwt_identity()), key=key).first()
        if setting:
            setting.value = str(value).lower() if isinstance(value, bool) else str(value)
            updated.append(key)
        else:
            db.session.add(Settings(user_id=int(get_jwt_identity()), key=key, value=str(value)))
            updated.append(key)

    db.session.commit()
    return jsonify({"updated": updated, "message": "Settings saved"})


@settings_bp.route("/<key>", methods=["GET"])
@jwt_required()
def get_setting(key):
    """Get a single setting value."""
    setting = Settings.query.filter_by(user_id=int(get_jwt_identity()), key=key).first()
    if not setting:
        return jsonify({"error": f"Setting '{key}' not found"}), 404
    return jsonify({"key": setting.key, "value": setting.value})


@settings_bp.route("/report.pdf", methods=["GET"])
@jwt_required()
def generate_pdf_report():
    """Generates and downloads a comprehensive system report in PDF format."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    appliances = Appliance.query.filter_by(user_id=user_id).all()
    cameras = Camera.query.filter_by(user_id=user_id).all()
    devices = NetworkDevice.query.filter_by(user_id=user_id).all()
    alerts = Alert.query.filter_by(user_id=user_id).order_by(Alert.created_at.desc()).limit(15).all()

    total_watts = sum(a.watts for a in appliances if a.is_on)
    active_cams = sum(1 for c in cameras if c.status == "active")
    online_devs = sum(1 for d in devices if d.is_online)

    class PDF(FPDF):
        def header(self):
            self.set_font("helvetica", "B", 24)
            self.set_text_color(0, 229, 160)  # Brand color
            self.cell(0, 10, "GrihaNet", ln=True)
            self.set_font("helvetica", "", 12)
            self.set_text_color(100, 100, 100)
            self.cell(0, 10, "Unified Smart Home Monitoring", ln=True)
            self.line(10, 30, 200, 30)
            self.ln(10)

        def footer(self):
            self.set_y(-15)
            self.set_font("helvetica", "I", 8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 10, f"Page {self.page_no()} - Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", align="C")

    pdf = PDF()
    pdf.add_page()
    
    # Title
    pdf.set_font("helvetica", "B", 16)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 10, "System Usage Report", ln=True)
    pdf.ln(5)

    # 1. User Profile & System Health (Two Column Layout)
    pdf.set_font("helvetica", "B", 12)
    pdf.set_text_color(0, 229, 160)
    pdf.cell(90, 10, "User Profile", border="B")
    pdf.cell(10, 10, "")
    pdf.cell(90, 10, "System Health", border="B", ln=True)
    pdf.ln(2)

    pdf.set_font("helvetica", "", 11)
    pdf.set_text_color(0, 0, 0)
    
    # Row 1
    pdf.cell(20, 8, "Name:")
    pdf.set_font("helvetica", "B", 11)
    pdf.cell(70, 8, user.name if user else "Guest")
    pdf.cell(10, 8, "")
    pdf.set_font("helvetica", "", 11)
    pdf.cell(45, 8, "Power Consumption:")
    pdf.set_font("helvetica", "B", 11)
    pdf.cell(45, 8, f"{total_watts/1000:.2f} kW", ln=True)

    # Row 2
    pdf.set_font("helvetica", "", 11)
    pdf.cell(20, 8, "Email:")
    pdf.set_font("helvetica", "B", 11)
    pdf.cell(70, 8, user.email if user else "N/A")
    pdf.cell(10, 8, "")
    pdf.set_font("helvetica", "", 11)
    pdf.cell(45, 8, "Active Cameras:")
    pdf.set_font("helvetica", "B", 11)
    pdf.cell(45, 8, f"{active_cams} / {len(cameras)}", ln=True)

    # Row 3
    pdf.set_font("helvetica", "", 11)
    pdf.cell(20, 8, "Role:")
    pdf.set_font("helvetica", "B", 11)
    pdf.cell(70, 8, user.role.capitalize() if user else "User")
    pdf.cell(10, 8, "")
    pdf.set_font("helvetica", "", 11)
    pdf.cell(45, 8, "Devices Online:")
    pdf.set_font("helvetica", "B", 11)
    pdf.cell(45, 8, f"{online_devs} / {len(devices)}", ln=True)

    pdf.ln(10)

    # 2. Recent Alerts Table
    pdf.set_font("helvetica", "B", 14)
    pdf.set_text_color(0, 229, 160)
    pdf.cell(0, 10, "Recent Activity Log", border="B", ln=True)
    pdf.ln(2)

    # Table Header
    pdf.set_font("helvetica", "B", 10)
    pdf.set_text_color(255, 255, 255)
    pdf.set_fill_color(0, 229, 160)
    pdf.cell(45, 8, "Time", border=1, fill=True)
    pdf.cell(30, 8, "Module", border=1, fill=True)
    pdf.cell(115, 8, "Message", border=1, fill=True, ln=True)

    # Table Rows
    pdf.set_font("helvetica", "", 9)
    pdf.set_text_color(0, 0, 0)
    
    if not alerts:
        pdf.cell(0, 10, "No recent alerts found.", border=1, align="C", ln=True)
    else:
        for idx, alert in enumerate(alerts):
            # Alternate row colors
            fill = idx % 2 != 0
            if fill:
                pdf.set_fill_color(240, 245, 250)
            
            time_str = alert.created_at.strftime("%Y-%m-%d %H:%M") if alert.created_at else ""
            pdf.cell(45, 8, time_str, border=1, fill=fill)
            pdf.cell(30, 8, alert.module.capitalize() if alert.module else "System", border=1, fill=fill)
            
            msg = alert.msg if hasattr(alert, "msg") else getattr(alert, "message", "Alert")
            msg = (msg[:65] + '...') if len(msg) > 65 else msg
            
            pdf.cell(115, 8, msg, border=1, fill=fill, ln=True)
            
    # Save the PDF temp file
    pdf_path = f"/tmp/GrihaNet_Report_{user_id}.pdf"
    pdf.output(pdf_path)
    
    filename = f"GrihaNet_Report_{datetime.now().strftime('%Y-%m-%d')}.pdf"
    return send_file(pdf_path, as_attachment=True, download_name=filename, mimetype="application/pdf")
