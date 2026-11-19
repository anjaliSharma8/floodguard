import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sankatsetu/services/api_service.dart';

void main() {
  test(
    'road network parser reads nodes and segments from backend shape',
    () async {
      final service = ApiService(
        baseUrl: 'http://example.test/',
        client: MockClient((request) async {
          expect(request.url, Uri.parse('http://example.test/api/roads'));
          return http.Response(
            jsonEncode({
              'nodes': {
                'N_A': {'name': 'Point A', 'lat': 18.5, 'lng': 73.8},
              },
              'segments': [
                {
                  'id': 'R_A',
                  'name': 'Road A',
                  'from': 'N_A',
                  'to': 'N_B',
                  'distanceKm': 2.4,
                  'riskScore': 42,
                  'status': 'caution',
                  'coordinates': [
                    [18.5, 73.8],
                    [18.51, 73.81],
                  ],
                },
              ],
            }),
            200,
          );
        }),
      );

      final network = await service.fetchRoadNetwork();
      expect(network.nodes.single.id, 'N_A');
      expect(
        network.segments.single.coordinates,
        equals([
          [18.5, 73.8],
          [18.51, 73.81],
        ]),
      );
    },
  );

  test(
    'route request uses backend contract and configurable base URL',
    () async {
      final service = ApiService(
        baseUrl: 'http://laptop.example:3000/',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(
            request.url,
            Uri.parse('http://laptop.example:3000/api/routes/find'),
          );
          expect(jsonDecode(request.body), {
            'startNodeId': 'N_A',
            'targetNodeId': 'N_B',
            'lambdaRisk': 1.8,
          });
          return http.Response(
            jsonEncode({
              'startNode': {'id': 'N_A'},
              'targetNode': {'id': 'N_B'},
              'shortestRoute': {'feasible': false},
              'safestRoute': {'feasible': true},
            }),
            200,
          );
        }),
      );

      final response = await service.findRoute(
        startNodeId: 'N_A',
        targetNodeId: 'N_B',
      );
      expect(response['shortestRoute']['feasible'], isFalse);
      expect(response['safestRoute']['feasible'], isTrue);
    },
  );

  test('route response normalizes the current backend format', () async {
    final shortest = {
      'mode': 'shortest',
      'feasible': true,
      'nodeIds': ['N_A', 'N_B'],
      'nodes': [
        {'id': 'N_A', 'name': 'Point A', 'lat': 18.5, 'lng': 73.8},
        {'id': 'N_B', 'name': 'Point B', 'lat': 18.6, 'lng': 73.9},
      ],
      'edges': [
        {
          'id': 'R_A',
          'name': 'Road A',
          'distanceKm': 2.4,
          'riskScore': 42,
          'status': 'OPEN',
        },
      ],
      'totalDistanceKm': 2.4,
      'travelTimeMins': 8.0,
      'averageRiskScore': 42,
      'maxRiskScore': 42,
      'safetyRating': 'Moderate Risk',
    };
    final safest = {...shortest, 'mode': 'safest', 'totalDistanceKm': 2.8};
    final fastest = {...shortest, 'mode': 'fastest'};
    final alternatives = [safest];
    final service = ApiService(
      baseUrl: 'http://example.test',
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'originNode': {'id': 'N_A'},
            'targetNode': {'id': 'N_B'},
            'snappedOrigin': null,
            'snappedDest': null,
            'lambdaRisk': 1.5,
            'shortest': shortest,
            'fastest': fastest,
            'safest': safest,
            'alternatives': alternatives,
          }),
          200,
        ),
      ),
    );

    final response = await service.findRoute(
      startNodeId: 'N_A',
      targetNodeId: 'N_B',
    );

    expect(response['shortestRoute'], shortest);
    expect(response['safestRoute'], safest);
    expect(response['fastest'], fastest);
    expect(response['alternatives'], alternatives);
  });

  test('route response rejects missing and non-object route values', () async {
    for (final body in [
      {'shortest': <String, dynamic>{}},
      {
        'shortest': <String, dynamic>{},
        'safest': ['not', 'an object'],
      },
      {'shortest': 'not an object', 'safest': <String, dynamic>{}},
      {'shortestRoute': <String, dynamic>{}, 'safestRoute': null},
    ]) {
      final service = ApiService(
        baseUrl: 'http://example.test',
        client: MockClient((_) async => http.Response(jsonEncode(body), 200)),
      );

      await expectLater(
        service.findRoute(startNodeId: 'N_A', targetNodeId: 'N_B'),
        throwsA(
          isA<ApiException>().having(
            (error) => error.kind,
            'kind',
            ApiFailureKind.parsing,
          ),
        ),
      );
    }
  });

  test('HTTP failures preserve status and server error text', () async {
    final service = ApiService(
      baseUrl: 'http://example.test',
      client: MockClient(
        (_) async =>
            http.Response(jsonEncode({'error': 'Not authorized'}), 401),
      ),
    );

    await expectLater(
      service.fetchReports(),
      throwsA(
        isA<ApiException>()
            .having((error) => error.kind, 'kind', ApiFailureKind.http)
            .having(
              (error) => error.message,
              'message',
              contains('Not authorized'),
            ),
      ),
    );
  });

  test('request timeout is reported as a timeout failure', () async {
    final service = ApiService(
      baseUrl: 'http://example.test',
      timeout: const Duration(milliseconds: 5),
      client: MockClient(
        (_) =>
            Future<http.Response>.delayed(const Duration(milliseconds: 20), () {
              return http.Response(jsonEncode({'status': 'ok'}), 200);
            }),
      ),
    );

    await expectLater(
      service.checkHealth(),
      throwsA(
        isA<ApiException>()
            .having((error) => error.kind, 'kind', ApiFailureKind.timeout)
            .having((error) => error.message, 'message', contains('timed out')),
      ),
    );
  });

  test(
    'citizen login rejects non-citizen roles returned by the endpoint',
    () async {
      final service = ApiService(
        baseUrl: 'http://example.test',
        client: MockClient(
          (_) async => http.Response(
            jsonEncode({
              'token': 'server-token',
              'user': {
                'id': 'USR_ADMIN',
                'fullName': 'Admin',
                'email': 'admin@example.test',
                'role': 'ADMIN',
              },
            }),
            200,
          ),
        ),
      );

      await expectLater(
        service.loginCitizen('admin@example.test', 'password'),
        throwsA(
          isA<ApiException>().having(
            (error) => error.message,
            'message',
            contains('not a citizen account'),
          ),
        ),
      );
    },
  );
}
