import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/i18n/i18n.dart';
import '../../core/theme/app_theme.dart';

/// Small shared widgets. Kept deliberately plain: the value of this app is in
/// clocking in reliably, not in bespoke chrome.

class StatusChip extends StatelessWidget {
  const StatusChip({required this.label, required this.status, super.key});

  final String label;
  final String status;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: StatusColors.background(context, status),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: StatusColors.foreground(context, status),
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class SectionCard extends StatelessWidget {
  const SectionCard({
    required this.child,
    this.title,
    this.trailing,
    this.padding = const EdgeInsets.all(16),
    super.key,
  });

  final Widget child;
  final String? title;
  final Widget? trailing;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: padding,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (title != null) ...<Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      title!,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                  ),
                  if (trailing != null) trailing!,
                ],
              ),
              const SizedBox(height: 12),
            ],
            child,
          ],
        ),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.title,
    this.icon = Icons.inbox_outlined,
    this.description,
    this.action,
    super.key,
  });

  final String title;
  final IconData icon;
  final String? description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 44, color: theme.colorScheme.outline),
            const SizedBox(height: 12),
            Text(title, style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
            if (description != null) ...<Widget>[
              const SizedBox(height: 6),
              Text(
                description!,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                textAlign: TextAlign.center,
              ),
            ],
            if (action != null) ...<Widget>[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}

/// Renders a failed load with the server's own message and a retry.
class ErrorView extends ConsumerWidget {
  const ErrorView({required this.error, this.onRetry, super.key});

  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String raw = error.toString();
    final int separator = raw.indexOf(': ');
    final String message = separator >= 0 ? raw.substring(separator + 2) : raw;

    return EmptyState(
      icon: Icons.error_outline,
      title: ref.tr('Could not load'),
      description: message,
      action: onRetry == null
          ? null
          : OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: Text(ref.tr('Try again')),
            ),
    );
  }
}

class LabeledValue extends StatelessWidget {
  const LabeledValue({
    required this.label,
    required this.value,
    this.emphasize = false,
    super.key,
  });

  final String label;
  final String value;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Expanded(
            child: Text(
              label,
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            value,
            textAlign: TextAlign.right,
            style: emphasize
                ? theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)
                : theme.textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}

class LoadingList extends StatelessWidget {
  const LoadingList({this.itemCount = 4, super.key});

  final int itemCount;

  @override
  Widget build(BuildContext context) {
    final Color base = Theme.of(context).colorScheme.surfaceContainerHighest;
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: itemCount,
      separatorBuilder: (BuildContext _, int __) => const SizedBox(height: 12),
      itemBuilder: (BuildContext _, int __) => Container(
        height: 74,
        decoration: BoxDecoration(color: base, borderRadius: BorderRadius.circular(14)),
      ),
    );
  }
}
