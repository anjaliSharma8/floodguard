import 'package:latlong2/latlong.dart';
import 'package:material_ui/material_ui.dart';
import 'package:geolocator/geolocator.dart';

import '../l10n/generated/app_localizations.dart';
import '../models/app_models.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../widgets/app_widgets.dart';
import '../widgets/road_network_map.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    required this.api,
    required this.onOpenSettings,
    required this.onOpenSearch,
    required this.onOpenFeature,
    required this.isSignedIn,
    required this.isGuest,
    this.locationService,
    super.key,
  });

  final ApiService api;
  final VoidCallback onOpenSettings;
  final VoidCallback onOpenSearch;
  final ValueChanged<String> onOpenFeature;
  final bool isSignedIn;
  final bool isGuest;
  final LocationService? locationService;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const _coverageRadiusMeters = 1000.0;
  static const _staleAfter = Duration(hours: 24);

  late final LocationService _locationService =
      widget.locationService ?? LocationService();
  RoadNetwork? _network;
  List<CommunityReport> _reports = [];
  Position? _position;
  bool _loadingMapData = true;
  bool _gettingLocation = false;
  bool _reportsUnavailable = false;
  bool _locationUnavailable = false;
  bool _infoExpanded = true;
  bool _tileUnavailable = false;
  bool _mapUnavailable = false;

  @override
  void initState() {
    super.initState();
    _loadMapData();
    _loadExistingLocation();
  }

  Future<(RoadNetwork?, bool)> _fetchRoadNetwork() async {
    try {
      return (await widget.api.fetchRoadNetwork(), false);
    } on ApiException {
      return (null, true);
    }
  }

  Future<(List<CommunityReport>, bool)> _fetchReports() async {
    try {
      return (await widget.api.fetchReports(), false);
    } on ApiException {
      return (<CommunityReport>[], true);
    }
  }

  Future<void> _loadMapData() async {
    if (mounted) {
      setState(() {
        _loadingMapData = true;
        _mapUnavailable = false;
        _reportsUnavailable = false;
        _tileUnavailable = false;
      });
    }
    final results = await Future.wait<Object>([
      _fetchRoadNetwork(),
      _fetchReports(),
    ]);
    if (!mounted) return;
    final (network, networkFailed) = results[0] as (RoadNetwork?, bool);
    final (reports, reportsFailed) =
        results[1] as (List<CommunityReport>, bool);
    setState(() {
      _network = network;
      _reports = reports;
      _loadingMapData = false;
      _mapUnavailable = networkFailed;
      _reportsUnavailable = reportsFailed;
    });
  }

  Future<void> _loadExistingLocation() async {
    try {
      final position = await _locationService
          .getCurrentPositionIfPermissionGranted();
      if (!mounted) return;
      setState(() {
        _position = position;
        _locationUnavailable = position == null;
      });
    } on LocationException {
      if (!mounted) return;
      setState(() => _locationUnavailable = true);
    }
  }

  Future<void> _useCurrentLocation() async {
    setState(() {
      _gettingLocation = true;
      _locationUnavailable = false;
    });
    try {
      final position = await _locationService.getCurrentPosition();
      if (!mounted) return;
      setState(() {
        _position = position;
        _locationUnavailable = false;
      });
    } on LocationException catch (error) {
      if (!mounted) return;
      setState(() => _locationUnavailable = true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.localizedMessage(AppLocalizations.of(context))),
        ),
      );
    } finally {
      if (mounted) setState(() => _gettingLocation = false);
    }
  }

  (RoadNode, double)? _nearestNode(Position position) {
    final nodes = _network?.nodes ?? const <RoadNode>[];
    if (nodes.isEmpty) return null;
    final current = LatLng(position.latitude, position.longitude);
    RoadNode? nearest;
    var distance = double.infinity;
    final measure = const Distance();
    for (final node in nodes) {
      final candidate = measure.as(
        LengthUnit.Meter,
        current,
        LatLng(node.latitude, node.longitude),
      );
      if (candidate < distance) {
        nearest = node;
        distance = candidate;
      }
    }
    return nearest == null ? null : (nearest, distance);
  }

  RoadSegment? _nearestSegment(RoadNode node, Position position) {
    final candidates = (_network?.segments ?? const <RoadSegment>[])
        .where((road) => road.from == node.id || road.to == node.id)
        .toList();
    if (candidates.isEmpty) return null;
    final current = LatLng(position.latitude, position.longitude);
    final measure = const Distance();
    candidates.sort((a, b) {
      double distanceTo(RoadSegment road) {
        if (road.coordinates.isEmpty) return double.infinity;
        return road.coordinates
            .map(
              (point) => measure.as(
                LengthUnit.Meter,
                current,
                LatLng(point[0], point[1]),
              ),
            )
            .reduce((first, second) => first < second ? first : second);
      }

      return distanceTo(a).compareTo(distanceTo(b));
    });
    return candidates.first;
  }

  List<CommunityReport> _nearbyReports(Position position) {
    final current = LatLng(position.latitude, position.longitude);
    const measure = Distance();
    return _reports
        .where(
          (report) =>
              report.verificationStatus != 'Rejected' &&
              report.latitude != 0 &&
              report.longitude != 0 &&
              measure.as(
                    LengthUnit.Meter,
                    current,
                    LatLng(report.latitude, report.longitude),
                  ) <=
                  _coverageRadiusMeters,
        )
        .toList();
  }

  String _localizedRoadStatus(AppLocalizations l10n, String status) =>
      switch (status.toLowerCase()) {
        'blocked' => l10n.blockedRoad,
        'critical_waterlogged' => l10n.criticalWaterlogging,
        'caution' => l10n.caution,
        'clear' => l10n.clear,
        _ => status,
      };

  String _dataFreshness(
    AppLocalizations l10n,
    RoadSegment? road,
    List<CommunityReport> reports,
  ) {
    final updateTimes = [
      if (road?.lastUpdated != null) road!.lastUpdated!,
      ...reports.map((report) => report.timestamp).whereType<DateTime>(),
    ];
    if (updateTimes.any(
      (updated) => DateTime.now().difference(updated.toLocal()) > _staleAfter,
    )) {
      return l10n.mapStaleData;
    }
    return l10n.mapStaticData;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final position = _position;
    final nearest = position == null ? null : _nearestNode(position);
    final isCovered = nearest != null && nearest.$2 <= _coverageRadiusMeters;
    final nearbyRoad = position != null && nearest != null && isCovered
        ? _nearestSegment(nearest.$1, position)
        : null;
    final nearbyReports = position != null && isCovered
        ? _nearbyReports(position)
        : const <CommunityReport>[];

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        titleSpacing: 12,
        title: Row(
          children: [
            Image.asset(
              'assets/sankatsetu_logo.png',
              key: const ValueKey('home-logo'),
              width: 44,
              height: 44,
              fit: BoxFit.contain,
              semanticLabel: 'SankatSetu logo',
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                l10n.appTitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: textTheme.titleMedium?.copyWith(
                  color: sankatInk,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: l10n.searchTitle,
            onPressed: widget.onOpenSearch,
            icon: const Icon(Icons.search),
          ),
          IconButton(
            tooltip: l10n.alerts,
            onPressed: () => widget.onOpenFeature('alerts'),
            icon: const Icon(Icons.notifications_none_outlined),
          ),
          IconButton(
            tooltip: l10n.settings,
            onPressed: widget.onOpenSettings,
            icon: const Icon(Icons.settings_outlined),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadMapData,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
          children: [
            Text(
              l10n.welcome,
              style: textTheme.titleMedium?.copyWith(
                color: sankatInk,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 12),
            _sectionHeading(l10n.mapPreviewTitle, textTheme),
            const SizedBox(height: 8),
            _buildMapPreview(
              context,
              l10n,
              position: position,
              nearest: nearest,
              isCovered: isCovered,
              nearbyRoad: nearbyRoad,
              nearbyReports: nearbyReports,
            ),
            if (_mapUnavailable) ...[
              const SizedBox(height: 8),
              _CompactError(
                message: l10n.mapUnavailable,
                onRetry: _loadMapData,
                onGuide: () => widget.onOpenFeature('guide'),
              ),
            ] else if (_reportsUnavailable && isCovered) ...[
              const SizedBox(height: 6),
              Text(
                l10n.searchPartialUnavailable,
                style: textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceVariant,
                ),
              ),
            ],
            const SizedBox(height: 16),
            _sectionHeading(l10n.emergencyActions, textTheme),
            const SizedBox(height: 8),
            _EmergencyActionCard(
              icon: Icons.emergency,
              title: l10n.emergencyAssistance,
              subtitle: l10n.findEmergencyHelp,
              color: colors.primary,
              emphasized: true,
              onTap: () => widget.onOpenFeature('emergency'),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _EmergencyActionCard(
                    icon: Icons.alt_route,
                    title: l10n.safeRoutes,
                    subtitle: l10n.compareRoutes,
                    color: colors.primary,
                    onTap: () => widget.onOpenFeature('routes'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _EmergencyActionCard(
                    icon: Icons.home_work_outlined,
                    title: l10n.shelters,
                    subtitle: l10n.findShelterDescription,
                    color: const Color(0xFF356859),
                    onTap: () => widget.onOpenFeature('shelter'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _EmergencyActionCard(
                    icon: Icons.campaign_outlined,
                    title: l10n.reportHazard,
                    subtitle: l10n.reportHazardDescription,
                    color: const Color(0xFF8A4B08),
                    onTap: () => widget.onOpenFeature('reports'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _sectionHeading(l10n.moreTools, textTheme),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                _ToolChip(
                  icon: Icons.warning_amber_outlined,
                  label: l10n.alerts,
                  onPressed: () => widget.onOpenFeature('alerts'),
                ),
                _ToolChip(
                  icon: Icons.bookmark_outline,
                  label: l10n.savedInfo,
                  onPressed: () => widget.onOpenFeature('saved'),
                ),
                _ToolChip(
                  icon: Icons.menu_book_outlined,
                  label: l10n.offlineGuide,
                  onPressed: () => widget.onOpenFeature('guide'),
                ),
                _ToolChip(
                  icon: Icons.chat_bubble_outline,
                  label: l10n.assistant,
                  onPressed: () => widget.onOpenFeature('assistant'),
                ),
              ],
            ),
            const SizedBox(height: 14),
            if (widget.isGuest)
              Text(
                l10n.guestAccessActive,
                style: textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceVariant,
                ),
              )
            else if (widget.isSignedIn)
              Text(
                l10n.signedInNotice,
                style: textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceVariant,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _sectionHeading(String text, TextTheme textTheme) => Text(
    text,
    style: textTheme.titleLarge?.copyWith(
      color: sankatInk,
      fontWeight: FontWeight.bold,
    ),
  );

  Widget _buildMapPreview(
    BuildContext context,
    AppLocalizations l10n, {
    required Position? position,
    required (RoadNode, double)? nearest,
    required bool isCovered,
    required RoadSegment? nearbyRoad,
    required List<CommunityReport> nearbyReports,
  }) {
    final currentPosition = position == null
        ? null
        : LatLng(position.latitude, position.longitude);
    final safeToShowNetwork = isCovered && !_mapUnavailable;
    final center = currentPosition ?? const LatLng(0, 0);

    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(22),
          child: SizedBox(
            height: _infoExpanded ? 260 : 315,
            child: Stack(
              fit: StackFit.expand,
              children: [
                ColoredBox(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  child: position == null
                      ? _LocationRequired(
                          message: l10n.mapLocationNeeded,
                          loading: _gettingLocation,
                          onUseLocation: _useCurrentLocation,
                        )
                      : RoadNetworkMap(
                          center: center,
                          zoom: 13,
                          network: safeToShowNetwork ? _network : null,
                          reports: safeToShowNetwork ? nearbyReports : const [],
                          currentLocation: currentPosition,
                          onTileError: () {
                            if (mounted && !_tileUnavailable) {
                              setState(() => _tileUnavailable = true);
                            }
                          },
                        ),
                ),
                if (position != null)
                  Positioned(
                    top: 8,
                    right: 8,
                    width: MediaQuery.sizeOf(context).width > 390 ? 250 : 220,
                    child: _MapInfoCard(
                      expanded: _infoExpanded,
                      title: nearest != null && isCovered
                          ? nearest.$1.name
                          : l10n.mapCurrentLocation,
                      coordinates:
                          '${position.latitude.toStringAsFixed(4)}, '
                          '${position.longitude.toStringAsFixed(4)}',
                      status: _loadingMapData
                          ? l10n.loading
                          : _mapUnavailable || _network == null
                          ? l10n.mapUnavailable
                          : !isCovered
                          ? l10n.mapOutsideCoverage
                          : _dataFreshness(l10n, nearbyRoad, nearbyReports),
                      risk: _loadingMapData || !isCovered
                          ? null
                          : nearbyRoad == null
                          ? l10n.mapRiskUnavailable
                          : '${nearbyRoad.name}: '
                                '${_localizedRoadStatus(l10n, nearbyRoad.status)}'
                                ' · ${nearbyRoad.riskScore.toStringAsFixed(0)}/100',
                      riskContext: nearbyRoad == null || !isCovered
                          ? null
                          : l10n.mapRiskContext,
                      hazard: nearbyReports.isEmpty
                          ? _reportsUnavailable
                                ? null
                                : l10n.mapNoHazards
                          : '${l10n.mapKnownHazards}: '
                                '${localizedReportType(l10n, nearbyReports.first.reportType)}',
                      source: !isCovered || _mapUnavailable
                          ? null
                          : '${l10n.source}: ${l10n.mapRoadNetworkSource}'
                                '${nearbyReports.isEmpty ? '' : ' · ${l10n.reports}'}',
                      updated: nearbyRoad?.lastUpdated == null
                          ? null
                          : '${l10n.updated}: '
                                '${formatTimestamp(nearbyRoad!.lastUpdated, unavailable: '')}',
                      onToggle: () =>
                          setState(() => _infoExpanded = !_infoExpanded),
                      onDetails: () => widget.onOpenFeature('map'),
                    ),
                  ),
                if (_loadingMapData && position != null)
                  const Positioned(
                    left: 12,
                    bottom: 12,
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                if (_tileUnavailable && position != null)
                  Positioned(
                    left: 10,
                    bottom: 8,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.9),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        child: Text(
                          l10n.mapTilesError,
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              position == null
                  ? _locationUnavailable
                        ? l10n.mapLocationUnavailable
                        : l10n.mapLocationNeeded
                  : _loadingMapData
                  ? l10n.loading
                  : _mapUnavailable || _network == null
                  ? l10n.mapUnavailable
                  : isCovered
                  ? '${l10n.mapCurrentLocation}: '
                        '${position.latitude.toStringAsFixed(4)}, '
                        '${position.longitude.toStringAsFixed(4)}'
                  : l10n.mapOutsideCoverage,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (position == null)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton(
                  onPressed: _gettingLocation ? null : _useCurrentLocation,
                  child: Text(
                    l10n.mapUseLocation,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            TextButton(
              onPressed: () => widget.onOpenFeature('map'),
              child: Row(
                children: [
                  const Icon(Icons.open_in_full, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      l10n.viewFullRiskMap,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _LocationRequired extends StatelessWidget {
  const _LocationRequired({
    required this.message,
    required this.loading,
    required this.onUseLocation,
  });

  final String message;
  final bool loading;
  final VoidCallback onUseLocation;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.location_searching, size: 34),
          const SizedBox(height: 8),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          FilledButton.tonalIcon(
            onPressed: loading ? null : onUseLocation,
            icon: loading
                ? const SizedBox(
                    height: 16,
                    width: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.my_location),
            label: Text(AppLocalizations.of(context).mapUseLocation),
          ),
        ],
      ),
    ),
  );
}

class _MapInfoCard extends StatelessWidget {
  const _MapInfoCard({
    required this.expanded,
    required this.title,
    required this.coordinates,
    required this.status,
    required this.risk,
    required this.riskContext,
    required this.hazard,
    required this.source,
    required this.updated,
    required this.onToggle,
    required this.onDetails,
  });

  final bool expanded;
  final String title;
  final String coordinates;
  final String status;
  final String? risk;
  final String? riskContext;
  final String? hazard;
  final String? source;
  final String? updated;
  final VoidCallback onToggle;
  final VoidCallback onDetails;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final riskText = risk;
    final riskContextText = riskContext;
    final hazardText = hazard;
    final sourceText = source;
    final updatedText = updated;
    final metadataText = [
      sourceText,
      updatedText,
    ].whereType<String>().join(' · ');
    return Card(
      margin: EdgeInsets.zero,
      elevation: 4,
      color: Colors.white.withValues(alpha: 0.96),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 8, 6, 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.location_on, size: 17, color: sankatPrimary),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelLarge
                        ?.copyWith(fontWeight: FontWeight.bold),
                  ),
                ),
                IconButton(
                  tooltip: expanded ? l10n.mapCollapseInfo : l10n.mapExpandInfo,
                  visualDensity: VisualDensity.compact,
                  constraints: const BoxConstraints.tightFor(
                    width: 34,
                    height: 34,
                  ),
                  onPressed: onToggle,
                  icon: Icon(
                    expanded ? Icons.expand_less : Icons.expand_more,
                    size: 20,
                  ),
                ),
              ],
            ),
            Text(coordinates, style: Theme.of(context).textTheme.labelSmall),
            const SizedBox(height: 3),
            Text(
              status,
              maxLines: expanded ? 2 : 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color:
                    status == l10n.mapOutsideCoverage ||
                        status == l10n.mapUnavailable ||
                        status == l10n.mapStaleData
                    ? Colors.deepOrange.shade800
                    : sankatPrimary,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (expanded) ...[
              if (riskText case final String text)
                Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              if (riskContextText case final String text)
                Text(
                  text,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              if (hazardText case final String text)
                Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              if (metadataText.isNotEmpty)
                Text(
                  metadataText,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: onDetails,
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    minimumSize: const Size(0, 32),
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                  ),
                  child: Text(l10n.viewFullRiskMap),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _EmergencyActionCard extends StatelessWidget {
  const _EmergencyActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
    this.emphasized = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Material(
      color: emphasized ? color : colors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
        constraints: BoxConstraints(minHeight: emphasized ? 78 : 108),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            border: emphasized
                ? null
                : Border.all(color: colors.outlineVariant),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: emphasized
                      ? Colors.white.withValues(alpha: 0.16)
                      : color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  icon,
                  color: emphasized ? Colors.white : color,
                  size: 24,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        color: emphasized ? Colors.white : sankatInk,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: emphasized
                            ? Colors.white.withValues(alpha: 0.9)
                            : colors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ToolChip extends StatelessWidget {
  const _ToolChip({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => ActionChip(
    avatar: Icon(icon, size: 18),
    label: Text(label),
    onPressed: onPressed,
  );
}

class _CompactError extends StatelessWidget {
  const _CompactError({
    required this.message,
    required this.onRetry,
    required this.onGuide,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback onGuide;

  @override
  Widget build(BuildContext context) => Card(
    color: Theme.of(context).colorScheme.errorContainer,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.cloud_off_outlined, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  message,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              IconButton(
                tooltip: AppLocalizations.of(context).retry,
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: onGuide,
              child: Text(AppLocalizations.of(context).offlineGuide),
            ),
          ),
        ],
      ),
    ),
  );
}
