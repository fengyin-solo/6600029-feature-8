package com.drone.service;

import com.drone.model.Waypoint;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class RouteService {

    // ─── A* Pathfinding (simplified server-side) ────────────────────────────
    public List<Waypoint> planRoute(double startLat, double startLng,
                                     double goalLat, double goalLng,
                                     String algorithm) {
        List<double[]> noFlyZones = getMockNoFlyZoneCoords();
        List<Waypoint> path = new ArrayList<>();

        // Simple grid-based A*
        int gridSize = 20;
        double minLat = Math.min(startLat, goalLat) - 0.02;
        double maxLat = Math.max(startLat, goalLat) + 0.02;
        double minLng = Math.min(startLng, goalLng) - 0.02;
        double maxLng = Math.max(startLng, goalLng) + 0.02;
        double dLat = (maxLat - minLat) / gridSize;
        double dLng = (maxLng - minLng) / gridSize;

        int startRow = (int) ((startLat - minLat) / dLat);
        int startCol = (int) ((startLng - minLng) / dLng);
        int goalRow = (int) ((goalLat - minLat) / dLat);
        int goalCol = (int) ((goalLng - minLng) / dLng);

        // Clamp
        startRow = Math.max(0, Math.min(gridSize - 1, startRow));
        startCol = Math.max(0, Math.min(gridSize - 1, startCol));
        goalRow = Math.max(0, Math.min(gridSize - 1, goalRow));
        goalCol = Math.max(0, Math.min(gridSize - 1, goalCol));

        int[][] g = new int[gridSize][gridSize];
        int[][] parent = new int[gridSize][gridSize];
        for (int[] row : g) Arrays.fill(row, Integer.MAX_VALUE);
        for (int[] row : parent) Arrays.fill(row, -1);

        boolean[][] blocked = new boolean[gridSize][gridSize];
        for (double[] zone : noFlyZones) {
            for (int r = 0; r < gridSize; r++) {
                for (int c = 0; c < gridSize; c++) {
                    double lat = minLat + r * dLat;
                    double lng = minLng + c * dLng;
                    double dist = haversine(lat, lng, zone[0], zone[1]);
                    if (dist < zone[2]) blocked[r][c] = true;
                }
            }
        }

        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[2] - b[2]);
        g[startRow][startCol] = 0;
        pq.offer(new int[]{startRow, startCol, heuristic(startRow, startCol, goalRow, goalCol)});

        int[][] dirs = {{-1,0},{1,0},{0,-1},{0,1},{-1,-1},{-1,1},{1,-1},{1,1}};

        while (!pq.isEmpty()) {
            int[] curr = pq.poll();
            int cr = curr[0], cc = curr[1];

            if (cr == goalRow && cc == goalCol) break;

            for (int[] d : dirs) {
                int nr = cr + d[0], nc = cc + d[1];
                if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
                if (blocked[nr][nc]) continue;

                int cost = (d[0] != 0 && d[1] != 0) ? 14 : 10;
                int newG = g[cr][cc] + cost;
                if (newG < g[nr][nc]) {
                    g[nr][nc] = newG;
                    parent[nr][nc] = cr * gridSize + cc;
                    int h = heuristic(nr, nc, goalRow, goalCol);
                    pq.offer(new int[]{nr, nc, newG + h});
                }
            }
        }

        // Trace path
        List<int[]> rawPath = new ArrayList<>();
        int r = goalRow, c = goalCol;
        while (r != startRow || c != startCol) {
            rawPath.add(0, new int[]{r, c});
            int p = parent[r][c];
            if (p == -1) break;
            r = p / gridSize;
            c = p % gridSize;
        }
        rawPath.add(0, new int[]{startRow, startCol});

        int idx = 0;
        for (int[] p : rawPath) {
            double lat = minLat + p[0] * dLat;
            double lng = minLng + p[1] * dLng;
            path.add(new Waypoint("wp-" + idx++, lat, lng, 100, 10, "none"));
        }

        if (path.isEmpty()) {
            path.add(new Waypoint("wp-0", startLat, startLng, 100, 10, "none"));
            path.add(new Waypoint("wp-1", goalLat, goalLng, 100, 10, "none"));
        }

        return path;
    }

    private int heuristic(int r1, int c1, int r2, int c2) {
        return (int) (Math.sqrt((r1 - r2) * (r1 - r2) + (c1 - c2) * (c1 - c2)) * 10);
    }

    private double haversine(double lat1, double lng1, double lat2, double lng2) {
        double R = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                   Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                   Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // ─── Mock Data ──────────────────────────────────────────────────────────
    public List<Map<String, Object>> getNoFlyZones() {
        List<Map<String, Object>> zones = new ArrayList<>();
        zones.add(Map.of("id", "nfz-1", "name", "首都国际机场",
                "center", List.of(40.0799, 116.6031), "radius", 8000, "type", "airport"));
        zones.add(Map.of("id", "nfz-2", "name", "南苑军事区",
                "center", List.of(39.7833, 116.3833), "radius", 5000, "type", "military"));
        zones.add(Map.of("id", "nfz-3", "name", "中南海限制区",
                "center", List.of(39.9139, 116.3741), "radius", 3000, "type", "restricted"));
        return zones;
    }

    private List<double[]> getMockNoFlyZoneCoords() {
        return List.of(
            new double[]{40.0799, 116.6031, 8000},
            new double[]{39.7833, 116.3833, 5000},
            new double[]{39.9139, 116.3741, 3000}
        );
    }

    public List<Map<String, Object>> getTerrain() {
        List<Map<String, Object>> terrain = new ArrayList<>();
        double baseLat = 39.85;
        double baseLng = 116.35;
        for (int i = 0; i < 20; i++) {
            for (int j = 0; j < 20; j++) {
                double lat = baseLat + i * 0.005;
                double lng = baseLng + j * 0.005;
                double elevation = 50 +
                    30 * Math.sin(i * 0.5) * Math.cos(j * 0.4) +
                    20 * Math.sin(i * 0.3 + j * 0.2) +
                    10 * Math.cos(i * 0.7 - j * 0.5);
                terrain.add(Map.of("lat", lat, "lng", lng, "elevation", elevation));
            }
        }
        return terrain;
    }

    public String exportKML(List<Waypoint> waypoints, String name) {
        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append("<kml xmlns=\"http://www.opengis.net/kml/2.2\">\n  <Document>\n");
        sb.append("    <name>").append(name).append("</name>\n");
        sb.append("    <Placemark>\n      <name>Flight Route</name>\n");
        sb.append("      <LineString>\n        <altitudeMode>absolute</altitudeMode>\n");
        sb.append("        <coordinates>\n");
        for (Waypoint w : waypoints) {
            sb.append("          ").append(w.getLng()).append(",").append(w.getLat())
              .append(",").append(w.getAltitude()).append("\n");
        }
        sb.append("        </coordinates>\n      </LineString>\n    </Placemark>\n");
        for (int i = 0; i < waypoints.size(); i++) {
            Waypoint w = waypoints.get(i);
            sb.append("    <Placemark>\n      <name>WP").append(i + 1).append("</name>\n");
            sb.append("      <Point><coordinates>").append(w.getLng()).append(",")
              .append(w.getLat()).append(",").append(w.getAltitude())
              .append("</coordinates></Point>\n    </Placemark>\n");
        }
        sb.append("  </Document>\n</kml>");
        return sb.toString();
    }
}
