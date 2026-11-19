import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app_text.dart';
import '../models/app_models.dart';
import '../services/api_service.dart';
import '../services/app_storage.dart';
import '../services/location_service.dart';
import '../widgets/app_widgets.dart';

class EmergencyScreen extends StatefulWidget {
  const EmergencyScreen({
    required this.api,
    required this.storage,
    required this.language,
    super.key,
  });

  final ApiService api;
  final AppStorage storage;
  final String language;

  @override
  State<EmergencyScreen> createState() => _EmergencyScreenState();
}

class _EmergencyScreenState extends State<EmergencyScreen> {
  final _locationService = LocationService();
  List<Shelter> _shelters = [];
  List<Hospital> _hospitals = [];
  List<EmergencyFacility> _facilities = [];
  bool _loading = true;
  bool _gettingLocation = false;
  String? _error;
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
      _error = null;
    });
    try {
      final results = await Future.wait<dynamic>([
        widget.api.fetchShelters(),
        widget.api.fetchHospitals(),
        widget.api.fetchEmergencyFacilities(),
      ]);
      if (!mounted) return;
      setState(() {
        _shelters = results[0] as List<Shelter>;
        _hospitals = results[1] as List<Hospital>;
        _facilities = results[2] as List<EmergencyFacility>;
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
      setState(() => _locationError = error.message);
    } finally {
      if (mounted) setState(() => _gettingLocation = false);
    }
  }

  Future<void> _call(String contact, String title) async {
    final firstNumber = contact.split('/').first.trim();
    final dialable = firstNumber.replaceAll(RegExp(r'[^\d+]'), '');
    if (dialable.isEmpty) {
      setState(
        () => _actionMessage = 'No dialable number is provided for $title.',
      );
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
            ? 'Phone dialer opened for $title. No SOS or dispatch message was sent by this app.'
            : 'This device could not open a phone dialer for $title.',
      );
    } on Exception catch (error) {
      if (!mounted) return;
      setState(
        () => _actionMessage = 'Could not open the phone dialer: $error',
      );
    }
  }

  Future<void> _openMap(double latitude, double longitude, String label) async {
    final query = Uri.encodeComponent('$latitude,$longitude ($label)');
    try {
      final launched = await launchUrl(
        Uri.parse('geo:$latitude,$longitude?q=$query'),
        mode: LaunchMode.externalApplication,
      );
      if (!mounted) return;
      if (!launched) {
        setState(
          () => _actionMessage = 'No map application could open this location.',
        );
      }
    } on Exception catch (error) {
      if (!mounted) return;
      setState(
        () => _actionMessage = 'Could not open a map application: $error',
      );
    }
  }

  Future<void> _save(
    String id,
    String type,
    String title,
    String details,
  ) async {
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
      setState(() => _actionMessage = '$title saved on this device.');
    } on Exception catch (error) {
      if (!mounted) return;
      setState(
        () => _actionMessage = 'Could not save this information: $error',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    String t(String key) => AppText.text(widget.language, key);
    return Scaffold(
      appBar: AppBar(
        title: Text(t('emergency')),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
            tooltip: t('retry'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              color: Colors.red.shade50,
              child: Padding(
                padding: const EdgeInsets.all(15),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t('notDispatch'),
                      style: TextStyle(
                        color: Colors.red.shade900,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.red.shade700,
                        foregroundColor: Colors.white,
                      ),
                      onPressed: () => _call('101', 'Fire and Rescue'),
                      icon: const Icon(Icons.call),
                      label: const Text('SOS · Open dialer for 101'),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'The app cannot send your location or contact a rescue team. You must place the call yourself.',
                      style: TextStyle(
                        color: Colors.red.shade900,
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
                _gettingLocation ? 'Getting location...' : 'Show my location',
              ),
            ),
            if (_position != null) Text('Your location: $_position'),
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
            const DemoDataNotice(
              text: 'Emergency facilities and capacity details are backend records and can be seeded or stale. Check directly with the facility before travelling.',
            ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(28),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: ErrorPanel(message: _error!, onRetry: _load),
              )
            else ...[
              const SizedBox(height: 14),
              _sectionTitle('Emergency facilities'),
              if (_facilities.isEmpty)
                const EmptyPanel(
                  message: 'No emergency facility records returned.',
                )
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
              _sectionTitle('Hospitals'),
              if (_hospitals.isEmpty)
                const EmptyPanel(message: 'No hospital records returned.')
              else
                ..._hospitals.map(
                  (hospital) => _resourceCard(
                    context,
                    id: hospital.id,
                    type: 'hospital',
                    title: hospital.name,
                    subtitle:
                        '${hospital.type} · Beds: ${hospital.totalBeds} · ICU: ${hospital.availableIcu}',
                    details: hospital.hasTraumaCenter
                        ? 'Backend lists a trauma center. Availability is not live-confirmed.'
                        : 'Trauma center not listed by backend.',
                    contact: hospital.contact,
                    latitude: hospital.latitude,
                    longitude: hospital.longitude,
                  ),
                ),
              const SizedBox(height: 10),
              _sectionTitle('Shelters'),
              if (_shelters.isEmpty)
                const EmptyPanel(message: 'No shelter records returned.')
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
                        'Pet-friendly: ${shelter.petFriendly ? 'listed' : 'not listed'} · Wheelchair accessible: ${shelter.wheelchairAccessible ? 'listed' : 'not listed'} · Updated: ${formatTimestamp(shelter.lastUpdated)}',
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
                  label: const Text('Open map'),
                ),
                IconButton(
                  onPressed: () => _save(
                    id,
                    type,
                    title,
                    '$subtitle\n$details\nContact: $contact\nCoordinates: $latitude, $longitude',
                  ),
                  icon: const Icon(Icons.bookmark_add_outlined),
                  tooltip: AppText.text(widget.language, 'save'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
