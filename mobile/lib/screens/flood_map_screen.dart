import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:material_ui/material_ui.dart';

import '../models/app_models.dart';
import '../services/api_service.dart';
import '../widgets/app_widgets.dart';

class FloodMapScreen extends StatefulWidget {
  const FloodMapScreen({required this.api, super.key});

  final ApiService api;

  @override
  State<FloodMapScreen> createState() => _FloodMapScreenState();
}

class _FloodMapScreenState extends State<FloodMapScreen> {
  RoadNetwork? _network;
  List<CommunityReport> _reports = [];
  bool _loading = true;
  bool _tileError = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _tileError = false;
    });
    try {
      final results = await Future.wait<dynamic>([
        widget.api.fetchRoadNetwork(),
        widget.api.fetchReports(),
      ]);
      if (!mounted) return;
      setState(() {
        _network = results[0] as RoadNetwork;
        _reports = results[1] as List<CommunityReport>;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  LatLng get _center {
    final nodes = _network?.nodes ?? [];
    if (nodes.isEmpty) return const LatLng(18.5204, 73.8567);
    final latitude =
        nodes.map((node) => node.latitude).reduce((a, b) => a + b) /
        nodes.length;
    final longitude =
        nodes.map((node) => node.longitude).reduce((a, b) => a + b) /
        nodes.length;
    return LatLng(latitude, longitude);
  }

  Color _roadColor(RoadSegment road) {
    if (road.status == 'blocked' || road.status == 'critical_waterlogged') {
      return Colors.red;
    }
    return riskColor(road.riskScore);
  }

  @override
  Widget build(BuildContext context) {
    final network = _network;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Flood risk map'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh map data',
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Padding(
              padding: const EdgeInsets.all(16),
              child: ErrorPanel(message: _error!, onRetry: _load),
            )
          : network == null
          ? const EmptyPanel(message: 'Road network data is unavailable.')
          : Column(
              children: [
                if (_tileError)
                  Container(
                    width: double.infinity,
                    color: Colors.amber.shade100,
                    padding: const EdgeInsets.all(8),
                    child: const Text(
                      'Map tiles are unavailable. Road and incident data are shown from the backend; the base map needs internet access.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                SizedBox(
                  height: MediaQuery.sizeOf(context).height * 0.57,
                  child: FlutterMap(
                    options: MapOptions(
                      initialCenter: _center,
                      initialZoom: 11.5,
                      minZoom: 9,
                      maxZoom: 18,
                    ),
                    children: [
                      TileLayer(
                        urlTemplate:
                            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'com.sankatsetu.sankatsetu',
                        maxNativeZoom: 19,
                        errorTileCallback: (_, _, _) {
                          if (mounted && !_tileError) {
                            setState(() => _tileError = true);
                          }
                        },
                      ),
                      PolylineLayer(
                        polylines: network.segments
                            .where((road) => road.coordinates.length >= 2)
                            .map(
                              (road) => Polyline(
                                points: road.coordinates
                                    .map((point) => LatLng(point[0], point[1]))
                                    .toList(),
                                strokeWidth: road.status == 'blocked' ? 7 : 5,
                                color: _roadColor(road),
                              ),
                            )
                            .toList(),
                      ),
                      MarkerLayer(
                        markers: [
                          ...network.nodes.map(
                            (node) => Marker(
                              point: LatLng(node.latitude, node.longitude),
                              width: 30,
                              height: 36,
                              child: Tooltip(
                                message: node.name,
                                child: const Icon(
                                  Icons.location_on,
                                  color: Colors.blueGrey,
                                ),
                              ),
                            ),
                          ),
                          ..._reports
                              .where(
                                (report) =>
                                    report.latitude != 0 &&
                                    report.longitude != 0 &&
                                    report.verificationStatus != 'Rejected',
                              )
                              .map(
                                (report) => Marker(
                                  point: LatLng(
                                    report.latitude,
                                    report.longitude,
                                  ),
                                  width: 38,
                                  height: 42,
                                  child: Tooltip(
                                    message:
                                        '${report.locationName}\n${report.verificationStatus}',
                                    child: Icon(
                                      Icons.warning,
                                      color:
                                          report.verificationStatus ==
                                              'Verified'
                                          ? Colors.red
                                          : Colors.orange,
                                    ),
                                  ),
                                ),
                              ),
                        ],
                      ),
                      RichAttributionWidget(
                        attributions: [
                          TextSourceAttribution('© OpenStreetMap contributors'),
                        ],
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                  child: Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 14,
                    runSpacing: 8,
                    children: [
                      _legend(Colors.green, 'Low risk'),
                      _legend(Colors.orange, 'Medium risk'),
                      _legend(Colors.red, 'High / blocked'),
                      _legend(Colors.blueGrey, 'Road node'),
                      _legend(Colors.deepOrange, 'Community report'),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    children: [
                      const DemoDataNotice(),
                      ...network.segments.map(
                        (road) => ListTile(
                          dense: true,
                          leading: Icon(
                            road.status == 'blocked'
                                ? Icons.block
                                : Icons.route,
                            color: _roadColor(road),
                          ),
                          title: Text(road.name),
                          subtitle: Text(
                            '${riskLabel(road.riskScore)} · ${road.riskScore.toStringAsFixed(0)}/100 · ${road.status}',
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _legend(Color color, String label) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(Icons.circle, size: 12, color: color),
      const SizedBox(width: 4),
      Text(label, style: const TextStyle(fontSize: 11)),
    ],
  );
}
