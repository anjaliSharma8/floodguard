import 'package:material_ui/material_ui.dart';

import 'screens/safe_route_planner.dart';

void main() {
  runApp(const SankatSetuApp());
}

class SankatSetuApp extends StatelessWidget {
  const SankatSetuApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'SankatSetu',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF4F7FA),
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF087E8B)),
        fontFamily: 'Roboto',
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  void showMessage(BuildContext context, String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Image.asset(
                          'assets/sankatsetu_logo.jpeg',
                          key: const ValueKey('home-logo'),
                          width: 128,
                          height: 72,
                          fit: BoxFit.contain,
                          semanticLabel: 'SankatSetu logo',
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Semantics(
                      label: 'Selected area: Pune, Maharashtra',
                      excludeSemantics: true,
                      child: Row(
                        children: [
                          Icon(Icons.location_on, color: colors.primary),
                          const SizedBox(width: 8),
                          Text(
                            'Pune, Maharashtra',
                            style: textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: colors.primaryContainer,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.info_outline, color: colors.primary),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'Flood risk updates',
                                  style: textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: colors.onPrimaryContainer,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Live flood-risk monitoring is not available yet. '
                            'Check official alerts before travelling.',
                            style: textTheme.bodyMedium?.copyWith(
                              color: colors.onPrimaryContainer,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Emergency actions',
                      style: textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: const Color(0xFF123047),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Choose what you need.',
                      style: textTheme.bodyMedium?.copyWith(
                        color: colors.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 12),
                    ActionCard(
                      icon: Icons.alt_route,
                      title: 'Safe Route Planner',
                      subtitle: 'Plan a route and avoid flooded roads',
                      color: colors.primary,
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) =>
                                const SafeRoutePlannerScreen(),
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: 8),
                    ActionCard(
                      icon: Icons.emergency_outlined,
                      title: 'Emergency Assistance',
                      subtitle: 'Emergency help · Not available',
                      color: const Color(0xFFB3261E),
                      onTap: () {
                        showMessage(
                          context,
                          'Emergency assistance is not available yet.',
                        );
                      },
                    ),
                    const SizedBox(height: 8),
                    ActionCard(
                      icon: Icons.campaign_outlined,
                      title: 'Report an Incident',
                      subtitle: 'Incident reports · Not available',
                      color: const Color(0xFF8A4B08),
                      onTap: () {
                        showMessage(
                          context,
                          'Incident reporting is not available yet.',
                        );
                      },
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Be prepared',
                      style: textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: const Color(0xFF123047),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Keep essential supplies and emergency contacts ready.',
                      style: textTheme.bodyMedium?.copyWith(
                        color: colors.onSurfaceVariant,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        onDestinationSelected: (_) {},
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.map_outlined),
            label: 'Map',
            enabled: false,
          ),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            label: 'Reports',
            enabled: false,
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            label: 'Profile',
            enabled: false,
          ),
        ],
      ),
    );
  }
}

class ActionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const ActionCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
          child: Row(
            children: [
              Icon(icon, color: color, size: 26),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: const Color(0xFF123047),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.arrow_forward, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}
