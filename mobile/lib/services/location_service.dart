import 'package:geolocator/geolocator.dart';

import '../l10n/generated/app_localizations.dart';

class LocationService {
  Future<Position?> getCurrentPositionIfPermissionGranted() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      final permission = await Geolocator.checkPermission();
      if (permission != LocationPermission.always &&
          permission != LocationPermission.whileInUse) {
        return null;
      }
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      ).timeout(const Duration(seconds: 20));
    } on Exception catch (error) {
      throw LocationException('Could not get your location: $error');
    }
  }

  Future<Position> getCurrentPosition() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw const LocationException(
          'Location services are turned off. Enable them or choose a known map location.',
        );
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied) {
        throw const LocationException(
          'Location permission was denied. You can still choose a mapped location.',
        );
      }
      if (permission == LocationPermission.deniedForever) {
        throw const LocationException(
          'Location permission is disabled for this app. Enable it in system settings or choose a mapped location.',
        );
      }

      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      ).timeout(const Duration(seconds: 20));
    } on LocationException {
      rethrow;
    } on Exception catch (error) {
      throw LocationException('Could not get your location: $error');
    }
  }
}

class LocationException implements Exception {
  const LocationException(this.message);

  final String message;

  String localizedMessage(AppLocalizations l10n) {
    if (message.startsWith('Location services are turned off')) {
      return l10n.locationServiceOff;
    }
    if (message.startsWith('Location permission was denied')) {
      return l10n.locationPermissionDenied;
    }
    if (message.startsWith('Location permission is disabled')) {
      return l10n.locationPermissionPermanentlyDenied;
    }
    return l10n.locationUnavailable;
  }

  @override
  String toString() => message;
}
