import 'package:latlong2/latlong.dart';
import 'package:material_ui/material_ui.dart';

import '../models/app_models.dart';
import '../l10n/generated/app_localizations.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../widgets/app_widgets.dart';
import '../widgets/road_network_map.dart';

class FloodMapScreen extends StatefulWidget {
  const FloodMapScreen({required this.api, this.locationService, super.key});

  final ApiService api;
  final LocationService? locationService;

  @override
  State<FloodMapScreen> createState() => _FloodMapScreenState();
}

class _FloodMapScreenState extends State<FloodMapScreen> {
  static const _coverageRadiusMeters = 1000.0;

  RoadNetwork? _network;
  List<CommunityReport> _reports = [];
  bool _loading = true;
  bool _tileError = false;
  bool _roadUnavailable = false;
  bool _reportsUnavailable = false;
  bool _gettingLocation = false;
  String? _locationError;
  LatLng? _currentLocation;
  late final LocationService _locationService;

  @override
  void initState() {
    super.initState();
    _locationService = widget.locationService ?? LocationService();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _roadUnavailable = false;
      _reportsUnavailable = false;
      _tileError = false;
      _network = null;
      _reports = [];
    });
    try {
      final network = await widget.api.fetchRoadNetwork();
      if (!mounted) return;
      setState(() => _network = network);
    } on ApiException {
      if (!mounted) return;
      setState(() => _roadUnavailable = true);
    }
    try {
      final reports = await widget.api.fetchReports();
      if (!mounted) return;
      setState(() => _reports = reports);
    } on ApiException {
      if (!mounted) return;
      setState(() => _reportsUnavailable = true);
    }
    if (mounted) setState(() => _loading = false);
  }

  LatLng get _center {
    final nodes = _network?.nodes ?? [];
    if (_currentLocation case final location?) return location;
    if (nodes.isEmpty) return const LatLng(0, 0);
    final latitude =
        nodes.map((node) => node.latitude).reduce((a, b) => a + b) /
        nodes.length;
    final longitude =
        nodes.map((node) => node.longitude).reduce((a, b) => a + b) /
        nodes.length;
    return LatLng(latitude, longitude);
  }

  bool get _isCurrentLocationCovered {
    final location = _currentLocation;
    if (location == null) return false;
    const distance = Distance();
    return (_network?.nodes ?? const <RoadNode>[]).any(
      (node) =>
          distance.as(
            LengthUnit.Meter,
            location,
            LatLng(node.latitude, node.longitude),
          ) <=
          _coverageRadiusMeters,
    );
  }

  Future<void> _useCurrentLocation() async {
    setState(() {
      _gettingLocation = true;
      _locationError = null;
    });
    try {
      final position = await _locationService.getCurrentPosition();
      if (!mounted) return;
      setState(() {
        _currentLocation = LatLng(position.latitude, position.longitude);
      });
    } on LocationException catch (error) {
      if (!mounted) return;
      setState(
        () => _locationError = error.localizedMessage(
          AppLocalizations.of(context),
        ),
      );
    } finally {
      if (mounted) setState(() => _gettingLocation = false);
    }
  }

  Color _roadColor(RoadSegment road) {
    if (road.status == 'blocked' || road.status == 'critical_waterlogged') {
      return Colors.red;
    }
    return riskColor(road.riskScore);
  }

  bool get _hasStaleRecords {
    final cutoff = DateTime.now().subtract(const Duration(hours: 24));
    return [
      ...?_network?.segments.map((road) => road.lastUpdated),
      ..._reports.map((report) => report.timestamp),
    ].whereType<DateTime>().any((updated) => updated.isBefore(cutoff));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final network = _network;
    final location = _currentLocation;
    final isCovered = _isCurrentLocationCovered;
    final displayNetwork = location == null
        ? network
        : isCovered
        ? network
        : null;
    final displayReports = location != null && !isCovered
        ? const <CommunityReport>[]
        : _reports;
    final hasMapContext =
        location != null ||
        (displayNetwork?.nodes.isNotEmpty ?? false) ||
        displayReports.isNotEmpty;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.floodRiskMap),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
            tooltip: l10n.refreshMapData,
          ),
        ],
      ),
      body: Column(
        children: [
          if (_loading) const LinearProgressIndicator(),
          if (_roadUnavailable || _reportsUnavailable)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.cloud_off_outlined),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _roadUnavailable
                              ? l10n.mapUnavailable
                              : l10n.searchPartialUnavailable,
                        ),
                      ),
                      TextButton(
                        onPressed: _loading ? null : _load,
                        child: Text(l10n.retry),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          if (_tileError)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: Text(l10n.mapTilesError),
            ),
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.48,
            child: Stack(
              children: [
                if (hasMapContext)
                  RoadNetworkMap(
                    center: _center,
                    zoom: 11.5,
                    network: displayNetwork,
                    reports: displayReports,
                    currentLocation: location,
                    onTileError: () {
                      if (mounted && !_tileError) {
                        setState(() => _tileError = true);
                      }
                    },
                  )
                else
                  ColoredBox(
                    color: Theme.of(context).colorScheme.surfaceContainerHigh,
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: EmptyPanel(message: l10n.noRoadNetwork),
                      ),
                    ),
                  ),
                PositionedDirectional(
                  top: 10,
                  end: 10,
                  child: FilledButton.tonalIcon(
                    onPressed: _gettingLocation ? null : _useCurrentLocation,
                    icon: _gettingLocation
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.my_location),
                    label: Text(l10n.useCurrentLocation),
                  ),
                ),
              ],
            ),
          ),
          if (location != null && !isCovered)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
              child: Text(
                l10n.mapOutsideCoverage,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          if (_locationError != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                _locationError!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: Wrap(
              alignment: WrapAlignment.center,
              spacing: 14,
              runSpacing: 8,
              children: [
                _legend(Colors.green, l10n.lowRiskLegend),
                _legend(Colors.orange, l10n.mediumRiskLegend),
                _legend(Colors.red, l10n.highRiskLegend),
                _legend(Colors.blueGrey, l10n.roadNode),
                _legend(Colors.deepOrange, l10n.communityReportLegend),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                if (displayNetwork != null || displayReports.isNotEmpty) ...[
                  const DemoDataNotice(),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(
                      _hasStaleRecords ? l10n.mapStaleData : l10n.mapStaticData,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ]                 else if (!_loading && hasMapContext)
                  EmptyPanel(message: l10n.noRoadNetwork),
                ...?displayNetwork?.segments.map(
                  (road) => ListTile(
                    dense: true,
                    leading: Icon(
                      road.status == 'blocked' ? Icons.block : Icons.route,
                      color: _roadColor(road),
                    ),
                    title: Text(road.name),
                    subtitle: Text(
                      '${road.riskScore >= 60
                          ? l10n.highRisk
                          : road.riskScore >= 30
                          ? l10n.mediumRisk
                          : l10n.lowRisk} · ${road.riskScore.toStringAsFixed(0)}/100 · ${_localizedRoadStatus(l10n, road.status)}',
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

  String _localizedRoadStatus(AppLocalizations l10n, String status) =>
      switch (status) {
        'blocked' => l10n.blockedRoad,
        'critical_waterlogged' => l10n.criticalWaterlogging,
        'caution' => l10n.caution,
        'clear' => l10n.clear,
        _ => status,
      };
}
