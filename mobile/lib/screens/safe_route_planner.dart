import 'package:material_ui/material_ui.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:http/http.dart' as http;

import '../l10n/generated/app_localizations.dart';
import '../models/app_models.dart';
import '../services/api_service.dart';
import '../services/app_storage.dart';
import '../services/location_service.dart';
import '../widgets/app_widgets.dart';

class SafeRoutePlannerScreen extends StatefulWidget {
  const SafeRoutePlannerScreen({
    super.key,
    this.client,
    this.api,
    this.storage,
    this.locationService,
  });

  final http.Client? client;
  final ApiService? api;
  final AppStorage? storage;
  final LocationService? locationService;

  @override
  State<SafeRoutePlannerScreen> createState() => _SafeRoutePlannerScreenState();
}

class _SafeRoutePlannerScreenState extends State<SafeRoutePlannerScreen> {
  static const Color primaryColor = Color(0xFF087E8B);
  static const double _maximumGpsSnapDistanceKm = 5;

  late final ApiService _api;
  late final bool _ownsApi;
  late final LocationService _locationService;
  String get baseUrl => _api.baseUrl;

  String? selectedSourceId;
  String? selectedDestinationId;
  LatLng? detectedLocation;

  String selectedRoute = 'Safest';

  List<Map<String, dynamic>> availableNodes = [];

  Map<String, dynamic>? routeResponse;

  bool isLoadingRoads = true;
  bool isFindingRoute = false;
  bool isGettingLocation = false;
  bool mapTileError = false;

  String? errorMessage;
  String? roadsErrorMessage;
  String? statusMessage;
  String? locationMessage;
  bool locationMessageIsError = false;

  @override
  void initState() {
    super.initState();
    _api = widget.api ?? ApiService(client: widget.client);
    _ownsApi = widget.api == null;
    _locationService = widget.locationService ?? LocationService();
    fetchRoads();
  }

  @override
  void dispose() {
    if (_ownsApi) _api.close();
    super.dispose();
  }

  // FETCH ROAD LOCATIONS

  Future<void> fetchRoads() async {
    setState(() {
      isLoadingRoads = true;
      roadsErrorMessage = null;
    });

    try {
      final network = await _api.fetchRoadNetwork();
      final loadedNodes = network.nodes
          .map(
            (node) => <String, dynamic>{
              'id': node.id,
              'name': node.name,
              'lat': node.latitude,
              'lng': node.longitude,
            },
          )
          .toList();

      if (!mounted) return;

      if (loadedNodes.isEmpty) {
        setState(() {
          availableNodes = [];
          selectedSourceId = null;
          selectedDestinationId = null;
          isLoadingRoads = false;
        });
        return;
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
        roadsErrorMessage = null;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      final l10n = AppLocalizations.of(context);

      setState(() {
        isLoadingRoads = false;
        roadsErrorMessage =
            '${l10n.networkUnavailable} ($baseUrl).\n${error.localizedMessage(l10n)}';
      });
    }
  }

  // GET CURRENT ROUTE

  Map<String, dynamic>? get currentRoute {
    if (routeResponse == null) return null;

    final canonicalKey = selectedRoute == 'Safest'
        ? 'safestRoute'
        : 'shortestRoute';
    final backendKey = selectedRoute == 'Safest' ? 'safest' : 'shortest';
    final result = routeResponse![canonicalKey] ?? routeResponse![backendKey];

    if (result is! Map) return null;
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

    if (points.isNotEmpty) {
      if (detectedLocation != null) points.add(detectedLocation!);
      return points;
    }

    final start = getNodePosition(getNodeById(selectedSourceId));

    final end = getNodePosition(getNodeById(selectedDestinationId));

    return [?start, ?end, ?detectedLocation];
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
    final l10n = AppLocalizations.of(context);
    if (selectedSourceId == null || selectedDestinationId == null) {
      return;
    }

    if (selectedSourceId == selectedDestinationId) {
      setState(() {
        statusMessage = l10n.differentRoutePoints;
      });
      return;
    }

    setState(() {
      isFindingRoute = true;
      routeResponse = null;
      errorMessage = null;
      statusMessage = null;
    });

    try {
      final data = await _api.findRoute(
        startNodeId: selectedSourceId!,
        targetNodeId: selectedDestinationId!,
      );

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
        setState(() {
          statusMessage = route['message']?.toString() ?? l10n.routeNotFound;
        });
      }
    } on ApiException catch (error) {
      if (!mounted) return;

      setState(() {
        isFindingRoute = false;
        errorMessage = '${l10n.getRouteError}\n${error.localizedMessage(l10n)}';
      });
    }
  }

  Future<void> useCurrentLocation() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      isGettingLocation = true;
      locationMessage = null;
      locationMessageIsError = false;
    });

    try {
      final position = await _locationService.getCurrentPosition();
      if (!mounted) return;

      final gpsLocation = LatLng(position.latitude, position.longitude);
      Map<String, dynamic>? nearestNode;
      var nearestDistanceKm = double.infinity;

      for (final node in availableNodes) {
        final nodePosition = getNodePosition(node);
        if (nodePosition == null) continue;

        final distanceKm = const Distance().as(
          LengthUnit.Kilometer,
          gpsLocation,
          nodePosition,
        );
        if (distanceKm < nearestDistanceKm) {
          nearestNode = node;
          nearestDistanceKm = distanceKm;
        }
      }

      final closestNode = nearestNode;
      if (closestNode == null) {
        setState(() {
          detectedLocation = gpsLocation;
          selectedSourceId = null;
          routeResponse = null;
          locationMessageIsError = true;
          locationMessage =
              '${l10n.detectedGpsLocation(_formatCoordinates(gpsLocation))} '
              '${l10n.nearestRoadNodeUnavailable}';
        });
        return;
      }

      if (nearestDistanceKm > _maximumGpsSnapDistanceKm) {
        setState(() {
          detectedLocation = gpsLocation;
          selectedSourceId = null;
          routeResponse = null;
          locationMessageIsError = true;
          locationMessage =
              '${l10n.detectedGpsLocation(_formatCoordinates(gpsLocation))} '
              '${l10n.outsideRoadNetwork(closestNode['name'].toString(), nearestDistanceKm.toStringAsFixed(2), _maximumGpsSnapDistanceKm.toStringAsFixed(0))}';
        });
        return;
      }

      final selectedNode = closestNode;
      setState(() {
        detectedLocation = gpsLocation;
        selectedSourceId = selectedNode['id'].toString();
        routeResponse = null;
        locationMessageIsError = false;
        locationMessage =
            '${l10n.detectedGpsLocation(_formatCoordinates(gpsLocation))}\n'
            '${l10n.selectedStartingNode(selectedNode['name'].toString(), nearestDistanceKm.toStringAsFixed(2))}';
      });
    } on LocationException catch (error) {
      if (!mounted) return;
      setState(() {
        locationMessage = error.localizedMessage(l10n);
        locationMessageIsError = true;
      });
    } finally {
      if (mounted) setState(() => isGettingLocation = false);
    }
  }

  String _formatCoordinates(LatLng location) =>
      '${location.latitude.toStringAsFixed(5)}, '
      '${location.longitude.toStringAsFixed(5)}';

  String _localizedRoadStatus(AppLocalizations l10n, Object? value) {
    final status = value?.toString();
    if (status == null) return l10n.unknown;
    return switch (status) {
      'blocked' => l10n.blockedRoad,
      'critical_waterlogged' => l10n.criticalWaterlogging,
      'caution' => l10n.caution,
      'clear' => l10n.clear,
      'unknown' || 'Unknown' => l10n.unknown,
      _ => status,
    };
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
      menuMaxHeight: MediaQuery.sizeOf(context).height * 0.6,
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

    if (detectedLocation != null) {
      markers.add(
        Marker(
          point: detectedLocation!,
          width: 45,
          height: 50,
          child: const Icon(Icons.my_location, color: Colors.blue, size: 32),
        ),
      );
    }

    debugPrint('MAP ROUTE POINTS: ${points.length}');

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: FlutterMap(
        key: ValueKey(
          '${selectedSourceId}_${selectedDestinationId}_'
          '${selectedRoute}_${routeResponse == null}_'
          '${detectedLocation?.latitude}_${detectedLocation?.longitude}',
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
            userAgentPackageName: 'com.sankatsetu.sankatsetu',
            maxNativeZoom: 19,
            errorTileCallback: (_, _, _) {
              if (mounted && !mapTileError) {
                setState(() => mapTileError = true);
              }
            },
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
    final l10n = AppLocalizations.of(context);
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
          route['message']?.toString() ?? l10n.noFeasibleRoute,
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
    final containsBlockedRoad = edges.any(
      (edge) => edge is Map && edge['status'] == 'blocked',
    );

    final ratingColor = containsBlockedRoad
        ? Colors.red
        : safetyRating == 'Safe'
        ? Colors.green
        : safetyRating == 'Moderate'
        ? Colors.orange
        : Colors.red;
    final ratingLabel = containsBlockedRoad
        ? l10n.blockedRoad
        : safetyRating == 'Safe'
        ? l10n.safe
        : safetyRating == 'Moderate'
        ? l10n.medium
        : safetyRating == 'Unknown'
        ? l10n.unknown
        : safetyRating;

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
            l10n.routeDetails(
              selectedRoute == 'Safest'
                  ? l10n.routePreferenceSafest
                  : l10n.routePreferenceShortest,
            ),
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          if (containsBlockedRoad) ...[
            const SizedBox(height: 8),
            Text(
              l10n.blockedRouteWarning,
              style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
            ),
          ],

          const SizedBox(height: 16),

          Row(
            children: [
              Expanded(
                child: _detailItem(
                  Icons.route,
                  l10n.distance,
                  '${distance.toStringAsFixed(2)} km',
                ),
              ),
              Expanded(
                child: _detailItem(
                  Icons.access_time,
                  l10n.estimatedTime,
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
                  l10n.averageRisk,
                  averageRisk.toStringAsFixed(1),
                ),
              ),
              Expanded(
                child: _detailItem(
                  Icons.shield,
                  l10n.maximumRisk,
                  maximumRisk.toStringAsFixed(1),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          Row(
            children: [
              Text(
                '${l10n.safetyRating}: ',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              Text(
                ratingLabel,
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

            Text(
              l10n.roadByRoad,
              style: TextStyle(fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            ...edges.map((edge) {
              final name = edge['name'] ?? l10n.road;
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
                        '${l10n.distance}: $km km | ${l10n.risk}: $risk | ${l10n.status}: ${_localizedRoadStatus(l10n, status)}',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
          if (widget.storage != null) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _saveCurrentRoute,
              icon: const Icon(Icons.bookmark_add_outlined),
              label: Text(l10n.saveRouteDevice),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _saveCurrentRoute() async {
    final l10n = AppLocalizations.of(context);
    final route = currentRoute;
    final storage = widget.storage;
    if (route == null || storage == null) return;
    final nodeNames = (route['nodes'] as List<dynamic>? ?? [])
        .whereType<Map>()
        .map((node) => node['name']?.toString())
        .whereType<String>()
        .toList();
    final details = [
      '${l10n.preference}: ${selectedRoute == 'Safest' ? l10n.routePreferenceSafest : l10n.routePreferenceShortest}',
      '${l10n.path}: ${nodeNames.join(' → ')}',
      '${l10n.distance}: ${route['totalDistanceKm'] ?? l10n.notProvided} km',
      '${l10n.estimatedTime}: ${route['travelTimeMins'] ?? l10n.notProvided} minutes',
      '${l10n.averageRisk}: ${route['averageRiskScore'] ?? l10n.notProvided}',
      '${l10n.maximumRisk}: ${route['maxRiskScore'] ?? l10n.notProvided}',
      '${l10n.safetyRating}: ${route['safetyRating'] ?? l10n.notProvided}',
      l10n.routeNotLiveNavigation,
    ].join('\n');
    try {
      await storage.saveItem(
        SavedItem(
          id: 'route:${selectedSourceId}_$selectedDestinationId',
          type: 'route',
          title: l10n.routeDetails(
            selectedRoute == 'Safest'
                ? l10n.routePreferenceSafest
                : l10n.routePreferenceShortest,
          ),
          details: details,
          savedAt: DateTime.now(),
        ),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(l10n.routeSaved)));
    } on Exception catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.saveRouteError(error.toString()))),
      );
    }
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
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          l10n.safeRouteTitle,
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
      ),

      resizeToAvoidBottomInset: true,
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.findSaferWay,
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 8),

              Text(
                l10n.routeIntro,
                style: TextStyle(color: Colors.grey, fontSize: 14),
              ),

              const SizedBox(height: 8),
              DemoDataNotice(text: l10n.staticNetworkNotice),

              const SizedBox(height: 8),

              Text(
                'Backend: $baseUrl',
                key: const ValueKey('backend-api-url'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.grey, fontSize: 11),
              ),

              const SizedBox(height: 24),

              Text(
                l10n.startingPoint,
                style: TextStyle(fontWeight: FontWeight.w600),
              ),

              const SizedBox(height: 8),

              if (isLoadingRoads)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    children: [
                      const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          l10n.loadingLocations(baseUrl),
                          style: const TextStyle(color: Colors.grey),
                        ),
                      ),
                    ],
                  ),
                )
              else if (roadsErrorMessage != null)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        roadsErrorMessage!,
                        style: TextStyle(color: Colors.red.shade900),
                      ),
                      const SizedBox(height: 8),
                      TextButton.icon(
                        onPressed: isLoadingRoads ? null : fetchRoads,
                        icon: const Icon(Icons.refresh),
                        label: Text(l10n.retryLoadingLocations),
                      ),
                    ],
                  ),
                )
              else if (availableNodes.isEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      Expanded(child: Text(l10n.noRoadLocations)),
                      TextButton.icon(
                        onPressed: isLoadingRoads ? null : fetchRoads,
                        icon: const Icon(Icons.refresh),
                        label: Text(l10n.retry),
                      ),
                    ],
                  ),
                )
              else
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    buildLocationDropdown(
                      label: l10n.selectStartingPoint,
                      selectedValue: selectedSourceId,
                      icon: Icons.my_location,
                      onChanged: (value) {
                        setState(() {
                          selectedSourceId = value;
                          detectedLocation = null;
                          locationMessage = null;
                          routeResponse = null;
                        });
                      },
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed:
                          isGettingLocation ||
                              isFindingRoute ||
                              isLoadingRoads ||
                              availableNodes.isEmpty
                          ? null
                          : useCurrentLocation,
                      icon: isGettingLocation
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.my_location),
                      label: Text(
                        isGettingLocation
                            ? l10n.gettingCurrentLocation
                            : l10n.useCurrentLocation,
                      ),
                    ),
                    if (locationMessage != null) ...[
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: locationMessageIsError
                              ? Colors.red.shade50
                              : Colors.teal.shade50,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: locationMessageIsError
                                ? Colors.red.shade200
                                : Colors.teal.shade100,
                          ),
                        ),
                        child: Text(
                          locationMessage!,
                          style: TextStyle(
                            color: locationMessageIsError
                                ? Colors.red.shade900
                                : Colors.teal.shade900,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),

              if (availableNodes.isNotEmpty && !isLoadingRoads) ...[
                const SizedBox(height: 20),
                Text(
                  l10n.destination,
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                buildLocationDropdown(
                  label: l10n.selectDestination,
                  selectedValue: selectedDestinationId,
                  icon: Icons.location_on,
                  onChanged: (value) {
                    setState(() {
                      selectedDestinationId = value;
                      routeResponse = null;
                    });
                  },
                ),
              ],

              const SizedBox(height: 24),

              Text(
                l10n.routePreference,
                style: TextStyle(fontWeight: FontWeight.w600),
              ),

              const SizedBox(height: 12),

              Row(
                children: [
                  Expanded(
                    child: ChoiceChip(
                      label: Text(l10n.safestRoute),
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
                      label: Text(l10n.shortestRoute),
                      selected: selectedRoute == 'Shortest',
                      selectedColor: Colors.teal.shade100,
                      onSelected: (_) {
                        setState(() {
                          selectedRoute = 'Shortest';
                        });
                      },
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              Text(
                l10n.routeMap,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 12),

              SizedBox(
                height: 220,
                width: double.infinity,
                child: buildRouteMap(),
              ),
              if (mapTileError) ...[
                const SizedBox(height: 6),
                Text(
                  l10n.routeTilesUnavailable,
                  style: TextStyle(color: Colors.orange, fontSize: 12),
                ),
              ],

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
                        l10n.routeSafetyNotice,
                        style: TextStyle(
                          color: Colors.orange.shade900,
                          height: 1.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: AnimatedPadding(
        duration: const Duration(milliseconds: 150),
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (statusMessage != null) ...[
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Semantics(
                      liveRegion: true,
                      child: Text(
                        statusMessage!,
                        style: const TextStyle(color: Colors.deepOrange),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                ],
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed:
                        isLoadingRoads ||
                            isFindingRoute ||
                            availableNodes.isEmpty ||
                            selectedSourceId == null ||
                            selectedDestinationId == null
                        ? null
                        : findRoute,
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
                      isFindingRoute
                          ? l10n.calculatingRoute
                          : l10n.findSafeRoute,
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
        ),
      ),
    );
  }
}
