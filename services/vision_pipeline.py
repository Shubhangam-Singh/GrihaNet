"""
vision_pipeline.py
Handles real-time video processing: YOLO + ByteTrack + Annotation + Alerts (MULTI-USER SAFE)
"""

import cv2
import time
from ultralytics import YOLO
import supervision as sv


# Database
from models import db, Alert


class VisionPipeline:
    def __init__(self, app):
        self.app = app   # store Flask app

        self.model = YOLO("yolo26n.pt")
        self.tracker = sv.ByteTrack()

        self.box_annotator = sv.BoxAnnotator()
        self.label_annotator = sv.LabelAnnotator()

        self.alerted_ids = {}
        self.ALLOWED_CLASSES = [0, 2, 3, 5, 7]

    def process(self, frame, user_id, camera_name="Unknown Camera"):
        results = self.model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(results)

        if detections.class_id is not None:
            mask = [cls in self.ALLOWED_CLASSES for cls in detections.class_id]
            detections = detections[mask]

        detections = self.tracker.update_with_detections(detections)

        labels = []

        alert_key = f"{user_id}_{camera_name}"

        if alert_key not in self.alerted_ids:
            self.alerted_ids[alert_key] = set()

        if detections.class_id is not None:
            for class_id, track_id in zip(detections.class_id, detections.tracker_id):
                class_id = int(class_id)
                track_id = int(track_id)

                class_name = self.model.model.names[class_id]
                labels.append(f"{class_name} ID:{track_id}")

                # 🚨 NEW PERSON ONLY
                if class_id == 0:
                    if track_id not in self.alerted_ids[alert_key]:

                        self._insert_alert_safe(user_id, camera_name)

                        print(f"🚨 NEW PERSON → ID {track_id}")

                        self.alerted_ids[alert_key].add(track_id)

        annotated = self.box_annotator.annotate(frame, detections)
        annotated = self.label_annotator.annotate(annotated, detections, labels)

        return annotated

    def _insert_alert_safe(self, user_id, camera_name):
        try:
            with self.app.app_context():

                new_alert = Alert(
                    alert_type="danger",
                    message=f"Person detected by {camera_name}!",
                    icon="🚨",
                    module="Security",
                    user_id=user_id,
                    is_read=False
                )

                db.session.add(new_alert)
                db.session.commit()

                print(f"🚨 ALERT for user {user_id} from {camera_name}")

        except Exception as e:
            print(f"❌ DB Error: {e}")