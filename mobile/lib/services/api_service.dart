import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import '../l10n/generated/app_localizations.dart';
import '../models/app_models.dart';

enum ApiFailureKind { network, timeout, http, parsing }

class ApiException implements Exception {
  const ApiException(this.message, this.kind, {this.statusCode});

  final String message;
  final ApiFailureKind kind;
  final int? statusCode;

  String localizedMessage(AppLocalizations l10n) => switch (kind) {
    ApiFailureKind.network => l10n.apiNetworkError,
    ApiFailureKind.timeout => l10n.apiTimeout,
    ApiFailureKind.parsing => l10n.apiInvalidResponse,
    ApiFailureKind.http => message,
  };

  @override
  String toString() => message;
}

class ApiService {
  ApiService({
    String? baseUrl,
    http.Client? client,
    this.timeout = const Duration(seconds: 25),
  }) : baseUrl = (baseUrl ?? ApiConfig.baseUrl).replaceFirst(
         RegExp(r'/+$'),
         '',
       ),
       _client = client ?? http.Client(),
       _ownsClient = client == null;

  final String baseUrl;
  final Duration timeout;
  final http.Client _client;
  final bool _ownsClient;

  Future<void> checkHealth() async {
    final response = await _request('GET', '/api/health');
    if (response is! Map || response['status'] != 'ok') {
      throw const ApiException(
        'The backend responded, but its health status was not OK.',
        ApiFailureKind.parsing,
      );
    }
  }

  Future<RoadNetwork> fetchRoadNetwork() async {
    final response = await _request('GET', '/api/roads');
    try {
      return RoadNetwork.fromJson(response);
    } on FormatException catch (error) {
      throw ApiException(
        'Could not read road network data: ${error.message}',
        ApiFailureKind.parsing,
      );
    }
  }

  Future<List<CommunityReport>> fetchReports({String? token}) async {
    final response = await _request('GET', '/api/reports', token: token);
    try {
      return _parseArray(
        response,
        'reports',
      ).map(CommunityReport.fromJson).toList();
    } on FormatException catch (error) {
      throw ApiException(
        'Could not read incident reports: ${error.message}',
        ApiFailureKind.parsing,
      );
    }
  }

  Future<Map<String, dynamic>> findRoute({
    required String startNodeId,
    required String targetNodeId,
    double lambdaRisk = 1.8,
  }) async {
    final response = await _request(
      'POST',
      '/api/routes/find',
      body: {
        'startNodeId': startNodeId,
        'targetNodeId': targetNodeId,
        'lambdaRisk': lambdaRisk,
      },
    );
    try {
      final result = _asMap(response, 'route response');
      final shortest = _asMap(
        result.containsKey('shortestRoute')
            ? result['shortestRoute']
            : result['shortest'],
        'shortest route',
      );
      final safest = _asMap(
        result.containsKey('safestRoute')
            ? result['safestRoute']
            : result['safest'],
        'safest route',
      );
      result['shortestRoute'] = shortest;
      result['safestRoute'] = safest;
      return result;
    } on FormatException catch (error) {
      throw ApiException(
        'Could not read route calculation response: ${error.message}',
        ApiFailureKind.parsing,
      );
    }
  }

  Future<CommunityReport> submitReport({
    required String token,
    required String locationName,
    required String reportType,
    required String description,
    required String severity,
    required double latitude,
    required double longitude,
    String? roadId,
  }) async {
    final optionalRoadId = roadId == null
        ? null
        : <String, String>{'roadId': roadId};
    final response = await _request(
      'POST',
      '/api/reports',
      token: token,
      body: {
        'locationName': locationName,
        'reportType': reportType,
        'description': description,
        'severity': severity,
        'lat': latitude,
        'lng': longitude,
        ...?optionalRoadId,
      },
    );
    try {
      if (response is! Map || response['success'] != true) {
        throw const FormatException('Report submission was not confirmed.');
      }
      return CommunityReport.fromJson(_asMap(response['report'], 'report'));
    } on FormatException catch (error) {
      throw ApiException(
        'The server did not confirm the report: ${error.message}',
        ApiFailureKind.parsing,
      );
    }
  }

  Future<List<Shelter>> fetchShelters() async {
    final response = await _request('GET', '/api/shelters');
    try {
      return _parseArray(response, 'shelters').map(Shelter.fromJson).toList();
    } on FormatException catch (error) {
      throw ApiException(
        'Could not read shelter data: ${error.message}',
        ApiFailureKind.parsing,
      );
    }
  }

  Future<List<Hospital>> fetchHospitals() async {
    final response = await _request('GET', '/api/hospitals');
    try {
      return _parseArray(response, 'hospitals').map(Hospital.fromJson).toList();
    } on FormatException catch (error) {
      throw ApiException(
        'Could not read hospital data: ${error.message}',
        ApiFailureKind.parsing,
      );
    }
  }

  Future<List<EmergencyFacility>> fetchEmergencyFacilities() async {
    final response = await _request('GET', '/api/emergency-facilities');
    try {
      return _parseArray(
        response,
        'emergency facilities',
      ).map(EmergencyFacility.fromJson).toList();
    } on FormatException catch (error) {
      throw ApiException(
        'Could not read emergency facility data: ${error.message}',
        ApiFailureKind.parsing,
      );
    }
  }

  Future<AuthSession> loginCitizen(String email, String password) async {
    return _authenticate('/api/auth/citizen/login', {
      'email': email,
      'password': password,
    });
  }

  Future<AuthSession> validateSession({required String token}) async {
    final response = await _request('GET', '/api/auth/me', token: token);
    try {
      final result = _asMap(response, 'session response');
      return AuthSession.fromJson({'token': token, 'user': result['user']});
    } on FormatException catch (error) {
      throw ApiException(
        'Could not read saved sign-in session: ${error.message}',
        ApiFailureKind.parsing,
      );
    }
  }

  Future<AuthSession> registerCitizen({
    required String fullName,
    required String email,
    required String password,
    String? phone,
    required String language,
  }) async {
    return _authenticate('/api/auth/citizen/register', {
      'fullName': fullName,
      'email': email,
      'password': password,
      if (phone?.isNotEmpty ?? false) 'phone': phone,
      'preferredLanguage': language,
    });
  }

  Future<AuthSession> _authenticate(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await _request('POST', path, body: body);
    try {
      return AuthSession.fromJson(response);
    } on FormatException catch (error) {
      throw ApiException(
        'Could not read sign-in response: ${error.message}',
        ApiFailureKind.parsing,
      );
    }
  }

  Future<ChatReply> sendChatMessage({
    required String message,
    required String language,
  }) async {
    final response = await _request(
      'POST',
      '/api/chatbot/message',
      body: {'message': message, 'lang': language},
    );
    try {
      return ChatReply.fromJson(response);
    } on FormatException catch (error) {
      throw ApiException(
        'Could not read assistant response: ${error.message}',
        ApiFailureKind.parsing,
      );
    }
  }

  Future<dynamic> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    String? token,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{'Accept': 'application/json'};
    if (body != null) headers['Content-Type'] = 'application/json';
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }

    try {
      late http.Response response;
      final encodedBody = body == null ? null : jsonEncode(body);
      switch (method) {
        case 'GET':
          response = await _client.get(uri, headers: headers).timeout(timeout);
        case 'POST':
          response = await _client
              .post(uri, headers: headers, body: encodedBody)
              .timeout(timeout);
        default:
          throw ArgumentError.value(
            method,
            'method',
            'Unsupported HTTP method',
          );
      }

      dynamic decoded;
      if (response.body.isNotEmpty) {
        try {
          decoded = jsonDecode(response.body);
        } on FormatException catch (error) {
          throw ApiException(
            'The server returned invalid JSON for $path: ${error.message}',
            ApiFailureKind.parsing,
          );
        }
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final serverMessage = decoded is Map
            ? decoded['error']?.toString()
            : null;
        throw ApiException(
          serverMessage == null || serverMessage.isEmpty
              ? 'Request to $path failed with HTTP ${response.statusCode}.'
              : 'Request to $path failed (${response.statusCode}): $serverMessage',
          ApiFailureKind.http,
          statusCode: response.statusCode,
        );
      }
      return decoded;
    } on TimeoutException {
      throw ApiException(
        'Request to $path timed out after ${timeout.inSeconds} seconds. Check that the backend is reachable from this device.',
        ApiFailureKind.timeout,
      );
    } on http.ClientException catch (error) {
      throw ApiException(
        'Network request to $baseUrl failed: ${error.message}',
        ApiFailureKind.network,
      );
    }
  }

  void close() {
    if (_ownsClient) _client.close();
  }

  List<Map<String, dynamic>> _parseArray(Object? value, String name) {
    if (value is! List) {
      throw ApiException(
        'The server response for $name was not a list.',
        ApiFailureKind.parsing,
      );
    }
    try {
      return value.map((entry) => _asMap(entry, name)).toList();
    } on FormatException catch (error) {
      throw ApiException(
        'The server response for $name is invalid: ${error.message}',
        ApiFailureKind.parsing,
      );
    }
  }

  Map<String, dynamic> _asMap(Object? value, String name) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    throw FormatException('Expected an object for $name.');
  }
}
