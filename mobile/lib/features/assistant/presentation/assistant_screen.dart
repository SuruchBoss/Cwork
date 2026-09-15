import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/platform/platform_config.dart';
import '../../../shared/widgets/common.dart';
import '../application/assistant_controller.dart';
import '../domain/assistant_models.dart';

const List<String> _suggestions = <String>[
  'เหลือวันลาพักร้อนกี่วัน',
  'ขอลาป่วยต้องใช้ใบรับรองแพทย์เมื่อไหร่',
  'ค่าโอทีวันหยุดคิดยังไง',
  'ขอหนังสือรับรองการทำงาน',
  'เดือนนี้มาสายกี่ครั้ง',
];

class AssistantScreen extends ConsumerStatefulWidget {
  const AssistantScreen({super.key});

  @override
  ConsumerState<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends ConsumerState<AssistantScreen> {
  final TextEditingController _input = TextEditingController();
  final ScrollController _scroll = ScrollController();

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send(String text) {
    if (text.trim().isEmpty) return;
    _input.clear();
    unawaited(ref.read(assistantControllerProvider.notifier).send(text));
    _scrollToEnd();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final ChatState chat = ref.watch(assistantControllerProvider);
    final AsyncValue<PlatformConfig> platform = ref.watch(platformConfigProvider);

    ref.listen<ChatState>(assistantControllerProvider, (ChatState? _, ChatState __) {
      _scrollToEnd();
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('ผู้ช่วย HR'),
        actions: <Widget>[
          if (chat.turns.isNotEmpty)
            IconButton(
              tooltip: 'เริ่มบทสนทนาใหม่',
              onPressed: () => ref.read(assistantControllerProvider.notifier).reset(),
              icon: const Icon(Icons.refresh),
            ),
        ],
      ),
      body: platform.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object error, StackTrace _) => ErrorView(
          error: error,
          onRetry: () => ref.invalidate(platformConfigProvider),
        ),
        data: (PlatformConfig config) {
          if (!config.assistantEnabled) {
            return const EmptyState(
              icon: Icons.power_off_outlined,
              title: 'ผู้ช่วย HR ยังไม่เปิดใช้งาน',
              description:
                  'องค์กรของคุณยังไม่ได้เปิดใช้ผู้ช่วย AI — ฟังก์ชันอื่นของแอปใช้งานได้ตามปกติ',
            );
          }

          return Column(
            children: <Widget>[
              Expanded(
                child: chat.turns.isEmpty
                    ? _Welcome(onPick: _send)
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.all(16),
                        itemCount: chat.turns.length + (chat.isSending ? 1 : 0),
                        itemBuilder: (BuildContext context, int index) {
                          if (index >= chat.turns.length) return const _TypingBubble();
                          return _Bubble(
                            turn: chat.turns[index],
                            onRate: (bool helpful) => ref
                                .read(assistantControllerProvider.notifier)
                                .rate(chat.turns[index].id, helpful: helpful),
                          );
                        },
                      ),
              ),
              SafeArea(
                top: false,
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    border: Border(
                      top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: <Widget>[
                      Expanded(
                        child: TextField(
                          controller: _input,
                          minLines: 1,
                          maxLines: 4,
                          textInputAction: TextInputAction.send,
                          onSubmitted: _send,
                          decoration: const InputDecoration(
                            hintText: 'พิมพ์คำถามเกี่ยวกับงาน HR…',
                            contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        onPressed: chat.isSending ? null : () => _send(_input.text),
                        icon: const Icon(Icons.send),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Welcome extends StatelessWidget {
  const _Welcome({required this.onPick});

  final void Function(String) onPick;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: <Widget>[
        const SizedBox(height: 24),
        Icon(Icons.auto_awesome, size: 44, color: theme.colorScheme.primary),
        const SizedBox(height: 12),
        Text(
          'ถามอะไรก็ได้เกี่ยวกับงาน HR',
          textAlign: TextAlign.center,
          style: theme.textTheme.titleMedium,
        ),
        const SizedBox(height: 6),
        Text(
          'ผู้ช่วยตอบจากระเบียบของบริษัท และเห็นเฉพาะข้อมูลของคุณเท่านั้น',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
        const SizedBox(height: 24),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          alignment: WrapAlignment.center,
          children: _suggestions
              .map(
                (String suggestion) => ActionChip(
                  label: Text(suggestion),
                  onPressed: () => onPick(suggestion),
                ),
              )
              .toList(),
        ),
      ],
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.turn, required this.onRate});

  final ChatTurn turn;
  final void Function(bool helpful) onRate;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool isUser = turn.isUser;

    final Color background = isUser
        ? theme.colorScheme.primary
        : turn.isError
            ? theme.colorScheme.errorContainer
            : theme.colorScheme.surfaceContainerHighest;
    final Color foreground = isUser
        ? theme.colorScheme.onPrimary
        : turn.isError
            ? theme.colorScheme.onErrorContainer
            : theme.colorScheme.onSurface;

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.82),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isUser ? 16 : 4),
            bottomRight: Radius.circular(isUser ? 4 : 16),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            SelectableText(turn.text, style: TextStyle(color: foreground, height: 1.5)),
            if (turn.citations.isNotEmpty) ...<Widget>[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: turn.citations
                    .map(
                      (AssistantCitation citation) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surface,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          citation.title,
                          style: TextStyle(fontSize: 11, color: theme.colorScheme.outline),
                        ),
                      ),
                    )
                    .toList(),
              ),
            ],
            if (!isUser && !turn.isError) ...<Widget>[
              const SizedBox(height: 4),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  IconButton(
                    onPressed: () => onRate(true),
                    icon: const Icon(Icons.thumb_up_outlined, size: 15),
                    visualDensity: VisualDensity.compact,
                    tooltip: 'คำตอบนี้มีประโยชน์',
                  ),
                  IconButton(
                    onPressed: () => onRate(false),
                    icon: const Icon(Icons.thumb_down_outlined, size: 15),
                    visualDensity: VisualDensity.compact,
                    tooltip: 'คำตอบนี้ไม่ช่วย',
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        child: const SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    );
  }
}
