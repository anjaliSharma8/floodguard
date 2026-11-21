import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:material_ui/material_ui.dart';

import '../l10n/generated/app_localizations.dart';
import '../models/app_models.dart';
import 'app_widgets.dart';

class RoadNetworkMap extends StatelessWidget {
  const RoadNetworkMap({
    required this.center,
    required this.zoom,
    this.network,
    this.reports = const [],
    this.currentLocation,
    this.onTileError,
    super.key,
  });

  final LatLng center;
  final double zoom;
  final RoadNetwork? network;
  final List<CommunityReport> reports;
  final LatLng? currentLocation;
  final VoidCallback? onTileError;

  @override
  Widget build(BuildContext context) {
    final roads = network?.segments ?? const <RoadSegment>[];
    final nodes = network?.nodes ?? const <RoadNode>[];
    return FlutterMap(
      options: MapOptions(
        initialCenter: center,
        initialZoom: zoom,
        minZoom: 8,
        maxZoom: 18,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.sankatsetu.sankatsetu',
          maxNativeZoom: 19,
          errorTileCallback: (_, _, _) => onTileError?.call(),
        ),
        PolylineLayer(
          polylines: roads
              .where((road) => road.coordinates.length >= 2)
              .map(
                (road) => Polyline(
                  points: road.coordinates
                      .map((point) => LatLng(point[0], point[1]))
                      .toList(),
                  strokeWidth: road.status == 'blocked' ? 7 : 5,
                  color:
                      road.status == 'blocked' ||
                          road.status == 'critical_waterlogged'
                      ? Colors.red
                      : riskColor(road.riskScore),
                ),
              )
              .toList(),
        ),
        MarkerLayer(
          markers: [
            ...nodes.map(
              (node) => Marker(
                point: LatLng(node.latitude, node.longitude),
                width: 30,
                height: 36,
                child: Tooltip(
                  message: node.name,
                  child: const Icon(Icons.location_on, color: Colors.blueGrey),
                ),
              ),
            ),
            ...reports
                .where(
                  (report) =>
                      report.latitude != 0 &&
                      report.longitude != 0 &&
                      report.verificationStatus != 'Rejected',
                )
                .map(
                  (report) => Marker(
                    point: LatLng(report.latitude, report.longitude),
                    width: 38,
                    height: 42,
                    child: Tooltip(
                      message:
                          '${report.locationName}\n'
                          '${localizedReportType(AppLocalizations.of(context), report.reportType)}',
                      child: Icon(
                        Icons.warning,
                        color: report.verificationStatus == 'Verified'
                            ? Colors.red
                            : Colors.orange,
                      ),
                    ),
                  ),
                ),
            if (currentLocation case final location?)
              Marker(
                point: location,
                width: 48,
                height: 48,
                child: const DecoratedBox(
                  decoration: BoxDecoration(
                    color: Color(0x33087E8B),
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Icon(
                      Icons.my_location,
                      color: Color(0xFF087E8B),
                      size: 25,
                    ),
                  ),
                ),
              ),
          ],
        ),
        RichAttributionWidget(
          attributions: [TextSourceAttribution('© OpenStreetMap contributors')],
        ),
      ],
    );
  }
}
