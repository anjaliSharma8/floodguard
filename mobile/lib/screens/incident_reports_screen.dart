import 'package:material_ui/material_ui.dart';

import '../models/app_models.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../widgets/app_widgets.dart';

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
        _error = error.message;
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Community incidents'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _loadReports,
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh reports',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openForm,
        icon: const Icon(Icons.add_alert),
        label: const Text('Report incident'),
      ),
      body: RefreshIndicator(
        onRefresh: _loadReports,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
          children: [
            const DemoDataNotice(
              text: 'Reports are server records and may include seeded demo entries. Citizen submissions remain unverified until reviewed by an authority.',
            ),
            if (widget.token == null) ...[
              const SizedBox(height: 10),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.lock_outline),
                  title: const Text('Sign in to submit a report'),
                  subtitle: const Text(
                    'Viewing the report feed is public; submitting requires a citizen account.',
                  ),
                  trailing: TextButton(
                    onPressed: widget.onLogin,
                    child: const Text('Sign in'),
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
              const EmptyPanel(message: 'No incident reports are available.')
            else
              ..._reports.map(_reportCard),
          ],
        ),
      ),
    );
  }

  Widget _reportCard(CommunityReport report) {
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
                    report.verificationStatus,
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
              '${report.reportType} · ${report.severity}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            if (report.description.isNotEmpty) ...[
              const SizedBox(height: 5),
              Text(report.description),
            ],
            const SizedBox(height: 7),
            Text(
              'Reported: ${formatTimestamp(report.timestamp)}',
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
        _error = error.message;
        _loadingRoads = false;
      });
    }
  }

  Future<void> _useCurrentLocation() async {
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
        _locationSource = 'GPS location (permission granted)';
        if (_locationController.text.trim().isEmpty) {
          _locationController.text = 'Current location';
        }
      });
    } on LocationException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _gettingLocation = false);
    }
  }

  void _selectNode(String? id) {
    if (id == null || _network == null) return;
    final node = _network!.nodes.firstWhere((entry) => entry.id == id);
    setState(() {
      _error = null;
      _selectedNodeId = id;
      _latitude = node.latitude;
      _longitude = node.longitude;
      _locationSource = 'Selected mapped road-network point';
      _locationController.text = node.name;
    });
  }

  Future<void> _submit() async {
    if (_locationController.text.trim().isEmpty) {
      setState(() => _error = 'Enter a location name.');
      return;
    }
    if (_descriptionController.text.trim().isEmpty) {
      setState(() => _error = 'Describe what happened.');
      return;
    }
    if (_latitude == null || _longitude == null) {
      setState(
        () => _error = 'Choose a mapped location or grant location permission. A text-only location cannot be accurately placed on the incident map.',
      );
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
          title: const Text('Report submitted'),
          content: Text(
            'The server recorded this report as "${report.verificationStatus}". It has not been verified by an authority.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Done'),
            ),
          ],
        ),
      );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final network = _network;
    return Scaffold(
      appBar: AppBar(title: const Text('Report an incident')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const DemoDataNotice(
            text: 'Reports are submitted to the backend for review. The app cannot dispatch rescue services, and this API does not accept image uploads.',
          ),
          const SizedBox(height: 14),
          DropdownButtonFormField<String>(
            initialValue: _reportType,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Incident type',
              border: OutlineInputBorder(),
            ),
            items: _reportTypes
                .map((type) => DropdownMenuItem(value: type, child: Text(type)))
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
            decoration: const InputDecoration(
              labelText: 'Severity reported by you',
              border: OutlineInputBorder(),
            ),
            items: _severities
                .map(
                  (severity) =>
                      DropdownMenuItem(value: severity, child: Text(severity)),
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
            decoration: const InputDecoration(
              labelText: 'Location name',
              hintText: 'Area or mapped location',
              border: OutlineInputBorder(),
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
              decoration: const InputDecoration(
                labelText: 'Choose a mapped point (optional)',
                border: OutlineInputBorder(),
              ),
              hint: const Text('Select a known map point'),
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
              'Mapped locations unavailable; GPS can still provide coordinates.',
              style: TextStyle(color: Colors.orange.shade900),
            ),
          if (network != null && network.segments.isNotEmpty) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _selectedRoadId,
              isExpanded: true,
              menuMaxHeight: MediaQuery.sizeOf(context).height * 0.55,
              decoration: const InputDecoration(
                labelText: 'Related road (optional)',
                border: OutlineInputBorder(),
              ),
              hint: const Text('No specific road'),
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
            decoration: const InputDecoration(
              labelText: 'Description',
              hintText: 'Describe the hazard or assistance needed',
              alignLabelWithHint: true,
              border: OutlineInputBorder(),
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
              _gettingLocation
                  ? 'Getting location...'
                  : 'Use current GPS location',
            ),
          ),
          if (_locationSource != null)
            Text(
              'Position source: $_locationSource (${_latitude!.toStringAsFixed(5)}, ${_longitude!.toStringAsFixed(5)})',
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
            label: Text(_submitting ? 'Submitting...' : 'Submit report'),
          ),
        ],
      ),
    );
  }
}
