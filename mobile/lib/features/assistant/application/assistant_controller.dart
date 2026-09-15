import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/assistant_repository.dart';
import '../domain/assistant_models.dart';

final Provider<AssistantRepository> assistantRepositoryProvider =
    Provider<AssistantRepository>((Ref ref) => AssistantRepository(ref.watch(apiClientProvider)));

final FutureProvider<bool> assistantEnabledProvider = FutureProvider<bool>((Ref ref) {
  return ref.watch(assistantRepositoryProvider).isEnabled();
});

class ChatState {
  const ChatState({
    this.turns = const <ChatTurn>[],
    this.isSending = false,
    this.conversationId,
  });

  final List<ChatTurn> turns;
  final bool isSending;
  final String? conversationId;

  ChatState copyWith({
    List<ChatTurn>? turns,
    bool? isSending,
    String? conversationId,
  }) =>
      ChatState(
        turns: turns ?? this.turns,
        isSending: isSending ?? this.isSending,
        conversationId: conversationId ?? this.conversationId,
      );
}

class AssistantController extends StateNotifier<ChatState> {
  AssistantController(this._repository) : super(const ChatState());

  final AssistantRepository _repository;
  int _localId = 0;

  Future<void> send(String message) async {
    final String text = message.trim();
    if (text.isEmpty || state.isSending) return;

    state = state.copyWith(
      turns: <ChatTurn>[
        ...state.turns,
        ChatTurn(id: 'local-${_localId++}', isUser: true, text: text),
      ],
      isSending: true,
    );

    try {
      final ChatResult result = await _repository.chat(
        message: text,
        conversationId: state.conversationId,
      );

      state = state.copyWith(
        conversationId: result.conversationId,
        isSending: false,
        turns: <ChatTurn>[
          ...state.turns,
          ChatTurn(
            id: result.messageId.isEmpty ? 'local-${_localId++}' : result.messageId,
            isUser: false,
            text: result.reply,
            citations: result.citations,
            toolsUsed: result.toolsUsed,
          ),
        ],
      );
    } on Object catch (error) {
      state = state.copyWith(
        isSending: false,
        turns: <ChatTurn>[
          ...state.turns,
          ChatTurn(
            id: 'local-${_localId++}',
            isUser: false,
            text: _describe(error),
            isError: true,
          ),
        ],
      );
    }
  }

  Future<void> rate(String messageId, {required bool helpful}) async {
    // Feedback is best-effort: a failed rating must never interrupt the chat.
    try {
      await _repository.rate(messageId: messageId, helpful: helpful);
    } on Object {
      return;
    }
  }

  void reset() => state = const ChatState();

  String _describe(Object error) {
    final String message = error.toString();
    final int separator = message.indexOf(': ');
    return separator >= 0
        ? 'ขออภัย ${message.substring(separator + 2)}'
        : 'ขออภัย ไม่สามารถติดต่อผู้ช่วยได้ในขณะนี้';
  }
}

final StateNotifierProvider<AssistantController, ChatState> assistantControllerProvider =
    StateNotifierProvider<AssistantController, ChatState>((Ref ref) {
  return AssistantController(ref.watch(assistantRepositoryProvider));
});
