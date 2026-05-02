import math


def haversine_km(lat1, lng1, lat2, lng2):
    radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2.0) ** 2
    )
    return 2.0 * radius_km * math.asin(math.sqrt(a))


def route_distance_km(route_polyline):
    if not route_polyline or len(route_polyline) < 2:
        return 0.0

    total = 0.0
    previous = route_polyline[0]

    for point in route_polyline[1:]:
        total += haversine_km(previous['lat'], previous['lng'], point['lat'], point['lng'])
        previous = point

    return total


def point_at_progress(route_polyline, progress):
    if not route_polyline:
        raise ValueError('Route polyline is required')

    if len(route_polyline) == 1:
        point = route_polyline[0]
        return point['lat'], point['lng']

    clamped = max(0.0, min(1.0, progress))
    total_distance = route_distance_km(route_polyline)

    if total_distance <= 0:
        point = route_polyline[-1]
        return point['lat'], point['lng']

    target_distance = total_distance * clamped
    traversed = 0.0

    for start, end in zip(route_polyline, route_polyline[1:]):
        segment_distance = haversine_km(start['lat'], start['lng'], end['lat'], end['lng'])
        if segment_distance <= 0:
            continue

        next_traversed = traversed + segment_distance
        if next_traversed >= target_distance:
            local_progress = (target_distance - traversed) / segment_distance
            lat = start['lat'] + (end['lat'] - start['lat']) * local_progress
            lng = start['lng'] + (end['lng'] - start['lng']) * local_progress
            return lat, lng

        traversed = next_traversed

    point = route_polyline[-1]
    return point['lat'], point['lng']
