"""
mqtt_service.py
MQTT Service
Handles communication between Flask backend and ESP32 devices.
"""

import json
import paho.mqtt.publish as publish
import paho.mqtt.client as mqtt

MQTT_BROKER = "192.168.0.101"   # your PC IP
APL_CTRL_TOPIC = "home/appliances"
METER_TOPIC = "meter/data"

latest_meter_data = {
    "vrms": 0,
    "irms": 0,
    "pf": 0,
    "S": 0,
    "P": 0,
    "Q": 0,
    "vthd": 0,
    "ithd": 0,
    "vpeak": 0,
    "ipeak": 0,
}


def parse_meter_payload(payload):
    try:
        parts = payload.split("#")

        return {
            "vrms": float(parts[0]),
            "irms": float(parts[1]),
            "pf": float(parts[2]),
            "S": float(parts[3]),
            "P": float(parts[4]),
            "Q": float(parts[5]),
            "vthd": float(parts[6]),
            "ithd": float(parts[7]),
            "vpeak": float(parts[8]),
            "ipeak": float(parts[9]),
        }
    except Exception as e:
        print("[PARSE ERROR]", e)
        return None


def on_connect(client, userdata, flags, rc):
    print("[MQTT] Connected with result code", rc)
    client.subscribe(METER_TOPIC)


def on_message(client, userdata, msg):
    global latest_meter_data

    payload = msg.payload.decode()
    data = parse_meter_payload(payload)

    if data:
        latest_meter_data = data
        # print("[METER DATA]", data)


def start_mqtt_listener():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(MQTT_BROKER, 1883, 60)

    # Run in background thread
    client.loop_start()


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
            topic=APL_CTRL_TOPIC,
            payload=json.dumps(payload),
            hostname=MQTT_BROKER,
            qos=0,
            retain=False
        )
        print(f"[MQTT SENT] {payload}")  # optional debug
    except Exception as e:
        print("[MQTT ERROR]", e)


