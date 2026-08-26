Merged GTFS v2. stop_lat/stop_lon are set only where real GIS JSON coordinates were matched. Unmatched fake coordinates are blank and hidden in the viewer.

V3: GIS coordinates were treated as Tokyo Datum and converted to WGS84/JGD2000 for Leaflet/OpenStreetMap alignment.
