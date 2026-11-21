import 'package:material_ui/material_ui.dart';

import '../l10n/generated/app_localizations.dart';
import '../models/app_models.dart';
import '../services/api_service.dart';
import '../widgets/app_widgets.dart';

class GlobalSearchScreen extends StatefulWidget {
  const GlobalSearchScreen({
    required this.api,
    required this.onOpenFeature,
    super.key,
  });

  final ApiService api;
  final ValueChanged<String> onOpenFeature;

  @override
  State<GlobalSearchScreen> createState() => _GlobalSearchScreenState();
}

class _SearchEntry {
  const _SearchEntry({
    required this.title,
    required this.subtitle,
    required this.details,
    required this.searchText,
    required this.category,
    required this.icon,
  });

  final String title;
  final String subtitle;
  final String details;
  final String searchText;
  final _SearchCategory category;
  final IconData icon;
}

enum _SearchCategory { shelter, hospital, facility, road, report }

class _GlobalSearchScreenState extends State<GlobalSearchScreen> {
  final _controller = TextEditingController();
  List<_SearchEntry> _entries = [];
  _SearchCategory? _selectedCategory;
  bool _loading = true;
  int _failedSources = 0;

  @override
  void initState() {
    super.initState();
    _loadRecords();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<List<_SearchEntry>?> _loadSource<T>(
    Future<List<T>> Function() load,
    List<_SearchEntry> Function(List<T>) convert,
  ) async {
    try {
      return convert(await load());
    } on ApiException {
      return null;
    }
  }

  Future<void> _loadRecords() async {
    setState(() {
      _loading = true;
      _failedSources = 0;
    });
    final results = await Future.wait<List<_SearchEntry>?>([
      _loadSource(widget.api.fetchShelters, _shelterEntries),
      _loadSource(widget.api.fetchHospitals, _hospitalEntries),
      _loadSource(widget.api.fetchEmergencyFacilities, _facilityEntries),
      _loadSource(
        () async => (await widget.api.fetchRoadNetwork()).segments,
        _roadEntries,
      ),
      _loadSource(widget.api.fetchReports, _reportEntries),
    ]);
    if (!mounted) return;
    setState(() {
      _entries = results
          .whereType<List<_SearchEntry>>()
          .expand((e) => e)
          .toList();
      _failedSources = results.where((result) => result == null).length;
      _loading = false;
    });
  }

  List<_SearchEntry> _shelterEntries(List<Shelter> shelters) => shelters
      .map(
        (shelter) => _SearchEntry(
          title: shelter.name,
          subtitle: shelter.address,
          details:
              '${AppLocalizations.of(context).shelters} · ${shelter.currentOccupancy}/${shelter.capacity}',
          searchText: '${shelter.name} ${shelter.address}',
          category: _SearchCategory.shelter,
          icon: Icons.home_work_outlined,
        ),
      )
      .toList();

  List<_SearchEntry> _hospitalEntries(List<Hospital> hospitals) => hospitals
      .map(
        (hospital) => _SearchEntry(
          title: hospital.name,
          subtitle: hospital.type,
          details:
              '${AppLocalizations.of(context).hospitals} · ${hospital.totalBeds} ${AppLocalizations.of(context).beds}',
          searchText: '${hospital.name} ${hospital.type}',
          category: _SearchCategory.hospital,
          icon: Icons.local_hospital_outlined,
        ),
      )
      .toList();

  List<_SearchEntry> _facilityEntries(
    List<EmergencyFacility> facilities,
  ) => facilities
      .map(
        (facility) => _SearchEntry(
          title: facility.name,
          subtitle: facility.type,
          details: '${facility.specialization} · ${facility.serviceHours}',
          searchText:
              '${facility.name} ${facility.type} ${facility.specialization}',
          category: _SearchCategory.facility,
          icon: Icons.health_and_safety_outlined,
        ),
      )
      .toList();

  List<_SearchEntry> _roadEntries(List<RoadSegment> roads) => roads
      .map(
        (road) => _SearchEntry(
          title: road.name,
          subtitle: '${road.from} · ${road.to}',
          details:
              '${road.distanceKm} km · ${AppLocalizations.of(context).riskScore}: ${road.riskScore.toStringAsFixed(0)}/100 · ${_roadStatus(AppLocalizations.of(context), road.status)}',
          searchText: '${road.name} ${road.from} ${road.to} ${road.status}',
          category: _SearchCategory.road,
          icon: Icons.route_outlined,
        ),
      )
      .toList();

  List<_SearchEntry> _reportEntries(List<CommunityReport> reports) => reports
      .where((report) => report.verificationStatus != 'Rejected')
      .map(
        (report) => _SearchEntry(
          title: report.locationName,
          subtitle: localizedReportType(
            AppLocalizations.of(context),
            report.reportType,
          ),
          details:
              '${_severity(AppLocalizations.of(context), report.severity)} · '
              '${_reviewStatus(AppLocalizations.of(context), report.verificationStatus)} · '
              '${report.description}',
          searchText:
              '${report.locationName} ${report.reportType} ${report.description}',
          category: _SearchCategory.report,
          icon: Icons.warning_amber_outlined,
        ),
      )
      .toList();

  String _roadStatus(AppLocalizations l10n, String status) =>
      switch (status.toLowerCase()) {
        'blocked' => l10n.blockedRoad,
        'critical_waterlogged' => l10n.criticalWaterlogging,
        'caution' => l10n.caution,
        'clear' => l10n.clear,
        _ => status,
      };

  String _reviewStatus(AppLocalizations l10n, String status) =>
      switch (status) {
        'Verified' => l10n.verified,
        'Rejected' => l10n.rejected,
        'Resolved' => l10n.resolved,
        'Under Review' => l10n.underReview,
        _ => status,
      };

  String _severity(AppLocalizations l10n, String severity) =>
      switch (severity.toLowerCase()) {
        'critical' => l10n.critical,
        'high' => l10n.high,
        'moderate' => l10n.moderate,
        'medium' => l10n.medium,
        'low' => l10n.low,
        _ => severity,
      };

  String _categoryLabel(AppLocalizations l10n, _SearchCategory category) =>
      switch (category) {
        _SearchCategory.shelter => l10n.shelters,
        _SearchCategory.hospital => l10n.hospitals,
        _SearchCategory.facility => l10n.emergencyFacilities,
        _SearchCategory.road => l10n.map,
        _SearchCategory.report => l10n.reports,
      };

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final query = _controller.text.trim().toLowerCase();
    final results = _entries.where((entry) {
      final matchesQuery =
          query.isEmpty || entry.searchText.toLowerCase().contains(query);
      final matchesCategory =
          _selectedCategory == null || entry.category == _selectedCategory;
      return matchesQuery && matchesCategory;
    }).toList();
    return Scaffold(
      appBar: AppBar(title: Text(l10n.searchTitle)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: TextField(
              controller: _controller,
              autofocus: true,
              textInputAction: TextInputAction.search,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: l10n.searchHint,
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _controller.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: l10n.searchClear,
                        onPressed: () {
                          _controller.clear();
                          setState(() {});
                        },
                        icon: const Icon(Icons.clear),
                      ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                filled: true,
              ),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                ChoiceChip(
                  label: Text(l10n.searchAll),
                  selected: _selectedCategory == null,
                  onSelected: (_) => setState(() => _selectedCategory = null),
                ),
                ..._SearchCategory.values.map(
                  (category) => Padding(
                    padding: const EdgeInsetsDirectional.only(start: 6),
                    child: ChoiceChip(
                      label: Text(_categoryLabel(l10n, category)),
                      selected: _selectedCategory == category,
                      onSelected: (_) =>
                          setState(() => _selectedCategory = category),
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (_failedSources > 0 && _entries.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: _SearchStatus(
                message: l10n.searchPartialUnavailable,
                onRetry: _loadRecords,
              ),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _failedSources == 5
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: _SearchStatus(
                        message: l10n.searchUnavailable,
                        onRetry: _loadRecords,
                      ),
                    ),
                  )
                : query.isEmpty && _selectedCategory == null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(28),
                      child: Text(
                        l10n.searchPrompt,
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : results.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        l10n.searchNoResults,
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                    itemCount: results.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 4),
                    itemBuilder: (context, index) {
                      final entry = results[index];
                      return Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: Theme.of(context)
                                .colorScheme
                                .primaryContainer,
                            child: Icon(entry.icon),
                          ),
                          title: Text(entry.title),
                          subtitle: Text(
                            '${_categoryLabel(l10n, entry.category)}'
                            '${entry.subtitle.isEmpty ? '' : ' · ${entry.subtitle}'}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          trailing: IconButton(
                            tooltip: l10n.searchOpenResource,
                            icon: const Icon(Icons.open_in_new),
                            onPressed: () => widget.onOpenFeature(
                              _featureFor(entry.category),
                            ),
                          ),
                          onTap: () => showDialog<void>(
                            context: context,
                            builder: (context) => AlertDialog(
                              title: Text(entry.title),
                              content: Text(
                                '${_categoryLabel(l10n, entry.category)}\n'
                                '${entry.details}',
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.pop(context),
                                  child: Text(l10n.done),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  String _featureFor(_SearchCategory category) => switch (category) {
    _SearchCategory.shelter ||
    _SearchCategory.hospital ||
    _SearchCategory.facility => 'emergency',
    _SearchCategory.road => 'map',
    _SearchCategory.report => 'reports',
  };
}

class _SearchStatus extends StatelessWidget {
  const _SearchStatus({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Card(
    color: Theme.of(context).colorScheme.errorContainer,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      child: Row(
        children: [
          const Icon(Icons.cloud_off_outlined),
          const SizedBox(width: 10),
          Expanded(child: Text(message)),
          TextButton(
            onPressed: onRetry,
            child: Text(AppLocalizations.of(context).retry),
          ),
        ],
      ),
    ),
  );
}
