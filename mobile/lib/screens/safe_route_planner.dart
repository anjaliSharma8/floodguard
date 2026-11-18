import 'package:material_ui/material_ui.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

class SafeRoutePlannerScreen extends StatefulWidget {
  const SafeRoutePlannerScreen({super.key});

  @override
  State<SafeRoutePlannerScreen> createState() => _SafeRoutePlannerScreenState();
}

class _SafeRoutePlannerScreenState extends State<SafeRoutePlannerScreen> {
  final TextEditingController sourceController = TextEditingController();

  final TextEditingController destinationController = TextEditingController();

  String selectedRoute = 'Safest';

  static const Color primaryColor = Color(0xFF087E8B);

  @override
  void dispose() {
    sourceController.dispose();
    destinationController.dispose();
    super.dispose();
  }

  void findRoute() {
    if (sourceController.text.trim().isEmpty ||
        destinationController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter both starting point and destination.'),
        ),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '$selectedRoute route requested. '
          'Live route calculation is not connected yet.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Safe Route Planner',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
      ),

      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Page heading
            const Text(
              'Find a Safer Way',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            const Text(
              'Plan your journey while avoiding potentially flooded areas.',
              style: TextStyle(color: Colors.grey, fontSize: 14),
            ),

            const SizedBox(height: 24),

            // Starting point
            const Text(
              'Starting Point',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),

            const SizedBox(height: 8),

            TextField(
              controller: sourceController,
              decoration: InputDecoration(
                hintText: 'Enter your current location',
                prefixIcon: const Icon(Icons.my_location, color: primaryColor),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),

            const SizedBox(height: 20),

            // Destination
            const Text(
              'Destination',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),

            const SizedBox(height: 8),

            TextField(
              controller: destinationController,
              decoration: InputDecoration(
                hintText: 'Enter destination',
                prefixIcon: const Icon(Icons.location_on, color: Colors.red),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Route preference
            const Text(
              'Route Preference',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),

            const SizedBox(height: 12),

            Row(
              children: [
                Expanded(
                  child: ChoiceChip(
                    label: const Text('Safest Route'),
                    selected: selectedRoute == 'Safest',
                    selectedColor: Colors.teal.shade100,
                    onSelected: (_) {
                      setState(() {
                        selectedRoute = 'Safest';
                      });
                    },
                  ),
                ),

                const SizedBox(width: 12),

                Expanded(
                  child: ChoiceChip(
                    label: const Text('Fastest Route'),
                    selected: selectedRoute == 'Fastest',
                    selectedColor: Colors.teal.shade100,
                    onSelected: (_) {
                      setState(() {
                        selectedRoute = 'Fastest';
                      });
                    },
                  ),
                ),
              ],
            ),

            const SizedBox(height: 24),

            // Interactive OpenStreetMap
            const Text(
              'Live Map',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 12),

            SizedBox(
              height: 320,
              width: double.infinity,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: FlutterMap(
                  options: const MapOptions(
                    initialCenter: LatLng(18.5204, 73.8567),
                    initialZoom: 12,
                    minZoom: 5,
                    maxZoom: 18,
                  ),

                  children: [
                    // OpenStreetMap tiles
                    TileLayer(
                      urlTemplate:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.example.sankatsetu',
                    ),

                    // Pune marker
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: LatLng(18.5204, 73.8567),
                          width: 50,
                          height: 50,
                          child: const Icon(
                            Icons.location_on,
                            color: Colors.red,
                            size: 42,
                          ),
                        ),
                      ],
                    ),

                    // Map attribution
                    RichAttributionWidget(
                      attributions: [
                        TextSourceAttribution('OpenStreetMap contributors'),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 20),

            // Flood safety notice
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.orange.shade200),
              ),

              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.warning_amber_rounded,
                    color: Colors.deepOrange,
                    size: 28,
                  ),

                  const SizedBox(width: 12),

                  Expanded(
                    child: Text(
                      'Safety Notice\n'
                      'Avoid waterlogged roads and never cross '
                      'flowing floodwater. Follow official '
                      'emergency instructions.',
                      style: TextStyle(
                        color: Colors.orange.shade900,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // Find route button
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                onPressed: findRoute,
                icon: const Icon(Icons.alt_route),
                label: const Text(
                  'Find Safe Route',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: primaryColor,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
