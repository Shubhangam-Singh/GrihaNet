"""
MQTT Service
Handles communication between Flask backend and ESP32 devices.
"""

import json
import paho.mqtt.publish as publish

MQTT_BROKER = "192.168.0.101"   # your PC IP
MQTT_TOPIC = "home/appliances"


def send_appliance_state(appliance):
    """
    Publish appliance state to MQTT broker.

    Safe design:
    - Skips appliances without GPIO mapping
    - Never crashes main app if MQTT fails
    """


    payload = {
        "id": appliance.id,
        "name": appliance.name,
        "gpio": appliance.gpio_pin,   # REQUIRED for ESP32
        "state": "ON" if appliance.is_on else "OFF"
    }

    try:
        publish.single(
            topic=MQTT_TOPIC,
            payload=json.dumps(payload),
            hostname=MQTT_BROKER,
            qos=0,
            retain=False
        )
        print(f"[MQTT SENT] {payload}")  # optional debug
    except Exception as e:
        print("[MQTT ERROR]", e)