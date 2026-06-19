package com.drone.model;

public class Waypoint {
    private String id;
    private double lat;
    private double lng;
    private double altitude;
    private double speed;
    private String action;

    public Waypoint() {}

    public Waypoint(String id, double lat, double lng, double altitude, double speed, String action) {
        this.id = id;
        this.lat = lat;
        this.lng = lng;
        this.altitude = altitude;
        this.speed = speed;
        this.action = action;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public double getLat() { return lat; }
    public void setLat(double lat) { this.lat = lat; }
    public double getLng() { return lng; }
    public void setLng(double lng) { this.lng = lng; }
    public double getAltitude() { return altitude; }
    public void setAltitude(double altitude) { this.altitude = altitude; }
    public double getSpeed() { return speed; }
    public void setSpeed(double speed) { this.speed = speed; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
}
