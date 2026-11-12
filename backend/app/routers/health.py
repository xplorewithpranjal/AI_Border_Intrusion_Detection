import socket
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.config import settings
from app.schemas.common import HealthResponse

router = APIRouter(prefix="", tags=["Health & Network"])


def get_network_ips():
    """Detects primary LAN IP and all local network interface IPv4 addresses."""
    ips = []
    primary = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        primary = s.getsockname()[0]
        s.close()
        ips.append(primary)
    except Exception:
        pass

    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass

    return primary, ips


@router.get("/health", response_model=HealthResponse)
def get_health(db: Session = Depends(get_db)):
    """Health check endpoint providing runtime and database connectivity status."""
    db_connected = False
    try:
        db.execute(text("SELECT 1"))
        db_connected = True
    except Exception:
        db_connected = False

    return HealthResponse(
        status="healthy" if db_connected else "degraded",
        app_name=settings.APP_NAME,
        environment=settings.APP_ENV,
        version="2.0.0-phase2",
        timestamp=datetime.now(timezone.utc),
        database_connected=db_connected,
    )


@router.get("/network-info")
def get_network_info():
    """
    Returns dynamically detected LAN IP and ports for mobile phone streaming connections.
    Avoids hardcoding IP addresses.
    """
    primary, all_ips = get_network_ips()
    return {
        "primary_lan_ip": primary,
        "available_ips": all_ips,
        "frontend_port": 5173,
        "backend_port": settings.PORT,
        "hostname": socket.gethostname(),
    }
