import '../../../core/network/api_client.dart';
import '../domain/assistant_models.dart';

class AssistantRepository {
  const AssistantRepository(this._api);

  final ApiClient _api;

  Future<ChatResult> chat({required String message, String? conversationId}) async {
    final Map<String, dynamic> json = await _api.post<Map<String, dynamic>>(
      '/assistant/chat',
      body: <String, dynamic>{
        'message': message,
        'channel': 'MOBILE',
        if (conversationId != null) 'conversationId': conversationId,
      },
    );
    return ChatResult.fromJson(json);
  }

  Future<void> rate({
    required String messageId,
    required bool helpful,
    String? note,
  }) =>
      _api.post<dynamic>(
        '/assistant/messages/$messageId/feedback',
        body: <String, dynamic>{
          'feedback': helpful ? 'UP' : 'DOWN',
          if (note != null) 'note': note,
        },
      );
}
