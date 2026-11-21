import 'package:material_ui/material_ui.dart';

import '../l10n/generated/app_localizations.dart';

const sankatPrimary = Color(0xFF087E8B);
const sankatInk = Color(0xFF123047);

String localizedReportType(AppLocalizations l10n, String type) =>
    switch (type) {
      'Waterlogging' => l10n.reportTypeWaterlogging,
      'Road flooded' => l10n.reportTypeRoadFlooded,
      'Road blocked' => l10n.reportTypeRoadBlocked,
      'Heavy rainfall' => l10n.reportTypeHeavyRainfall,
      'Drainage overflow' => l10n.reportTypeDrainageOverflow,
      'Fallen tree' => l10n.reportTypeFallenTree,
      'Traffic disruption' => l10n.reportTypeTrafficDisruption,
      'Rescue required' => l10n.reportTypeRescueRequired,
      _ => type,
    };

class FeatureTile extends StatelessWidget {
  const FeatureTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.white,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                height: 46,
                width: 46,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(icon, color: color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: sankatInk,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Colors.black54,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.black45),
            ],
          ),
        ),
      ),
    );
  }
}

class ErrorPanel extends StatelessWidget {
  const ErrorPanel({required this.message, this.onRetry, super.key});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        border: Border.all(color: Colors.red.shade200),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(message, style: TextStyle(color: Colors.red.shade900)),
          if (onRetry != null) ...[
            const SizedBox(height: 6),
            TextButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: Text(l10n.retryAction),
            ),
          ],
        ],
      ),
    );
  }
}

class DemoDataNotice extends StatelessWidget {
  const DemoDataNotice({super.key, this.text});

  final String? text;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: Colors.amber.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.amber.shade200),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, color: Colors.amber.shade900, size: 19),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text ?? l10n.backendRecordsNotice,
              style: TextStyle(color: Colors.amber.shade900, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class EmptyPanel extends StatelessWidget {
  const EmptyPanel({
    required this.message,
    this.icon = Icons.inbox_outlined,
    super.key,
  });

  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 42, color: Colors.blueGrey.shade300),
            const SizedBox(height: 10),
            Text(message, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

String formatTimestamp(DateTime? timestamp, {required String unavailable}) {
  if (timestamp == null) return unavailable;
  return timestamp.toLocal().toString().replaceFirst(RegExp(r'\.\d+$'), '');
}

Color riskColor(double score) {
  if (score >= 60) return Colors.red;
  if (score >= 30) return Colors.orange;
  return Colors.green;
}

String riskLabel(double score) {
  if (score >= 60) return 'High';
  if (score >= 30) return 'Medium';
  return 'Low';
}
