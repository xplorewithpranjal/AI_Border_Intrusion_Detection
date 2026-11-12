from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class ReferencePillar(Base):
    __tablename__ = "reference_pillars"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False, index=True)
    pillar_id = Column(String(64), nullable=False, index=True, doc="e.g. BP_001, PILLAR_A")
    name = Column(String(128), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    height = Column(Float, nullable=True, doc="Physical pillar height in meters")
    x_distance = Column(Float, nullable=True, doc="Along-border/local horizontal direction in meters")
    y_distance = Column(Float, nullable=True, doc="Perpendicular-to-border direction in meters")

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    camera = relationship("Camera", back_populates="reference_pillars")
    image_points = relationship(
        "PillarImagePoint",
        back_populates="pillar",
        cascade="all, delete-orphan",
        order_by="PillarImagePoint.id",
    )


class PillarImagePoint(Base):
    __tablename__ = "pillar_image_points"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    pillar_id = Column(Integer, ForeignKey("reference_pillars.id", ondelete="CASCADE"), nullable=False, index=True)
    point_type = Column(String(16), nullable=False, doc="TOP or BASE")
    pixel_x = Column(Float, nullable=False, doc="Image X coordinate in pixels")
    pixel_y = Column(Float, nullable=False, doc="Image Y coordinate in pixels")
    real_z = Column(Float, nullable=True, doc="Real height above ground in meters (e.g. 0.0 for BASE, pillar height for TOP)")

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    pillar = relationship("ReferencePillar", back_populates="image_points")
