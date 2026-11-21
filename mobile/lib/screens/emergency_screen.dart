import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/generated/app_localizations.dart';
import '../models/app_models.dart';
import '../services/api_service.dart';
import '../services/app_storage.dart';
import '../services/location_service.dart';
import '../widgets/app_widgets.dart';

class EmergencyScreen extends StatefulWidget {
  const EmergencyScreen({required this.api, required this.storage, super.key});

  final ApiService api;
  final AppStorage storage;
  @override
  State<EmergencyScreen> createState() => _EmergencyScreenState();
}

class _EmergencyScreenState extends State<EmergencyScreen> {
  final _locationService = LocationService();
  List<Shelter> _shelters = [];
  List<Hospital> _hospitals = [];
  List<EmergencyFacility> _facilities = [];
  bool _loading = true;
  bool _dataUnavailable = false;
  bool _gettingLocation = false;
  String? _position;
  String? _locationError;
  String? _actionMessage;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _dataUnavailable = false;
    });
    final results = await Future.wait<Object?>([
      _loadSource(widget.api.fetchShelters),
      _loadSource(widget.api.fetchHospitals),
      _loadSource(widget.api.fetchEmergencyFacilities),
    ]);
    if (!mounted) return;
    setState(() {
      _shelters = results[0] as List<Shelter>? ?? [];
      _hospitals = results[1] as List<Hospital>? ?? [];
      _facilities = results[2] as List<EmergencyFacility>? ?? [];
      _dataUnavailable = results.any((result) => result == null);
      _loading = false;
    });
  }

  Future<List<T>?> _loadSource<T>(Future<List<T>> Function() load) async {
    try {
      return await load();
    } on ApiException {
      return null;
    }
  }

  Future<void> _getLocation() async {
    setState(() {
      _gettingLocation = true;
      _locationError = null;
    });
    try {
      final position = await _locationService.getCurrentPosition();
      if (!mounted) return;
      setState(() {
        _position =
            '${position.latitude.toStringAsFixed(5)}, ${position.longitude.toStringAsFixed(5)}';
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

  Future<void> _call(String contact, String title) async {
    final l10n = AppLocalizations.of(context);
    final firstNumber = contact.split('/').first.trim();
    final dialable = firstNumber.replaceAll(RegExp(r'[^\d+]'), '');
    if (dialable.isEmpty) {
      setState(() => _actionMessage = l10n.noDialableNumber(title));
      return;
    }
    try {
      final launched = await launchUrl(
        Uri(scheme: 'tel', path: dialable),
        mode: LaunchMode.externalApplication,
      );
      if (!mounted) return;
      setState(
        () => _actionMessage = launched
            ? l10n.dialerOpened(title)
            : l10n.dialerUnavailable(title),
      );
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _actionMessage = l10n.dialerError(error.toString()));
    }
  }

  Future<void> _openMap(double latitude, double longitude, String label) async {
    final l10n = AppLocalizations.of(context);
    final query = Uri.encodeComponent('$latitude,$longitude ($label)');
    try {
      final launched = await launchUrl(
        Uri.parse('geo:$latitude,$longitude?q=$query'),
        mode: LaunchMode.externalApplication,
      );
      if (!mounted) return;
      if (!launched) {
        setState(() => _actionMessage = l10n.noMapApp);
      }
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _actionMessage = l10n.mapAppError(error.toString()));
    }
  }

  Future<void> _save(
    String id,
    String type,
    String title,
    String details,
  ) async {
    final l10n = AppLocalizations.of(context);
    try {
      await widget.storage.saveItem(
        SavedItem(
          id: '$type:$id',
          type: type,
          title: title,
          details: details,
          savedAt: DateTime.now(),
        ),
      );
      if (!mounted) return;
      setState(() => _actionMessage = l10n.savedOnDevice(title));
    } on Exception catch (error) {
      if (!mounted) return;
      setState(
        () => _actionMessage = l10n.saveInformationError(error.toString()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.emergency),
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
            Card(
              color: Theme.of(context).colorScheme.surfaceContainerLow,
              child: Padding(
                padding: const EdgeInsets.all(15),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.notDispatch,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurface,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.red.shade700,
                        foregroundColor: Colors.white,
                      ),
                      onPressed: () => _call('101', l10n.fireRescue),
                      icon: const Icon(Icons.call),
                      label: Text(l10n.sosCall),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      l10n.callYourselfNotice,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _gettingLocation ? null : _getLocation,
              icon: _gettingLocation
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.my_location),
              label: Text(
                _gettingLocation ? l10n.gettingLocation : l10n.showMyLocation,
              ),
            ),
            if (_position != null) ...[
              Text(l10n.yourLocation(_position!)),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: _position!));
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(l10n.coordinatesCopied)),
                    );
                  },
                  icon: const Icon(Icons.copy, size: 18),
                  label: Text(l10n.copyCoordinates),
                ),
              ),
            ],
            if (_locationError != null)
              Text(
                _locationError!,
                style: TextStyle(color: Colors.orange.shade900),
              ),
            if (_actionMessage != null) ...[
              const SizedBox(height: 8),
              Text(_actionMessage!, style: const TextStyle(fontSize: 12)),
            ],
            const SizedBox(height: 8),
            DemoDataNotice(text: l10n.facilityDataNotice),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(28),
                child: Center(child: CircularProgressIndicator()),
              )
            else ...[
              if (_dataUnavailable)
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
              const SizedBox(height: 14),
              _sectionTitle(l10n.emergencyFacilities),
              if (_facilities.isEmpty)
                EmptyPanel(message: l10n.noFacilityRecords)
              else
                ..._facilities.map(
                  (facility) => _resourceCard(
                    context,
                    id: facility.id,
                    type: 'facility',
                    title: facility.name,
                    subtitle: '${facility.type} · ${facility.serviceHours}',
                    details: facility.specialization,
                    contact: facility.contact,
                    latitude: facility.latitude,
                    longitude: facility.longitude,
                  ),
                ),
              const SizedBox(height: 10),
              _sectionTitle(l10n.hospitals),
              if (_hospitals.isEmpty)
                EmptyPanel(message: l10n.noHospitalRecords)
              else
                ..._hospitals.map(
                  (hospital) => _resourceCard(
                    context,
                    id: hospital.id,
                    type: 'hospital',
                    title: hospital.name,
                    subtitle:
                        '${hospital.type} · ${l10n.beds}: ${hospital.totalBeds} · ${l10n.icu}: ${hospital.availableIcu}',
                    details: hospital.hasTraumaCenter
                        ? l10n.traumaCenterListed
                        : l10n.traumaCenterNotListed,
                    contact: hospital.contact,
                    latitude: hospital.latitude,
                    longitude: hospital.longitude,
                  ),
                ),
              const SizedBox(height: 10),
              _sectionTitle(l10n.shelters),
              if (_shelters.isEmpty)
                EmptyPanel(message: l10n.noShelterRecords)
              else
                ..._shelters.map(
                  (shelter) => _resourceCard(
                    context,
                    id: shelter.id,
                    type: 'shelter',
                    title: shelter.name,
                    subtitle:
                        '${shelter.address} · Occupancy ${shelter.currentOccupancy}/${shelter.capacity}',
                    details:
                        '${l10n.petFriendly}: ${shelter.petFriendly ? l10n.listed : l10n.notListed} · ${l10n.wheelchairAccessible}: ${shelter.wheelchairAccessible ? l10n.listed : l10n.notListed} · ${l10n.updated}: ${formatTimestamp(shelter.lastUpdated, unavailable: l10n.updateTimeNotProvided)}',
                    contact: shelter.contact,
                    latitude: shelter.latitude,
                    longitude: shelter.longitude,
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(String title) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      title,
      style: const TextStyle(
        color: sankatInk,
        fontSize: 18,
        fontWeight: FontWeight.bold,
      ),
    ),
  );

  Widget _resourceCard(
    BuildContext context, {
    required String id,
    required String type,
    required String title,
    required String subtitle,
    required String details,
    required String contact,
    required double latitude,
    required double longitude,
  }) {
    return Card(
      margin: const EdgeInsets.only(bottom: 9),
      child: Padding(
        padding: const EdgeInsets.all(13),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(subtitle, style: const TextStyle(fontSize: 12)),
            if (details.isNotEmpty) ...[
              const SizedBox(height: 5),
              Text(details, style: const TextStyle(fontSize: 12)),
            ],
            const SizedBox(height: 8),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: [
                if (contact.isNotEmpty)
                  TextButton.icon(
                    onPressed: () => _call(contact, title),
                    icon: const Icon(Icons.call, size: 18),
                    label: Text(contact),
                  ),
                TextButton.icon(
                  onPressed: () => _openMap(latitude, longitude, title),
                  icon: const Icon(Icons.map_outlined, size: 18),
                  label: Text(AppLocalizations.of(context).openMap),
                ),
                IconButton(
                  onPressed: () => _save(
                    id,
                    type,
                    title,
                    '$subtitle\n$details\nContact: $contact\nCoordinates: $latitude, $longitude',
                  ),
                  icon: const Icon(Icons.bookmark_add_outlined),
                  tooltip: AppLocalizations.of(context).save,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
