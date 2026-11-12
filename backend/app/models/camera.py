from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from sqlalchemy.orm import relationship
from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    camera_id = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    height = Column(Float, nullable=True, doc="Camera height above ground in meters")
    yaw = Column(Float, nullable=True, doc="Camera yaw in degrees (0 = North, 90 = East)")
    pitch = Column(Float, nullable=True, doc="Camera pitch in degrees (down tilt is negative)")
    roll = Column(Float, nullable=True, doc="Camera roll in degrees")
    status = Column(String(32), default="uncalibrated", nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    reference_pillars = relationship(
        "ReferencePillar",
        back_populates="camera",
        cascade="all, delete-orphan",
        order_by="ReferencePillar.created_at",
    )
    calibrations = relationship(
        "CameraCalibration",
        back_populates="camera",
        cascade="all, delete-orphan",
        order_by="desc(CameraCalibration.created_at)",
    )
