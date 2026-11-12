"""
Geospatial Coordinate Transform Module (Local Tangent Plane / ENU)
==================================================================

Coordinate Convention:
----------------------
- Origin: (lat_0, lon_0, alt_0) typically the camera optical center or reference ground point.
- +X: Easting (meters East of origin)
- +Y: Northing (meters North of origin)
- +Z: Elevation / Height above local ground (meters Up)

Uses WGS-84 ellipsoidal geometry for accurate local metric transformations.
Avoids distortion from degree-space operations on perimeter borders.
"""

import math
from typing import Tuple, Dict, Any, List

# WGS-84 Ellipsoid constants
WGS84_A = 6378137.0          # Semi-major axis in meters
WGS84_B = 6356752.314245     # Semi-minor axis in meters
WGS84_E2 = (WGS84_A**2 - WGS84_B**2) / (WGS84_A**2) # First eccentricity squared ~0.00669438


def prime_vertical_radius(lat_rad: float) -> float:
    """Computes radius of curvature in prime vertical (East-West) N(phi)."""
    sin_lat = math.sin(lat_rad)
    return WGS84_A / math.sqrt(1.0 - WGS84_E2 * sin_lat * sin_lat)


def meridian_radius(lat_rad: float) -> float:
    """Computes radius of curvature in meridian (North-South) M(phi)."""
    sin_lat = math.sin(lat_rad)
    denom = 1.0 - WGS84_E2 * sin_lat * sin_lat
    return WGS84_A * (1.0 - WGS84_E2) / (denom * math.sqrt(denom))


def gps_to_local_enu(
    lat: float,
    lon: float,
    origin_lat: float,
    origin_lon: float,
    alt: float = 0.0,
    origin_alt: float = 0.0,
) -> Tuple[float, float, float]:
    """
    Transforms WGS84 GPS (latitude, longitude, altitude) into local metric Cartesian coordinates
    (East, North, Up) relative to a reference origin.

    Args:
        lat: Latitude in decimal degrees
        lon: Longitude in decimal degrees
        origin_lat: Origin latitude in decimal degrees
        origin_lon: Origin longitude in decimal degrees
        alt: Altitude/height in meters
        origin_alt: Origin altitude/height in meters

    Returns:
        (x_east_m, y_north_m, z_up_m)
    """
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    origin_lat_rad = math.radians(origin_lat)
    origin_lon_rad = math.radians(origin_lon)

    d_lat = lat_rad - origin_lat_rad
    d_lon = lon_rad - origin_lon_rad

    # Average latitude for curvature radius
    mean_lat_rad = (lat_rad + origin_lat_rad) / 2.0
    N = prime_vertical_radius(mean_lat_rad)
    M = meridian_radius(mean_lat_rad)

    x_east = d_lon * N * math.cos(mean_lat_rad)
    y_north = d_lat * M
    z_up = alt - origin_alt

    return (round(x_east, 4), round(y_north, 4), round(z_up, 4))


def local_enu_to_gps(
    x_east: float,
    y_north: float,
    origin_lat: float,
    origin_lon: float,
    z_up: float = 0.0,
    origin_alt: float = 0.0,
) -> Tuple[float, float, float]:
    """
    Transforms local Cartesian metric coordinates (East, North, Up) back into WGS84 GPS
    (latitude, longitude, altitude).

    Args:
        x_east: Meters East of origin
        y_north: Meters North of origin
        origin_lat: Origin latitude in decimal degrees
        origin_lon: Origin longitude in decimal degrees
        z_up: Elevation above ground in meters
        origin_alt: Origin altitude in meters

    Returns:
        (latitude_deg, longitude_deg, altitude_m)
    """
    origin_lat_rad = math.radians(origin_lat)
    M0 = meridian_radius(origin_lat_rad)

    # Initial latitude estimate
    lat_rad = origin_lat_rad + (y_north / M0)

    # Refined radius of curvature
    mean_lat_rad = (origin_lat_rad + lat_rad) / 2.0
    M = meridian_radius(mean_lat_rad)
    N = prime_vertical_radius(mean_lat_rad)

    # Final lat and lon differences
    d_lat = y_north / M
    d_lon = x_east / (N * math.cos(mean_lat_rad))

    lat = origin_lat + math.degrees(d_lat)
    lon = origin_lon + math.degrees(d_lon)
    alt = origin_alt + z_up

    return (round(lat, 8), round(lon, 8), round(alt, 3))


def horizontal_distance(x1: float, y1: float, x2: float = 0.0, y2: float = 0.0) -> float:
    """Calculates Euclidean distance in the local ground horizontal plane."""
    return math.hypot(x1 - x2, y1 - y2)


def bearing_deg(x1: float, y1: float, x2: float, y2: float) -> float:
    """Calculates compass bearing in degrees (0 = North, 90 = East, 180 = South, 270 = West)."""
    dx = x2 - x1
    dy = y2 - y1
    angle = math.degrees(math.atan2(dx, dy))
    return (angle + 360.0) % 360.0
