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


def heading_degrees(start, end):
    lat1 = math.radians(start['lat'])
    lng1 = math.radians(start['lng'])
    lat2 = math.radians(end['lat'])
    lng2 = math.radians(end['lng'])
    delta_lng = lng2 - lng1

    x = math.sin(delta_lng) * math.cos(lat2)
    y = (
        math.cos(lat1) * math.sin(lat2)
        - math.sin(lat1) * math.cos(lat2) * math.cos(delta_lng)
    )

    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360.0) % 360.0


def heading_change_degrees(heading_a, heading_b):
    diff = abs(heading_a - heading_b) % 360.0
    return 360.0 - diff if diff > 180.0 else diff


def build_route_segments(route_polyline):
    if not route_polyline or len(route_polyline) < 2:
        return []

    segment_distances = []
    segment_headings = []

    for start, end in zip(route_polyline, route_polyline[1:]):
        segment_distances.append(
            haversine_km(start['lat'], start['lng'], end['lat'], end['lng'])
        )
        segment_headings.append(heading_degrees(start, end))

    cumulative = 0.0
    segments = []
    for idx, distance_km in enumerate(segment_distances):
        start_km = cumulative
        cumulative += distance_km
        end_km = cumulative

        turn_angle = 0.0
        if idx < len(segment_headings) - 1:
            turn_angle = heading_change_degrees(
                segment_headings[idx],
                segment_headings[idx + 1],
            )

        if turn_angle >= 35.0 or distance_km <= 0.08:
            zone = 'urban'
        elif turn_angle <= 12.0 and distance_km >= 0.3:
            zone = 'highway'
        else:
            zone = 'rural'

        segments.append(
            {
                'index': idx,
                'distance_km': distance_km,
                'start_km': start_km,
                'end_km': end_km,
                'heading_deg': segment_headings[idx],
                'turn_angle_deg': turn_angle,
                'zone': zone,
            }
        )

    return segments


def segment_at_progress(route_segments, route_distance, progress):
    if not route_segments:
        return None

    if route_distance <= 0:
        return route_segments[-1]

    distance = max(0.0, min(route_distance, route_distance * max(0.0, min(1.0, progress))))

    for segment in route_segments:
        if distance <= segment['end_km']:
            return segment

    return route_segments[-1]


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
