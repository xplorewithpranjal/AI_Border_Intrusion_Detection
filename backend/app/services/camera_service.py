from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.camera import Camera
from app.models.pillar import ReferencePillar
from app.models.calibration import CameraCalibration
from app.schemas.camera import CameraCreate, CameraUpdate, CameraRead
from app.core.exceptions import EntityNotFoundException, EntityConflictException


class CameraService:
    @staticmethod
    def get_by_identifier(db: Session, identifier: str) -> Camera:
        """Finds a camera by camera_id (e.g. CAM_001) or by integer primary key id."""
        if not identifier:
            raise EntityNotFoundException("Camera", "None")
        identifier_str = str(identifier)
        camera = db.query(Camera).filter(Camera.camera_id == identifier_str).first()
        if not camera and identifier_str.isdigit():
            camera = db.query(Camera).filter(Camera.id == int(identifier_str)).first()
        if not camera:
            raise EntityNotFoundException("Camera", identifier_str)
        return camera

    @staticmethod
    def list_cameras(db: Session, skip: int = 0, limit: int = 100) -> List[CameraRead]:
        """Lists cameras with computed pillar count and calibration status."""
        cameras = db.query(Camera).offset(skip).limit(limit).all()
        result = []
        for cam in cameras:
            count = db.query(ReferencePillar).filter(ReferencePillar.camera_id == cam.id).count()
            latest_cal = (
                db.query(CameraCalibration)
                .filter(CameraCalibration.camera_id == cam.id)
                .order_by(CameraCalibration.created_at.desc())
                .first()
            )
            cal_status = latest_cal.calibration_status if latest_cal else cam.status
            cam_data = CameraRead(
                id=cam.id,
                camera_id=cam.camera_id,
                name=cam.name,
                description=cam.description,
                latitude=cam.latitude,
                longitude=cam.longitude,
                height=cam.height,
                yaw=cam.yaw,
                pitch=cam.pitch,
                roll=cam.roll,
                status=cam.status,
                created_at=cam.created_at,
                updated_at=cam.updated_at,
                pillar_count=count,
                calibration_status=cal_status,
            )
            result.append(cam_data)
        return result

    @staticmethod
    def get_camera(db: Session, identifier: str) -> CameraRead:
        """Gets a single camera with computed attributes."""
        cam = CameraService.get_by_identifier(db, identifier)
        count = db.query(ReferencePillar).filter(ReferencePillar.camera_id == cam.id).count()
        latest_cal = (
            db.query(CameraCalibration)
            .filter(CameraCalibration.camera_id == cam.id)
            .order_by(CameraCalibration.created_at.desc())
            .first()
        )
        cal_status = latest_cal.calibration_status if latest_cal else cam.status
        return CameraRead(
            id=cam.id,
            camera_id=cam.camera_id,
            name=cam.name,
            description=cam.description,
            latitude=cam.latitude,
            longitude=cam.longitude,
            height=cam.height,
            yaw=cam.yaw,
            pitch=cam.pitch,
            roll=cam.roll,
            status=cam.status,
            created_at=cam.created_at,
            updated_at=cam.updated_at,
            pillar_count=count,
            calibration_status=cal_status,
        )

    @staticmethod
    def create_camera(db: Session, payload: CameraCreate) -> CameraRead:
        """Creates a new static camera record."""
        # Check uniqueness of camera_id
        existing = db.query(Camera).filter(Camera.camera_id == payload.camera_id).first()
        if existing:
            raise EntityConflictException(f"Camera with ID '{payload.camera_id}' already exists.")

        camera = Camera(
            camera_id=payload.camera_id,
            name=payload.name,
            description=payload.description,
            latitude=payload.latitude,
            longitude=payload.longitude,
            height=payload.height,
            yaw=payload.yaw,
            pitch=payload.pitch,
            roll=payload.roll,
            status=payload.status or "uncalibrated",
        )
        db.add(camera)
        db.commit()
        db.refresh(camera)
        return CameraService.get_camera(db, camera.camera_id)

    @staticmethod
    def update_camera(db: Session, identifier: str, payload: CameraUpdate) -> CameraRead:
        """Updates camera metadata."""
        camera = CameraService.get_by_identifier(db, identifier)

        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(camera, key, value)

        db.commit()
        db.refresh(camera)
        return CameraService.get_camera(db, camera.camera_id)

    @staticmethod
    def delete_camera(db: Session, identifier: str) -> None:
        """Deletes a camera and associated cascades."""
        camera = CameraService.get_by_identifier(db, identifier)
        db.delete(camera)
        db.commit()
