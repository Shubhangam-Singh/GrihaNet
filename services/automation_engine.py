"""
Automation evaluation engine.
Runs in a background thread; evaluates every INTERVAL seconds.
Fires matching rules and debounces them to once per DEBOUNCE_SECONDS.
"""

import json
import threading
import time
from datetime import datetime, timezone, timedelta


INTERVAL         = 10   # seconds between evaluation cycles
DEBOUNCE_SECONDS = 60   # minimum gap between two firings of the same rule


def _evaluate_trigger(rule, app):
    """Return True if the rule's trigger condition is currently met."""
    from models import Appliance, MotionEvent
    params = json.loads(rule.trigger_params or "{}")

    if rule.trigger_type == "power_exceeds":
        threshold = float(params.get("kw", 5.0))
        on_appliances = Appliance.query.filter_by(user_id=rule.user_id, is_on=True).all()
        total_kw = sum(a.watts for a in on_appliances) / 1000.0
        return total_kw > threshold

    if rule.trigger_type == "camera_detects":
        event_type = params.get("event", "Person")
        since = datetime.now(timezone.utc) - timedelta(seconds=INTERVAL * 2)
        # Find a recent motion event of the specified type for this user's cameras
        from models import Camera
        cam_ids = [c.id for c in Camera.query.filter_by(user_id=rule.user_id).all()]
        if not cam_ids:
            return False
        recent = MotionEvent.query.filter(
            MotionEvent.camera_id.in_(cam_ids),
            MotionEvent.event_type == event_type,
            MotionEvent.timestamp >= since,
        ).first()
        return recent is not None

    if rule.trigger_type == "time_is":
        t = params.get("time", "23:00")
        now = datetime.now(timezone.utc)
        # Fire once per day within the first INTERVAL seconds of the specified minute
        try:
            hh, mm = map(int, t.split(":"))
        except Exception:
            return False
        target = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        return abs((now - target).total_seconds()) <= INTERVAL

    if rule.trigger_type == "appliance_on":
        appliance_id = int(params.get("appliance_id", 0))
        hours = float(params.get("hours", 2.0))
        a = Appliance.query.filter_by(id=appliance_id, user_id=rule.user_id, is_on=True).first()
        if not a:
            return False
        # For demo purposes treat it as always meeting the runtime condition
        return True

    return False


def _fire_action(rule, app):
    """Execute the rule's action inside an app context."""
    from models import db, Appliance, Alert
    params = json.loads(rule.action_params or "{}")

    if rule.action_type in ("turn_on", "turn_off"):
        appliance_id = int(params.get("appliance_id", 0))
        a = Appliance.query.filter_by(id=appliance_id, user_id=rule.user_id).first()
        if a:
            a.is_on = (rule.action_type == "turn_on")
            db.session.add(a)
        # Create a companion alert
        state = "ON" if rule.action_type == "turn_on" else "OFF"
        alert = Alert(
            alert_type="info",
            message=f'⚡ Automation "{rule.name}" turned {state} {a.name if a else "an appliance"}'  ,
            icon="🤖",
            module="Power",
            user_id=rule.user_id,
        )
        db.session.add(alert)

    elif rule.action_type == "create_alert":
        alert = Alert(
            alert_type=params.get("type", "warning"),
            message=params.get("message", f'Automation "{rule.name}" triggered'),
            icon=params.get("icon", "🤖"),
            module=params.get("module", "Power"),
            user_id=rule.user_id,
        )
        db.session.add(alert)

    rule.last_fired = datetime.now(timezone.utc)
    db.session.add(rule)
    db.session.commit()


def _run_engine(app):
    """Main engine loop — runs forever in background thread."""
    from models import Automation, Settings, NetworkDevice, Alert, db
    last_parental_check = {}

    while True:
        time.sleep(INTERVAL)
        try:
            with app.app_context():
                now = datetime.now(timezone.utc)
                
                # --- Parental Controls Polling ---
                pc_settings = Settings.query.filter_by(key="parentalControls", value="true").all()
                for pc in pc_settings:
                    uid = pc.user_id
                    last_check = last_parental_check.get(uid)
                    if not last_check or (now - last_check).total_seconds() >= DEBOUNCE_SECONDS:
                        last_parental_check[uid] = now
                        devices = NetworkDevice.query.filter_by(user_id=uid, is_online=True).all()
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
                                    print(f"  🧒 Parental Controls: Blocked {d.name}")
                        db.session.commit()

                # --- Regular Automation Rules ---
                rules = Automation.query.filter_by(enabled=True).all()
                for rule in rules:
                    # Debounce: skip if fired recently
                    if rule.last_fired:
                        elapsed = (now - rule.last_fired.replace(tzinfo=timezone.utc)).total_seconds()
                        if elapsed < DEBOUNCE_SECONDS:
                            continue
                    if _evaluate_trigger(rule, app):
                        print(f"  🤖 Automation fired: [{rule.id}] {rule.name}")
                        _fire_action(rule, app)
        except Exception as e:
            print(f"  ⚠️  Automation engine error: {e}")


def start_engine(app):
    """Start the background engine thread (non-blocking, daemon)."""
    t = threading.Thread(target=_run_engine, args=(app,), daemon=True, name="AutomationEngine")
    t.start()
    print("  🤖 Automation engine started")
