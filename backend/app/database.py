from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

# For SQLite, check_same_thread is set to False to permit FastAPI multi-threaded requests.
# When switching to PostgreSQL/MySQL in later phases, this argument can be omitted.
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db():
    """Initializes tables and performs idempotent schema migration for SQLite."""
    Base.metadata.create_all(bind=engine)

    if settings.DATABASE_URL.startswith("sqlite"):
        with engine.connect() as conn:
            # Check cameras table
            cursor = conn.exec_driver_sql("PRAGMA table_info(cameras)")
            camera_cols = {row[1] for row in cursor.fetchall()}
            for col, col_type in [("yaw", "FLOAT"), ("pitch", "FLOAT"), ("roll", "FLOAT")]:
                if col not in camera_cols:
                    conn.exec_driver_sql(f"ALTER TABLE cameras ADD COLUMN {col} {col_type}")

            # Check camera_calibrations table
            cursor = conn.exec_driver_sql("PRAGMA table_info(camera_calibrations)")
            cal_cols = {row[1] for row in cursor.fetchall()}
            cal_columns = [
                ("is_valid", "INTEGER DEFAULT 0"),
                ("camera_latitude", "FLOAT"),
                ("camera_longitude", "FLOAT"),
                ("camera_height", "FLOAT"),
                ("yaw", "FLOAT"),
                ("pitch", "FLOAT"),
                ("roll", "FLOAT"),
                ("image_width", "INTEGER DEFAULT 1280"),
                ("image_height", "INTEGER DEFAULT 720"),
                ("hfov", "FLOAT"),
                ("vfov", "FLOAT"),
                ("focal_length_px", "FLOAT"),
                ("intrinsic_k", "JSON"),
                ("h_matrix", "JSON"),
                ("h_inv_matrix", "JSON"),
                ("local_origin_lat", "FLOAT"),
                ("local_origin_lon", "FLOAT"),
                ("local_origin_alt", "FLOAT"),
                ("reprojection_error_mean", "FLOAT"),
                ("reprojection_error_rmse", "FLOAT"),
                ("reprojection_error_max", "FLOAT"),
                ("num_reference_points", "INTEGER DEFAULT 0"),
                ("point_errors", "JSON"),
                ("pose_estimation_status", "VARCHAR(64)"),
                ("pose_data", "JSON"),
            ]
            for col, col_type in cal_columns:
                if col not in cal_cols:
                    conn.exec_driver_sql(f"ALTER TABLE camera_calibrations ADD COLUMN {col} {col_type}")
            conn.commit()


def get_db():
    """FastAPI dependency for yielding database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

