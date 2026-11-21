import 'package:material_ui/material_ui.dart';

import '../l10n/generated/app_localizations.dart';
import '../models/app_models.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../widgets/app_widgets.dart';

String _localizedSeverity(AppLocalizations l10n, String severity) =>
    switch (severity) {
      'Low' => l10n.low,
      'Moderate' => l10n.moderate,
      'High' => l10n.high,
      'Critical' => l10n.critical,
      _ => severity,
    };

String _localizedReviewStatus(AppLocalizations l10n, String status) =>
    switch (status) {
      'Verified' => l10n.verified,
      'Rejected' => l10n.rejected,
      'Resolved' => l10n.resolved,
      'Under Review' => l10n.underReview,
      _ => status,
    };

class IncidentReportsScreen extends StatefulWidget {
  const IncidentReportsScreen({
    required this.api,
    required this.token,
    required this.onLogin,
    super.key,
  });

  final ApiService api;
  final String? token;
  final VoidCallback onLogin;

  @override
  State<IncidentReportsScreen> createState() => _IncidentReportsScreenState();
}

class _IncidentReportsScreenState extends State<IncidentReportsScreen> {
  List<CommunityReport> _reports = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadReports();
  }

  Future<void> _loadReports() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final reports = await widget.api.fetchReports();
      if (!mounted) return;
      setState(() {
        _reports = reports;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.localizedMessage(AppLocalizations.of(context));
        _loading = false;
      });
    }
  }

  Future<void> _openForm() async {
    if (widget.token == null) {
      widget.onLogin();
      return;
    }
    final submitted = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) =>
            ReportIncidentScreen(api: widget.api, token: widget.token!),
      ),
    );
    if (submitted == true) _loadReports();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.communityIncidents),
        actions: [
          IconButton(
            onPressed: _loading ? null : _loadReports,
            icon: const Icon(Icons.refresh),
            tooltip: l10n.refreshReports,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openForm,
        icon: const Icon(Icons.add_alert),
        label: Text(l10n.reportIncident),
      ),
      body: RefreshIndicator(
        onRefresh: _loadReports,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
          children: [
            DemoDataNotice(text: l10n.reportsDataNotice),
            if (widget.token == null) ...[
              const SizedBox(height: 10),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.lock_outline),
                  title: Text(l10n.signInToReport),
                  subtitle: Text(l10n.publicReportFeed),
                  trailing: TextButton(
                    onPressed: widget.onLogin,
                    child: Text(l10n.login),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 12),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(28),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null)
              ErrorPanel(message: _error!, onRetry: _loadReports)
            else if (_reports.isEmpty)
              EmptyPanel(message: l10n.noIncidentReports)
            else
              ..._reports.map(_reportCard),
          ],
        ),
      ),
    );
  }

  Widget _reportCard(CommunityReport report) {
    final l10n = AppLocalizations.of(context);
    final statusColor = switch (report.verificationStatus) {
      'Verified' => Colors.green,
      'Rejected' => Colors.red,
      'Resolved' => Colors.blueGrey,
      'Under Review' => Colors.orange,
      _ => Colors.amber.shade800,
    };
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    report.locationName,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 9,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    _localizedReviewStatus(l10n, report.verificationStatus),
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '${localizedReportType(l10n, report.reportType)} · ${_localizedSeverity(l10n, report.severity)}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            if (report.description.isNotEmpty) ...[
              const SizedBox(height: 5),
              Text(report.description),
            ],
            const SizedBox(height: 7),
            Text(
              l10n.reportedAt(
                formatTimestamp(
                  report.timestamp,
                  unavailable: l10n.updateTimeNotProvided,
                ),
              ),
              style: const TextStyle(fontSize: 11, color: Colors.black54),
            ),
          ],
        ),
      ),
    );
  }
}

class ReportIncidentScreen extends StatefulWidget {
  const ReportIncidentScreen({
    required this.api,
    required this.token,
    super.key,
  });

  final ApiService api;
  final String token;

  @override
  State<ReportIncidentScreen> createState() => _ReportIncidentScreenState();
}

class _ReportIncidentScreenState extends State<ReportIncidentScreen> {
  static const _reportTypes = [
    'Waterlogging',
    'Road flooded',
    'Road blocked',
    'Heavy rainfall',
    'Drainage overflow',
    'Fallen tree',
    'Traffic disruption',
    'Rescue required',
  ];
  static const _severities = ['Low', 'Moderate', 'High', 'Critical'];

  final _locationController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _locationService = LocationService();

  RoadNetwork? _network;
  String _reportType = _reportTypes.first;
  String _severity = 'Moderate';
  String? _selectedNodeId;
  String? _selectedRoadId;
  double? _latitude;
  double? _longitude;
  String? _locationSource;
  String? _error;
  bool _loadingRoads = true;
  bool _gettingLocation = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadRoads();
  }

  @override
  void dispose() {
    _locationController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _loadRoads() async {
    try {
      final network = await widget.api.fetchRoadNetwork();
      if (!mounted) return;
      setState(() {
        _network = network;
        _loadingRoads = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.localizedMessage(AppLocalizations.of(context));
        _loadingRoads = false;
      });
    }
  }

  Future<void> _useCurrentLocation() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _gettingLocation = true;
      _error = null;
    });
    try {
      final position = await _locationService.getCurrentPosition();
      if (!mounted) return;
      setState(() {
        _error = null;
        _latitude = position.latitude;
        _longitude = position.longitude;
        _selectedNodeId = null;
        _locationSource = l10n.positionSourceGps;
        if (_locationController.text.trim().isEmpty) {
          _locationController.text = l10n.currentLocation;
        }
      });
    } on LocationException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.localizedMessage(l10n));
    } finally {
      if (mounted) setState(() => _gettingLocation = false);
    }
  }

  void _selectNode(String? id) {
    if (id == null || _network == null) return;
    final node = _network!.nodes.firstWhere((entry) => entry.id == id);
    final l10n = AppLocalizations.of(context);
    setState(() {
      _error = null;
      _selectedNodeId = id;
      _latitude = node.latitude;
      _longitude = node.longitude;
      _locationSource = l10n.positionSourceMapped;
      _locationController.text = node.name;
    });
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    if (_locationController.text.trim().isEmpty) {
      setState(() => _error = l10n.enterLocationName);
      return;
    }
    if (_descriptionController.text.trim().isEmpty) {
      setState(() => _error = l10n.describeIncident);
      return;
    }
    if (_latitude == null || _longitude == null) {
      setState(() => _error = l10n.chooseAccurateLocation);
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final report = await widget.api.submitReport(
        token: widget.token,
        locationName: _locationController.text.trim(),
        reportType: _reportType,
        description: _descriptionController.text.trim(),
        severity: _severity,
        latitude: _latitude!,
        longitude: _longitude!,
        roadId: _selectedRoadId,
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(l10n.reportSubmitted),
          content: Text(
            '${l10n.reportUnverified(_localizedReviewStatus(l10n, report.verificationStatus))}\n\n'
            '${l10n.reportReference(report.id)}',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(l10n.done),
            ),
          ],
        ),
      );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(
        () => _error = error.localizedMessage(AppLocalizations.of(context)),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final network = _network;
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.reportFormTitle)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DemoDataNotice(text: l10n.reportingDataNotice),
          const SizedBox(height: 14),
          DropdownButtonFormField<String>(
            initialValue: _reportType,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: l10n.incidentType,
              border: const OutlineInputBorder(),
            ),
            items: _reportTypes
                .map(
                  (type) => DropdownMenuItem(
                    value: type,
                    child: Text(localizedReportType(l10n, type)),
                  ),
                )
                .toList(),
            onChanged: _submitting
                ? null
                : (value) {
                    if (value != null) setState(() => _reportType = value);
                  },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _severity,
            decoration: InputDecoration(
              labelText: l10n.severity,
              border: const OutlineInputBorder(),
            ),
            items: _severities
                .map(
                  (severity) => DropdownMenuItem(
                    value: severity,
                    child: Text(_localizedSeverity(l10n, severity)),
                  ),
                )
                .toList(),
            onChanged: _submitting
                ? null
                : (value) {
                    if (value != null) setState(() => _severity = value);
                  },
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _locationController,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: l10n.locationName,
              hintText: l10n.mappedLocationHint,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          if (_loadingRoads)
            const LinearProgressIndicator()
          else if (network != null && network.nodes.isNotEmpty)
            DropdownButtonFormField<String>(
              initialValue: _selectedNodeId,
              isExpanded: true,
              menuMaxHeight: MediaQuery.sizeOf(context).height * 0.55,
              decoration: InputDecoration(
                labelText: l10n.chooseMappedPoint,
                border: const OutlineInputBorder(),
              ),
              hint: Text(l10n.selectKnownPoint),
              items: network.nodes
                  .map(
                    (node) => DropdownMenuItem(
                      value: node.id,
                      child: Text(node.name, overflow: TextOverflow.ellipsis),
                    ),
                  )
                  .toList(),
              onChanged: _submitting ? null : _selectNode,
            )
          else if (_error != null)
            Text(
              l10n.mappedLocationsUnavailable,
              style: TextStyle(color: Colors.orange.shade900),
            ),
          if (network != null && network.segments.isNotEmpty) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _selectedRoadId,
              isExpanded: true,
              menuMaxHeight: MediaQuery.sizeOf(context).height * 0.55,
              decoration: InputDecoration(
                labelText: l10n.relatedRoad,
                border: const OutlineInputBorder(),
              ),
              hint: Text(l10n.noSpecificRoad),
              items: network.segments
                  .map(
                    (road) => DropdownMenuItem(
                      value: road.id,
                      child: Text(road.name, overflow: TextOverflow.ellipsis),
                    ),
                  )
                  .toList(),
              onChanged: _submitting
                  ? null
                  : (value) => setState(() => _selectedRoadId = value),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _descriptionController,
            minLines: 3,
            maxLines: 6,
            maxLength: 1000,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: l10n.description,
              hintText: l10n.hazardDescriptionHint,
              alignLabelWithHint: true,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _gettingLocation || _submitting
                ? null
                : _useCurrentLocation,
            icon: _gettingLocation
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.my_location),
            label: Text(
              _gettingLocation ? l10n.gettingLocation : l10n.useGpsLocation,
            ),
          ),
          if (_locationSource != null)
            Text(
              '${l10n.positionSource}: $_locationSource (${_latitude!.toStringAsFixed(5)}, ${_longitude!.toStringAsFixed(5)})',
              style: const TextStyle(fontSize: 12, color: Colors.black54),
            ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            ErrorPanel(message: _error!),
          ],
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _submitting ? null : _submit,
            icon: _submitting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send),
            label: Text(_submitting ? l10n.submitting : l10n.submitReport),
          ),
        ],
      ),
    );
  }
}
