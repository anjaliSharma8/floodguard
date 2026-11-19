import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:http/http.dart' as http;

class SafeRoutePlannerScreen extends StatefulWidget {
  const SafeRoutePlannerScreen({super.key});

  @override
  State<SafeRoutePlannerScreen> createState() => _SafeRoutePlannerScreenState();
}

class _SafeRoutePlannerScreenState extends State<SafeRoutePlannerScreen> {
  static const String baseUrl = 'http://127.0.0.1:3000';
  static const Color primaryColor = Color(0xFF087E8B);

  String? selectedSourceId;
  String? selectedDestinationId;

  String selectedRoute = 'Safest';

  List<Map<String, dynamic>> availableNodes = [];

  Map<String, dynamic>? routeResponse;

  bool isLoadingRoads = true;
  bool isFindingRoute = false;

  String? errorMessage;

  @override
  void initState() {
    super.initState();
    fetchRoads();
  }

  // FETCH ROAD LOCATIONS

  Future<void> fetchRoads() async {
    try {
      final response = await http
          .get(Uri.parse('$baseUrl/api/roads'))
          .timeout(const Duration(seconds: 15));

      if (response.statusCode != 200) {
        throw Exception('Failed to load Pune locations.');
      }

      final data = jsonDecode(response.body);

      final Map<String, dynamic> nodes = Map<String, dynamic>.from(
        data['nodes'],
      );

      final loadedNodes = nodes.entries.map((entry) {
        return {'id': entry.key, ...Map<String, dynamic>.from(entry.value)};
      }).toList();

      if (!mounted) return;

      if (loadedNodes.isEmpty) {
        throw Exception('No road locations received.');
      }

      setState(() {
        availableNodes = loadedNodes;

        selectedSourceId = loadedNodes.any((n) => n['id'] == 'N_SHIVAJINAGAR')
            ? 'N_SHIVAJINAGAR'
            : loadedNodes.first['id'].toString();

        selectedDestinationId = loadedNodes.any((n) => n['id'] == 'N_SWARGATE')
            ? 'N_SWARGATE'
            : loadedNodes.last['id'].toString();

        isLoadingRoads = false;
        errorMessage = null;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        isLoadingRoads = false;
        errorMessage = 'Unable to connect to the server.\n$e';
      });
    }
  }

  // GET CURRENT ROUTE

  Map<String, dynamic>? get currentRoute {
    if (routeResponse == null) return null;

    final key = selectedRoute == 'Safest' ? 'safestRoute' : 'shortestRoute';

    final result = routeResponse![key];

    if (result == null) return null;

    return Map<String, dynamic>.from(result);
  }

  // CONVERT ROUTE NODES INTO MAP COORDINATES

  List<LatLng> get routePoints {
    final route = currentRoute;

    if (route == null || route['nodes'] == null) {
      return [];
    }

    final nodes = route['nodes'] as List<dynamic>;

    return nodes.map((node) {
      final lat = (node['lat'] as num).toDouble();
      final lng = (node['lng'] as num).toDouble();

      return LatLng(lat, lng);
    }).toList();
  }

  // GET NODE BY ID

  Map<String, dynamic>? getNodeById(String? id) {
    if (id == null) return null;

    for (final node in availableNodes) {
      if (node['id'] == id) return node;
    }

    return null;
  }

  // GET NODE POSITION

  LatLng? getNodePosition(Map<String, dynamic>? node) {
    if (node == null) return null;

    if (node['lat'] == null || node['lng'] == null) {
      return null;
    }

    return LatLng(
      (node['lat'] as num).toDouble(),
      (node['lng'] as num).toDouble(),
    );
  }

  // MAP POINTS

  List<LatLng> get mapPoints {
    final points = routePoints;

    if (points.isNotEmpty) return points;

    final start = getNodePosition(getNodeById(selectedSourceId));

    final end = getNodePosition(getNodeById(selectedDestinationId));

    return [?start, ?end];
  }

  // MAP CENTER

  LatLng get mapCenter {
    final points = mapPoints;

    if (points.isEmpty) {
      return const LatLng(18.5204, 73.8567);
    }

    if (points.length == 1) {
      return points.first;
    }

    double minLat = points.first.latitude;
    double maxLat = points.first.latitude;

    double minLng = points.first.longitude;
    double maxLng = points.first.longitude;

    for (final point in points) {
      if (point.latitude < minLat) minLat = point.latitude;
      if (point.latitude > maxLat) maxLat = point.latitude;

      if (point.longitude < minLng) minLng = point.longitude;
      if (point.longitude > maxLng) maxLng = point.longitude;
    }

    return LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);
  }

  // FIND SAFE ROUTE

  Future<void> findRoute() async {
    if (selectedSourceId == null || selectedDestinationId == null) {
      return;
    }

    if (selectedSourceId == selectedDestinationId) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Starting point and destination must be different.'),
        ),
      );
      return;
    }

    setState(() {
      isFindingRoute = true;
      routeResponse = null;
      errorMessage = null;
    });

    try {
      final response = await http
          .post(
            Uri.parse('$baseUrl/api/routes/find'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'startNodeId': selectedSourceId,
              'targetNodeId': selectedDestinationId,
              'lambdaRisk': 1.8,
            }),
          )
          .timeout(const Duration(seconds: 20));

      if (response.statusCode != 200) {
        throw Exception('Route request failed: ${response.statusCode}');
      }

      final data = jsonDecode(response.body);

      if (!mounted) return;

      setState(() {
        routeResponse = Map<String, dynamic>.from(data);
        isFindingRoute = false;
      });

      debugPrint('ROUTE RESPONSE RECEIVED');
      debugPrint('ROUTE POINTS: ${routePoints.length}');
      debugPrint('ROUTE COORDINATES: $routePoints');

      final route = currentRoute;

      if (route != null && route['feasible'] == false) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              route['message']?.toString() ?? 'No feasible route found.',
            ),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;

      setState(() {
        isFindingRoute = false;
        errorMessage = 'Unable to calculate route.\n$e';
      });
    }
  }

  // LOCATION DROPDOWN

  Widget buildLocationDropdown({
    required String label,
    required String? selectedValue,
    required IconData icon,
    required ValueChanged<String?> onChanged,
  }) {
    return DropdownButtonFormField<String>(
      initialValue: selectedValue,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: primaryColor),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
      items: availableNodes.map((node) {
        return DropdownMenuItem<String>(
          value: node['id'].toString(),
          child: Text(node['name'].toString(), overflow: TextOverflow.ellipsis),
        );
      }).toList(),
      onChanged: isFindingRoute ? null : onChanged,
    );
  }

  // ROUTE MAP

  Widget buildRouteMap() {
    final points = mapPoints;
    final route = currentRoute;

    final routeNodes = route?['nodes'] as List<dynamic>? ?? [];

    final markers = <Marker>[];

    // ROUTE MARKERS

    if (routeNodes.isNotEmpty) {
      for (int i = 0; i < routeNodes.length; i++) {
        final node = routeNodes[i];

        final isStart = i == 0;
        final isEnd = i == routeNodes.length - 1;

        markers.add(
          Marker(
            point: LatLng(
              (node['lat'] as num).toDouble(),
              (node['lng'] as num).toDouble(),
            ),
            width: 45,
            height: 55,
            child: Icon(
              isStart ? Icons.trip_origin : Icons.location_on,
              color: isStart
                  ? Colors.green
                  : isEnd
                  ? Colors.red
                  : Colors.blue,
              size: isStart || isEnd ? 38 : 32,
            ),
          ),
        );
      }
    } else {
      final start = getNodePosition(getNodeById(selectedSourceId));

      final end = getNodePosition(getNodeById(selectedDestinationId));

      if (start != null) {
        markers.add(
          Marker(
            point: start,
            width: 45,
            height: 50,
            child: const Icon(Icons.trip_origin, color: Colors.green, size: 34),
          ),
        );
      }

      if (end != null) {
        markers.add(
          Marker(
            point: end,
            width: 45,
            height: 50,
            child: const Icon(Icons.location_on, color: Colors.red, size: 38),
          ),
        );
      }
    }

    debugPrint('MAP ROUTE POINTS: ${points.length}');

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: FlutterMap(
        key: ValueKey(
          '${selectedSourceId}_${selectedDestinationId}_'
          '${selectedRoute}_${routeResponse == null}',
        ),
        options: MapOptions(
          initialCenter: mapCenter,
          initialZoom: 12,
          minZoom: 10,
          maxZoom: 18,
        ),
        children: [
          // OPEN STREET MAP TILES

          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'com.example.floodguard',
            maxNativeZoom: 19,
          ),

          // BLUE ROUTE POLYLINE
          if (points.length >= 2)
            PolylineLayer(
              polylines: [
                Polyline(points: points, strokeWidth: 7, color: Colors.blue),
              ],
            ),

          // LOCATION MARKERS
          MarkerLayer(markers: markers),

          // MAP ATTRIBUTION
          RichAttributionWidget(
            attributions: [
              TextSourceAttribution('© OpenStreetMap contributors'),
            ],
          ),
        ],
      ),
    );
  }

  // ROUTE DETAILS

  Widget buildRouteDetails() {
    final route = currentRoute;

    if (route == null) {
      return const SizedBox.shrink();
    }

    if (route['feasible'] != true) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.red.shade50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.red.shade200),
        ),
        child: Text(
          route['message']?.toString() ?? 'No feasible route available.',
          style: TextStyle(
            color: Colors.red.shade900,
            fontWeight: FontWeight.w600,
          ),
        ),
      );
    }

    final distance = (route['totalDistanceKm'] as num?)?.toDouble() ?? 0;

    final travelTime = (route['travelTimeMins'] as num?)?.toDouble() ?? 0;

    final averageRisk = (route['averageRiskScore'] as num?)?.toDouble() ?? 0;

    final maximumRisk = (route['maxRiskScore'] as num?)?.toDouble() ?? 0;

    final safetyRating = route['safetyRating']?.toString() ?? 'Unknown';

    final List<dynamic> edges = route['edges'] ?? [];

    final ratingColor = safetyRating == 'Safe'
        ? Colors.green
        : safetyRating == 'Moderate'
        ? Colors.orange
        : Colors.red;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.teal.shade50,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.teal.shade100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$selectedRoute Route Details',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 16),

          Row(
            children: [
              Expanded(
                child: _detailItem(
                  Icons.route,
                  'Distance',
                  '${distance.toStringAsFixed(2)} km',
                ),
              ),
              Expanded(
                child: _detailItem(
                  Icons.access_time,
                  'Estimated Time',
                  '${travelTime.toStringAsFixed(1)} min',
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          Row(
            children: [
              Expanded(
                child: _detailItem(
                  Icons.warning_amber,
                  'Average Risk',
                  averageRisk.toStringAsFixed(1),
                ),
              ),
              Expanded(
                child: _detailItem(
                  Icons.shield,
                  'Maximum Risk',
                  maximumRisk.toStringAsFixed(1),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          Row(
            children: [
              const Text(
                'Safety Rating: ',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              Text(
                safetyRating,
                style: TextStyle(
                  color: ratingColor,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),

          if (edges.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Divider(),

            const Text(
              'Road-by-road route',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            ...edges.map((edge) {
              final name = edge['name'] ?? 'Road';
              final risk = edge['riskScore'] ?? 'N/A';
              final status = edge['status'] ?? 'Unknown';
              final km = edge['distanceKm'] ?? 'N/A';

              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.directions, color: primaryColor, size: 19),

                    const SizedBox(width: 8),

                    Expanded(
                      child: Text(
                        '$name\n'
                        'Distance: $km km | Risk: $risk | Status: $status',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ],
      ),
    );
  }

  // DETAIL ITEM

  Widget _detailItem(IconData icon, String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: primaryColor, size: 21),

        const SizedBox(width: 8),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(color: Colors.grey, fontSize: 12),
              ),

              const SizedBox(height: 3),

              Text(
                value,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // MAIN SCREEN

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Safe Route Planner',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
      ),

      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),

        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Find a Safer Way',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            const Text(
              'Plan your journey while avoiding potentially flooded areas.',
              style: TextStyle(color: Colors.grey, fontSize: 14),
            ),

            const SizedBox(height: 24),

            const Text(
              'Starting Point',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),

            const SizedBox(height: 8),

            if (isLoadingRoads)
              const Center(child: CircularProgressIndicator())
            else if (availableNodes.isNotEmpty)
              buildLocationDropdown(
                label: 'Select starting point',
                selectedValue: selectedSourceId,
                icon: Icons.my_location,
                onChanged: (value) {
                  setState(() {
                    selectedSourceId = value;
                    routeResponse = null;
                  });
                },
              ),

            const SizedBox(height: 20),

            const Text(
              'Destination',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),

            const SizedBox(height: 8),

            if (availableNodes.isNotEmpty)
              buildLocationDropdown(
                label: 'Select destination',
                selectedValue: selectedDestinationId,
                icon: Icons.location_on,
                onChanged: (value) {
                  setState(() {
                    selectedDestinationId = value;
                    routeResponse = null;
                  });
                },
              ),

            const SizedBox(height: 24),

            const Text(
              'Route Preference',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),

            const SizedBox(height: 12),

            Row(
              children: [
                Expanded(
                  child: ChoiceChip(
                    label: const Text('Safest Route'),
                    selected: selectedRoute == 'Safest',
                    selectedColor: Colors.teal.shade100,
                    onSelected: (_) {
                      setState(() {
                        selectedRoute = 'Safest';
                      });
                    },
                  ),
                ),

                const SizedBox(width: 12),

                Expanded(
                  child: ChoiceChip(
                    label: const Text('Fastest Route'),
                    selected: selectedRoute == 'Fastest',
                    selectedColor: Colors.teal.shade100,
                    onSelected: (_) {
                      setState(() {
                        selectedRoute = 'Fastest';
                      });
                    },
                  ),
                ),
              ],
            ),

            const SizedBox(height: 24),

            const Text(
              'Route Map',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 12),

            SizedBox(
              height: 320,
              width: double.infinity,
              child: buildRouteMap(),
            ),

            const SizedBox(height: 20),

            buildRouteDetails(),

            if (errorMessage != null) ...[
              const SizedBox(height: 12),

              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  errorMessage!,
                  style: TextStyle(color: Colors.red.shade900),
                ),
              ),
            ],

            const SizedBox(height: 20),

            // SAFETY NOTICE
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.orange.shade200),
              ),

              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.warning_amber_rounded,
                    color: Colors.deepOrange,
                    size: 28,
                  ),

                  const SizedBox(width: 12),

                  Expanded(
                    child: Text(
                      'Safety Notice\n'
                      'Avoid waterlogged roads and never cross '
                      'flowing floodwater. Follow official '
                      'emergency instructions. Route results use '
                      'the available road-network data and are '
                      'not a substitute for official emergency guidance.',
                      style: TextStyle(
                        color: Colors.orange.shade900,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // FIND SAFE ROUTE BUTTON
            SizedBox(
              width: double.infinity,
              height: 52,

              child: ElevatedButton.icon(
                onPressed:
                    isLoadingRoads || isFindingRoute || availableNodes.isEmpty
                    ? null
                    : () {
                        debugPrint('FIND SAFE ROUTE BUTTON CLICKED');

                        findRoute();
                      },

                icon: isFindingRoute
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Icon(Icons.alt_route),

                label: Text(
                  isFindingRoute ? 'Calculating Route...' : 'Find Safe Route',

                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                style: ElevatedButton.styleFrom(
                  backgroundColor: primaryColor,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
