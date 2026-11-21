import 'package:material_ui/material_ui.dart';

import '../l10n/generated/app_localizations.dart';
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
  bool _roadsUnavailable = false;
  bool _reportsUnavailable = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _roadsUnavailable = false;
      _reportsUnavailable = false;
      _alerts = [];
    });
    final alerts = <_Alert>[];
    try {
      final network = await widget.api.fetchRoadNetwork();
      if (!mounted) return;
      final l10n = AppLocalizations.of(context);
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
                ? l10n.roadReportedBlocked
                : road.status == 'critical_waterlogged'
                ? l10n.criticalWaterlogging
                : l10n.roadRiskAdvisory,
            location: road.name,
            details:
                '${l10n.backendStatus}: ${_localizedRoadStatus(l10n, road.status)} · ${l10n.riskScore}: ${road.riskScore.toStringAsFixed(0)}/100',
            source: 'Road network',
            severity:
                road.status == 'blocked' ||
                    road.status == 'critical_waterlogged' ||
                    road.riskScore >= 60
                ? l10n.high
                : l10n.medium,
            timestamp: road.lastUpdated,
          ),
        );
      }
    } on ApiException {
      if (!mounted) return;
      setState(() => _roadsUnavailable = true);
    }
    try {
      final reports = await widget.api.fetchReports();
      if (!mounted) return;
      final l10n = AppLocalizations.of(context);
      for (final report in reports) {
        if (report.verificationStatus == 'Rejected' ||
            report.verificationStatus == 'Resolved') {
          continue;
        }
        alerts.add(
          _Alert(
            title: localizedReportType(l10n, report.reportType),
            location: report.locationName,
            details:
                '${report.description}\n${l10n.reviewStatus}: ${_localizedReviewStatus(l10n, report.verificationStatus)}',
            source: 'Community report',
            severity: report.severity,
            timestamp: report.timestamp,
          ),
        );
      }
    } on ApiException {
      if (!mounted) return;
      setState(() => _reportsUnavailable = true);
    }
    if (!mounted) return;
    alerts.sort((a, b) {
      final aTime = a.timestamp;
      final bTime = b.timestamp;
      if (aTime == null && bTime == null) return 0;
      if (aTime == null) return 1;
      if (bTime == null) return -1;
      return bTime.compareTo(aTime);
    });
    setState(() {
      _alerts = alerts;
      _loading = false;
    });
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
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.alerts),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
            tooltip: l10n.retry,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            DemoDataNotice(text: l10n.alertsDataNotice),
            const SizedBox(height: 8),
            Card(
              child: ListTile(
                leading: Icon(Icons.notifications_off_outlined),
                title: Text(l10n.alertsInAppOnly),
                subtitle: Text(l10n.alertsNoPushNotice),
              ),
            ),
            const SizedBox(height: 8),
            if (_roadsUnavailable || _reportsUnavailable)
              Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.cloud_off_outlined),
                      const SizedBox(width: 8),
                      Expanded(child: Text(l10n.searchPartialUnavailable)),
                      TextButton(onPressed: _load, child: Text(l10n.retry)),
                    ],
                  ),
                ),
              ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(28),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_alerts.isEmpty)
              EmptyPanel(
                icon: Icons.verified_user_outlined,
                message: l10n.noAlerts,
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
                          Text(
                            '${l10n.source}: ${_localizedSource(l10n, alert.source)}',
                          ),
                          Text(
                            '${l10n.updated}: ${formatTimestamp(alert.timestamp, unavailable: l10n.updateTimeNotProvided)}',
                          ),
                        ],
                      ),
                    ),
                    trailing: Text(
                      _localizedSeverity(l10n, alert.severity),
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

  String _localizedSource(AppLocalizations l10n, String source) =>
      source == 'Road network'
      ? l10n.roadNetwork
      : source == 'Community report'
      ? l10n.communityReport
      : source;

  String _localizedRoadStatus(AppLocalizations l10n, String status) =>
      switch (status) {
        'blocked' => l10n.blockedRoad,
        'critical_waterlogged' => l10n.criticalWaterlogging,
        'caution' => l10n.caution,
        'clear' => l10n.clear,
        _ => status,
      };

  String _localizedReviewStatus(AppLocalizations l10n, String status) =>
      switch (status) {
        'Verified' => l10n.verified,
        'Rejected' => l10n.rejected,
        'Resolved' => l10n.resolved,
        'Under Review' => l10n.underReview,
        _ => status,
      };

  String _localizedSeverity(AppLocalizations l10n, String severity) =>
      switch (severity.toLowerCase()) {
        'critical' => l10n.critical,
        'high' => l10n.high,
        'moderate' || 'medium' => l10n.medium,
        'low' => l10n.low,
        _ => severity,
      };
}
