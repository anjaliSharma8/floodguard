import 'package:material_ui/material_ui.dart';

import '../models/app_models.dart';
import '../services/api_service.dart';
import '../widgets/app_widgets.dart';

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({required this.api, super.key});

  final ApiService api;

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _Alert {
  const _Alert({
    required this.title,
    required this.location,
    required this.details,
    required this.source,
    required this.severity,
    this.timestamp,
  });

  final String title;
  final String location;
  final String details;
  final String source;
  final String severity;
  final DateTime? timestamp;
}

class _AlertsScreenState extends State<AlertsScreen> {
  List<_Alert> _alerts = [];
  bool _loading = true;
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
    });
    try {
      final results = await Future.wait<dynamic>([
        widget.api.fetchRoadNetwork(),
        widget.api.fetchReports(),
      ]);
      final network = results[0] as RoadNetwork;
      final reports = results[1] as List<CommunityReport>;
      final alerts = <_Alert>[];
      for (final road in network.segments) {
        final noteworthy =
            road.status == 'blocked' ||
            road.status == 'critical_waterlogged' ||
            road.riskScore >= 60 ||
            road.status == 'caution';
        if (!noteworthy) continue;
        alerts.add(
          _Alert(
            title: road.status == 'blocked'
                ? 'Road reported blocked'
                : road.status == 'critical_waterlogged'
                ? 'Critical waterlogging status'
                : 'Road risk advisory',
            location: road.name,
            details:
                'Backend status: ${road.status} · Risk score: ${road.riskScore.toStringAsFixed(0)}/100',
            source: 'Road network',
            severity:
                road.status == 'blocked' ||
                    road.status == 'critical_waterlogged' ||
                    road.riskScore >= 60
                ? 'High'
                : 'Medium',
            timestamp: road.lastUpdated,
          ),
        );
      }
      for (final report in reports) {
        if (report.verificationStatus == 'Rejected' ||
            report.verificationStatus == 'Resolved') {
          continue;
        }
        alerts.add(
          _Alert(
            title: report.reportType,
            location: report.locationName,
            details:
                '${report.description}\nReview status: ${report.verificationStatus}',
            source: 'Community report',
            severity: report.severity,
            timestamp: report.timestamp,
          ),
        );
      }
      alerts.sort((a, b) {
        final aTime = a.timestamp;
        final bTime = b.timestamp;
        if (aTime == null && bTime == null) return 0;
        if (aTime == null) return 1;
        if (bTime == null) return -1;
        return bTime.compareTo(aTime);
      });
      if (!mounted) return;
      setState(() {
        _alerts = alerts;
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

  Color _color(String severity) {
    final normalized = severity.toLowerCase();
    if (normalized == 'critical' || normalized == 'high') return Colors.red;
    if (normalized == 'moderate' || normalized == 'medium') {
      return Colors.orange.shade800;
    }
    return Colors.blueGrey;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Flood alerts'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const DemoDataNotice(
              text: 'The backend has no dedicated alerts or push-notification API. These in-app advisories are derived from /api/roads and /api/reports; source records can include seeded demo data.',
            ),
            const SizedBox(height: 8),
            const Card(
              child: ListTile(
                leading: Icon(Icons.notifications_off_outlined),
                title: Text('In-app only'),
                subtitle: Text(
                  'Push notifications are not configured. This screen does not run as an emergency alert service.',
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(28),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null)
              ErrorPanel(message: _error!, onRetry: _load)
            else if (_alerts.isEmpty)
              const EmptyPanel(
                icon: Icons.verified_user_outlined,
                message: 'No road-risk advisories or open reports were returned by the backend.',
              )
            else
              ..._alerts.map((alert) {
                final color = _color(alert.severity);
                return Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    contentPadding: const EdgeInsets.all(14),
                    leading: CircleAvatar(
                      backgroundColor: color.withValues(alpha: 0.14),
                      child: Icon(Icons.warning_amber, color: color),
                    ),
                    title: Text(
                      alert.title,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(alert.location),
                          const SizedBox(height: 4),
                          Text(alert.details),
                          const SizedBox(height: 5),
                          Text('Source: ${alert.source}'),
                          Text('Updated: ${formatTimestamp(alert.timestamp)}'),
                        ],
                      ),
                    ),
                    trailing: Text(
                      alert.severity,
                      style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.bold,
                        fontSize: 11,
                      ),
                    ),
                    isThreeLine: true,
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
