"""Time utility functions."""
from datetime import datetime, timezone


def time_ago(dt):
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    diff = now - dt
    seconds = int(diff.total_seconds())
    if seconds < 60:
        return "Just now"
    elif seconds < 3600:
        return f"{seconds // 60} min ago"
    elif seconds < 86400:
        return f"{seconds // 3600} hr ago"
    else:
        d = seconds // 86400
        return f"{d} day{'s' if d > 1 else ''} ago"
