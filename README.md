# 🏠 GrihaNet — Unified Smart Home Monitoring System

**Software Engineering Project | VIT Vellore | 2026**

A full-stack web application for monitoring power consumption, network devices, and home surveillance through a unified dashboard.

---

## Tech Stack

| Layer      | Technology                     |
|------------|--------------------------------|
| Frontend   | React 18 (via CDN + Babel)     |
| Backend    | Python Flask                   |
| Database   | SQLite (auto-created)          |
| Auth       | JWT (JSON Web Tokens)          |
| Charts     | Recharts                       |
| Styling    | Inline CSS (Dark Theme)        |

---

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the Server

```bash
python app.py
```

### 3. Open Dashboard

Navigate to **http://localhost:5000** in your browser.

**Default Login:**
- Email: `admin@grihanet.com`
- Password: `password123`

---

## Project Structure

```
grihanet/
├── app.py                  # Flask entry point
├── config.py               # Configuration
├── models.py               # SQLAlchemy models (8 entities)
├── seed.py                 # Database seeder
├── requirements.txt        # Python dependencies
├── grihanet.db             # SQLite database (auto-created)
│
├── routes/
│   ├── auth.py             # Login/Logout/Me
│   ├── power.py            # Power monitoring APIs
│   ├── network.py          # Network monitoring APIs
│   ├── cameras.py          # Surveillance APIs
│   ├── alerts.py           # Alert engine APIs
│   ├── settings.py         # User settings APIs
│   └── dashboard.py        # Frontend serving
│
├── services/
│   ├── simulation.py       # Realistic data generation
│   └── time_utils.py       # Time formatting helpers
│
├── templates/
│   └── index.html          # Main HTML page
│
└── static/
    └── js/
        └── app.jsx         # React frontend (full SPA)
```

---

## API Endpoints

| Module   | Method | Endpoint                          | Description              |
|----------|--------|-----------------------------------|--------------------------|
| Auth     | POST   | `/api/auth/login`                 | User login               |
| Auth     | GET    | `/api/auth/me`                    | Current user             |
| Power    | GET    | `/api/power/live`                 | Live power draw          |
| Power    | GET    | `/api/power/appliances`           | List appliances          |
| Power    | PUT    | `/api/power/appliances/:id/toggle`| Toggle on/off            |
| Power    | GET    | `/api/power/history`              | 24hr consumption         |
| Power    | GET    | `/api/power/weekly`               | Weekly breakdown         |
| Power    | GET    | `/api/power/rooms`                | Room-wise data           |
| Power    | GET    | `/api/power/recommendations`      | Energy tips              |
| Network  | GET    | `/api/network/devices`            | List devices             |
| Network  | PUT    | `/api/network/devices/:id/block`  | Block/unblock            |
| Network  | GET    | `/api/network/bandwidth`          | 24hr bandwidth           |
| Network  | POST   | `/api/network/speedtest`          | Speed test               |
| Camera   | GET    | `/api/cameras/`                   | List cameras             |
| Camera   | PUT    | `/api/cameras/:id/toggle`         | Toggle camera            |
| Camera   | GET    | `/api/cameras/motions`            | Motion events            |
| Camera   | POST   | `/api/cameras/motions/simulate`   | Simulate motion          |
| Alerts   | GET    | `/api/alerts/`                    | List alerts              |
| Alerts   | PUT    | `/api/alerts/:id/dismiss`         | Dismiss alert            |
| Alerts   | PUT    | `/api/alerts/read-all`            | Mark all read            |
| Alerts   | DELETE | `/api/alerts/clear-read`          | Clear read alerts        |
| Settings | GET    | `/api/settings/`                  | Get settings             |
| Settings | PUT    | `/api/settings/`                  | Update settings          |

---

## Features

### ⚡ Power Monitoring
- Real-time appliance-level power tracking
- Room-wise consumption breakdown (pie chart)
- 24-hour and weekly consumption graphs
- Cost calculation with configurable tariff
- Energy-saving recommendations
- Monthly budget tracking

### 🌐 Network Monitoring
- Auto-detect all devices on local network
- Per-device bandwidth tracking
- Unknown device flagging
- Block/unblock devices
- Speed test (simulated)
- Screen time estimation

### 📹 Surveillance & Security
- Live camera feeds (simulated)
- Motion detection with event classification
- Motion event log with timestamps
- Camera on/off control
- Severity-based alert generation

### 🔔 Smart Alert Engine
- Cross-module alerts (Power, Network, Security)
- Severity levels: danger, warning, info, success
- Toast notifications for real-time updates
- Dismiss, mark-all-read, and clear functions

### ⚙️ Settings
- General: Dark mode, auto-refresh, simulation mode
- Power: Rate, threshold, budget
- Network: Auto-block, bandwidth alerts, parental controls
- Security: Motion sensitivity, alert hours, snapshots

---

## Database Schema

8 entities: `User`, `Appliance`, `PowerReading`, `NetworkDevice`, `BandwidthLog`, `Camera`, `MotionEvent`, `Alert`, `Settings`

---

## SE Principles Demonstrated

- **SOLID**: Single Responsibility (modular routes), Open/Closed (extensible alert types)
- **MVC**: Models → Services → Routes → Templates
- **DRY**: Reusable API helper, shared components
- **Separation of Concerns**: Frontend/Backend/Database layers
- **Agile SDLC**: Sprint-based development over 9 weeks

---

## Team GrihaNet | VIT Vellore | 2026
