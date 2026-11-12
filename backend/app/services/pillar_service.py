from typing import List
from sqlalchemy.orm import Session
from app.models.camera import Camera
from app.models.pillar import ReferencePillar, PillarImagePoint
from app.schemas.pillar import (
    ReferencePillarCreate,
    ReferencePillarUpdate,
    ReferencePillarRead,
    PillarImagePointCreate,
    PillarImagePointRead,
)
from app.core.exceptions import EntityNotFoundException, EntityConflictException
from app.services.camera_service import CameraService


class PillarService:
    @staticmethod
    def list_by_camera(db: Session, camera_identifier: str) -> List[ReferencePillarRead]:
        camera = CameraService.get_by_identifier(db, camera_identifier)
        pillars = (
            db.query(ReferencePillar)
            .filter(ReferencePillar.camera_id == camera.id)
            .all()
        )
        return [ReferencePillarRead.model_validate(p) for p in pillars]

    @staticmethod
    def get_pillar(db: Session, pillar_id_int: int) -> ReferencePillarRead:
        pillar = db.query(ReferencePillar).filter(ReferencePillar.id == pillar_id_int).first()
        if not pillar:
            raise EntityNotFoundException("ReferencePillar", str(pillar_id_int))
        return ReferencePillarRead.model_validate(pillar)

    @staticmethod
    def create_pillar(db: Session, camera_identifier: str, payload: ReferencePillarCreate) -> ReferencePillarRead:
        camera = CameraService.get_by_identifier(db, camera_identifier)

        # Enforce maximum 4 reference pillars per camera (P1, P2, P3, P4)
        current_count = (
            db.query(ReferencePillar)
            .filter(ReferencePillar.camera_id == camera.id)
            .count()
        )
        if current_count >= 4:
            raise EntityConflictException(
                f"Maximum of 4 reference pillars (P1, P2, P3, P4) reached for camera '{camera.camera_id}'."
            )

        # Check pillar_id uniqueness under this camera
        existing = (
            db.query(ReferencePillar)
            .filter(
                ReferencePillar.camera_id == camera.id,
                ReferencePillar.pillar_id == payload.pillar_id,
            )
            .first()
        )
        if existing:
            raise EntityConflictException(
                f"Pillar with ID '{payload.pillar_id}' already registered for camera '{camera.camera_id}'."
            )

        lat = payload.latitude
        lon = payload.longitude
        x_dist = payload.x_distance
        y_dist = payload.y_distance

        # Auto-derive East/North from GPS or vice versa if camera has GPS origin
        if camera.latitude is not None and camera.longitude is not None:
            from app.geometry.coordinate_transform import gps_to_local_enu, local_enu_to_gps
            if (lat is None or lon is None) and (x_dist is not None and y_dist is not None):
                calc_lat, calc_lon, _ = local_enu_to_gps(x_dist, y_dist, camera.latitude, camera.longitude)
                lat = calc_lat
                lon = calc_lon
            elif (x_dist is None or y_dist is None) and (lat is not None and lon is not None):
                calc_x, calc_y, _ = gps_to_local_enu(lat, lon, camera.latitude, camera.longitude)
                x_dist = calc_x
                y_dist = calc_y

        pillar = ReferencePillar(
            camera_id=camera.id,
            pillar_id=payload.pillar_id,
            name=payload.name,
            latitude=lat,
            longitude=lon,
            height=payload.height,
            x_distance=x_dist,
            y_distance=y_dist,
        )
        db.add(pillar)
        db.commit()
        db.refresh(pillar)

        # If initial points were provided (e.g. TOP or BASE)
        if payload.image_points:
            for pt in payload.image_points:
                image_pt = PillarImagePoint(
                    pillar_id=pillar.id,
                    point_type=pt.point_type.upper(),
                    pixel_x=pt.pixel_x,
                    pixel_y=pt.pixel_y,
                    real_z=pt.real_z if pt.real_z is not None else (0.0 if pt.point_type.upper() == "BASE" else pillar.height),
                )
                db.add(image_pt)
            db.commit()
            db.refresh(pillar)

        return ReferencePillarRead.model_validate(pillar)

    @staticmethod
    def update_pillar(db: Session, pillar_id_int: int, payload: ReferencePillarUpdate) -> ReferencePillarRead:
        pillar = db.query(ReferencePillar).filter(ReferencePillar.id == pillar_id_int).first()
        if not pillar:
            raise EntityNotFoundException("ReferencePillar", str(pillar_id_int))

        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(pillar, key, value)

        db.commit()
        db.refresh(pillar)
        return ReferencePillarRead.model_validate(pillar)

    @staticmethod
    def delete_pillar(db: Session, pillar_id_int: int) -> None:
        pillar = db.query(ReferencePillar).filter(ReferencePillar.id == pillar_id_int).first()
        if not pillar:
            raise EntityNotFoundException("ReferencePillar", str(pillar_id_int))
        db.delete(pillar)
        db.commit()

    @staticmethod
    def add_image_point(db: Session, pillar_id_int: int, payload: PillarImagePointCreate) -> PillarImagePointRead:
        pillar = db.query(ReferencePillar).filter(ReferencePillar.id == pillar_id_int).first()
        if not pillar:
            raise EntityNotFoundException("ReferencePillar", str(pillar_id_int))

        # Check if point of this type already exists for this pillar (replace or add)
        existing = (
            db.query(PillarImagePoint)
            .filter(
                PillarImagePoint.pillar_id == pillar.id,
                PillarImagePoint.point_type == payload.point_type.upper(),
            )
            .first()
        )
        if existing:
            existing.pixel_x = payload.pixel_x
            existing.pixel_y = payload.pixel_y
            existing.real_z = payload.real_z if payload.real_z is not None else existing.real_z
            db.commit()
            db.refresh(existing)
            return PillarImagePointRead.model_validate(existing)

        real_z = payload.real_z
        if real_z is None:
            real_z = 0.0 if payload.point_type.upper() == "BASE" else (pillar.height or 0.0)

        image_pt = PillarImagePoint(
            pillar_id=pillar.id,
            point_type=payload.point_type.upper(),
            pixel_x=payload.pixel_x,
            pixel_y=payload.pixel_y,
            real_z=real_z,
        )
        db.add(image_pt)
        db.commit()
        db.refresh(image_pt)
        return PillarImagePointRead.model_validate(image_pt)
