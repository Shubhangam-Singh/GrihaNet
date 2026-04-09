"""
vision_pipeline.py
Handles real-time video processing: YOLO + ByteTrack + Annotation
"""

import cv2
from ultralytics import YOLO
import supervision as sv


class VisionPipeline:
    def __init__(self):
        # Load model once 
        self.model = YOLO("yolo26n.pt") 
        self.tracker = sv.ByteTrack()

        self.box_annotator = sv.BoxAnnotator()
        self.label_annotator = sv.LabelAnnotator()

    def process(self, frame):
        results = self.model(frame, verbose=False)[0]

        detections = sv.Detections.from_ultralytics(results)
        detections = self.tracker.update_with_detections(detections)

        labels = []

        if detections.class_id is not None:
            for class_id, track_id in zip(detections.class_id, detections.tracker_id):
                class_name = self.model.model.names[int(class_id)]
                labels.append(f"{class_name} ID:{track_id}")

        annotated = self.box_annotator.annotate(frame, detections)
        annotated = self.label_annotator.annotate(annotated, detections, labels)

        return annotated