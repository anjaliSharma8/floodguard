class RoadNode {
  const RoadNode({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    this.elevationM,
  });

  final String id;
  final String name;
  final double latitude;
  final double longitude;
  final double? elevationM;

  factory RoadNode.fromJson(String id, Map<String, dynamic> json) {
    return RoadNode(
      id: id,
      name: _requiredString(json, 'name'),
      latitude: _requiredNumber(json, 'lat'),
      longitude: _requiredNumber(json, 'lng'),
      elevationM: _optionalNumber(json['elevationM']),
    );
  }
}

class RoadSegment {
  const RoadSegment({
    required this.id,
    required this.name,
    required this.from,
    required this.to,
    required this.distanceKm,
    required this.riskScore,
    required this.status,
    required this.coordinates,
    this.lastUpdated,
  });

  final String id;
  final String name;
  final String from;
  final String to;
  final double distanceKm;
  final double riskScore;
  final String status;
  final List<List<double>> coordinates;
  final DateTime? lastUpdated;

  factory RoadSegment.fromJson(Map<String, dynamic> json) {
    final rawCoordinates = json['coordinates'];
    final coordinates = <List<double>>[];
    if (rawCoordinates is List) {
      for (final point in rawCoordinates) {
        if (point is List &&
            point.length >= 2 &&
            point[0] is num &&
            point[1] is num) {
          coordinates.add([
            (point[0] as num).toDouble(),
            (point[1] as num).toDouble(),
          ]);
        }
      }
    }
    return RoadSegment(
      id: _requiredString(json, 'id'),
      name: _requiredString(json, 'name'),
      from: _requiredString(json, 'from'),
      to: _requiredString(json, 'to'),
      distanceKm: _requiredNumber(json, 'distanceKm'),
      riskScore: _requiredNumber(json, 'riskScore'),
      status: _requiredString(json, 'status'),
      coordinates: coordinates,
      lastUpdated: _optionalDate(json['lastUpdated']),
    );
  }
}

class RoadNetwork {
  const RoadNetwork({required this.nodes, required this.segments});

  final List<RoadNode> nodes;
  final List<RoadSegment> segments;

  factory RoadNetwork.fromJson(Object? value) {
    final json = _map(value, 'roads response');
    final rawNodes = _map(json['nodes'], 'nodes');
    final rawSegments = _list(json['segments'], 'segments');
    final nodes = rawNodes.entries
        .map(
          (entry) => RoadNode.fromJson(
            entry.key,
            _map(entry.value, 'road node ${entry.key}'),
          ),
        )
        .toList();
    return RoadNetwork(
      nodes: nodes,
      segments: rawSegments
          .map((entry) => RoadSegment.fromJson(_map(entry, 'road segment')))
          .toList(),
    );
  }
}

class CommunityReport {
  const CommunityReport({
    required this.id,
    required this.locationName,
    required this.reportType,
    required this.description,
    required this.severity,
    required this.timestamp,
    required this.verificationStatus,
    required this.latitude,
    required this.longitude,
    this.roadId,
    this.confidenceScore,
  });

  final String id;
  final String locationName;
  final String reportType;
  final String description;
  final String severity;
  final DateTime? timestamp;
  final String verificationStatus;
  final double latitude;
  final double longitude;
  final String? roadId;
  final double? confidenceScore;

  factory CommunityReport.fromJson(Map<String, dynamic> json) {
    return CommunityReport(
      id: _requiredString(json, 'id'),
      locationName: _requiredString(json, 'locationName'),
      reportType: _requiredString(json, 'reportType'),
      description: _optionalString(json['description']) ?? '',
      severity: _optionalString(json['severity']) ?? 'Unknown',
      timestamp: _optionalDate(json['timestamp']),
      verificationStatus:
          _optionalString(json['verificationStatus']) ?? 'Reported',
      latitude: _optionalNumber(json['lat']) ?? 0,
      longitude: _optionalNumber(json['lng']) ?? 0,
      roadId: _optionalString(json['roadId']),
      confidenceScore: _optionalNumber(json['confidenceScore']),
    );
  }
}

class Shelter {
  const Shelter({
    required this.id,
    required this.name,
    required this.address,
    required this.contact,
    required this.latitude,
    required this.longitude,
    required this.capacity,
    required this.currentOccupancy,
    required this.petFriendly,
    required this.wheelchairAccessible,
    this.lastUpdated,
  });

  final String id;
  final String name;
  final String address;
  final String contact;
  final double latitude;
  final double longitude;
  final int capacity;
  final int currentOccupancy;
  final bool petFriendly;
  final bool wheelchairAccessible;
  final DateTime? lastUpdated;

  factory Shelter.fromJson(Map<String, dynamic> json) {
    return Shelter(
      id: _requiredString(json, 'id'),
      name: _requiredString(json, 'name'),
      address: _optionalString(json['address']) ?? '',
      contact: _optionalString(json['contact']) ?? '',
      latitude: _requiredNumber(json, 'lat'),
      longitude: _requiredNumber(json, 'lng'),
      capacity: _optionalNumber(json['capacity'])?.round() ?? 0,
      currentOccupancy: _optionalNumber(json['currentOccupancy'])?.round() ?? 0,
      petFriendly: json['petFriendly'] == true,
      wheelchairAccessible: json['wheelchairAccessible'] == true,
      lastUpdated: _optionalDate(json['lastUpdated']),
    );
  }
}

class Hospital {
  const Hospital({
    required this.id,
    required this.name,
    required this.type,
    required this.contact,
    required this.latitude,
    required this.longitude,
    required this.totalBeds,
    required this.availableIcu,
    required this.hasTraumaCenter,
  });

  final String id;
  final String name;
  final String type;
  final String contact;
  final double latitude;
  final double longitude;
  final int totalBeds;
  final int availableIcu;
  final bool hasTraumaCenter;

  factory Hospital.fromJson(Map<String, dynamic> json) {
    return Hospital(
      id: _requiredString(json, 'id'),
      name: _requiredString(json, 'name'),
      type: _optionalString(json['type']) ?? '',
      contact: _optionalString(json['contact']) ?? '',
      latitude: _requiredNumber(json, 'lat'),
      longitude: _requiredNumber(json, 'lng'),
      totalBeds: _optionalNumber(json['totalBeds'])?.round() ?? 0,
      availableIcu: _optionalNumber(json['availableIcu'])?.round() ?? 0,
      hasTraumaCenter: json['hasTraumaCenter'] == true,
    );
  }
}

class EmergencyFacility {
  const EmergencyFacility({
    required this.id,
    required this.name,
    required this.type,
    required this.contact,
    required this.specialization,
    required this.serviceHours,
    required this.latitude,
    required this.longitude,
  });

  final String id;
  final String name;
  final String type;
  final String contact;
  final String specialization;
  final String serviceHours;
  final double latitude;
  final double longitude;

  factory EmergencyFacility.fromJson(Map<String, dynamic> json) {
    return EmergencyFacility(
      id: _requiredString(json, 'id'),
      name: _requiredString(json, 'name'),
      type: _optionalString(json['type']) ?? 'Emergency service',
      contact: _optionalString(json['contact']) ?? '',
      specialization: _optionalString(json['specialization']) ?? '',
      serviceHours: _optionalString(json['serviceHours']) ?? '',
      latitude: _requiredNumber(json, 'lat'),
      longitude: _requiredNumber(json, 'lng'),
    );
  }
}

class AuthSession {
  const AuthSession({
    required this.token,
    required this.userId,
    required this.fullName,
    required this.email,
    required this.role,
  });

  final String token;
  final String userId;
  final String fullName;
  final String email;
  final String role;

  factory AuthSession.fromJson(Object? value) {
    final json = _map(value, 'authentication response');
    final user = _map(json['user'], 'user');
    final token = _optionalString(json['token']);
    if (token == null || token.isEmpty) {
      throw const FormatException(
        'Authentication response did not include a token.',
      );
    }
    final role = _optionalString(user['role']);
    if (role != 'CITIZEN') {
      throw const FormatException(
        'This account is not a citizen account and cannot use citizen sign-in.',
      );
    }
    return AuthSession(
      token: token,
      userId: _requiredString(user, 'id'),
      fullName: _requiredString(user, 'fullName'),
      email: _requiredString(user, 'email'),
      role: role!,
    );
  }
}

class ChatReply {
  const ChatReply({required this.reply, required this.source, this.timestamp});

  final String reply;
  final String source;
  final DateTime? timestamp;

  factory ChatReply.fromJson(Object? value) {
    final json = _map(value, 'chat response');
    return ChatReply(
      reply: _requiredString(json, 'reply'),
      source: _optionalString(json['source']) ?? 'Backend response',
      timestamp: _optionalDate(json['timestamp']),
    );
  }
}

class SavedItem {
  const SavedItem({
    required this.id,
    required this.type,
    required this.title,
    required this.details,
    required this.savedAt,
  });

  final String id;
  final String type;
  final String title;
  final String details;
  final DateTime savedAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type,
    'title': title,
    'details': details,
    'savedAt': savedAt.toIso8601String(),
  };

  factory SavedItem.fromJson(Map<String, dynamic> json) => SavedItem(
    id: _requiredString(json, 'id'),
    type: _requiredString(json, 'type'),
    title: _requiredString(json, 'title'),
    details: _optionalString(json['details']) ?? '',
    savedAt: _optionalDate(json['savedAt']) ?? DateTime.now(),
  );
}

Map<String, dynamic> _map(Object? value, String field) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  throw FormatException('Expected an object for $field.');
}

List<dynamic> _list(Object? value, String field) {
  if (value is List) return value;
  throw FormatException('Expected a list for $field.');
}

String _requiredString(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is String && value.trim().isNotEmpty) return value;
  throw FormatException('Missing or invalid "$key" in API response.');
}

String? _optionalString(Object? value) => value is String ? value : null;

double _requiredNumber(Map<String, dynamic> json, String key) {
  final value = _optionalNumber(json[key]);
  if (value != null) return value;
  throw FormatException('Missing or invalid "$key" in API response.');
}

double? _optionalNumber(Object? value) =>
    value is num ? value.toDouble() : null;

DateTime? _optionalDate(Object? value) {
  if (value is! String) return null;
  return DateTime.tryParse(value);
}
