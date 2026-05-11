from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
from urllib.parse import urlparse


def build_route(start_lng, start_lat, end_lng, end_lat, points=250):
    coordinates = []
    for idx in range(points):
        t = idx / (points - 1)
        wiggle = math.sin(t * math.pi * 8) * 0.025
        lng = start_lng + (end_lng - start_lng) * t
        lat = start_lat + (end_lat - start_lat) * t + wiggle
        coordinates.append([lng, lat])
    return coordinates


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def do_GET(self):
        raw_path = self.path.split("?", 1)[0]
        parsed = urlparse(self.path)
        if raw_path == "/health":
            self.send_json({"status": "ok"})
            return

        prefix = "/route/v1/driving/"
        if not raw_path.startswith(prefix):
            self.send_error(404)
            return

        coords = raw_path[len(prefix):].split(";")
        if len(coords) != 2:
            self.send_error(400)
            return

        try:
            start_lng, start_lat = [float(value) for value in coords[0].split(",")]
            end_lng, end_lat = [float(value) for value in coords[1].split(",")]
        except ValueError:
            self.send_error(400)
            return

        route = build_route(start_lng, start_lat, end_lng, end_lat)
        self.send_json({
            "code": "Ok",
            "routes": [{
                "distance": 1000000,
                "duration": 36000,
                "geometry": {
                    "type": "LineString",
                    "coordinates": route,
                },
            }],
            "waypoints": [],
        })

    def send_json(self, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8002), Handler).serve_forever()
