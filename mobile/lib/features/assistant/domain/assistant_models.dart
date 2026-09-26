// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

class AssistantCitation {
  const AssistantCitation({required this.documentId, required this.title});

  final String documentId;
  final String title;

  factory AssistantCitation.fromJson(Map<String, dynamic> json) => AssistantCitation(
        documentId: json['documentId'] as String,
        title: json['title'] as String,
      );
}

class ChatTurn {
  const ChatTurn({
    required this.id,
    required this.isUser,
    required this.text,
    this.citations = const <AssistantCitation>[],
    this.toolsUsed = const <String>[],
    this.isError = false,
  });

  final String id;
  final bool isUser;
  final String text;
  final List<AssistantCitation> citations;
  final List<String> toolsUsed;
  final bool isError;
}

class ChatResult {
  const ChatResult({
    required this.conversationId,
    required this.messageId,
    required this.reply,
    required this.citations,
    required this.toolsUsed,
  });

  final String conversationId;
  final String messageId;
  final String reply;
  final List<AssistantCitation> citations;
  final List<String> toolsUsed;

  factory ChatResult.fromJson(Map<String, dynamic> json) => ChatResult(
        conversationId: json['conversationId'] as String,
        messageId: json['messageId'] as String? ?? '',
        reply: json['reply'] as String,
        citations: (json['citations'] as List<dynamic>? ?? <dynamic>[])
            .map((dynamic e) => AssistantCitation.fromJson(e as Map<String, dynamic>))
            .toList(),
        toolsUsed: (json['toolsUsed'] as List<dynamic>? ?? <dynamic>[])
            .map((dynamic e) => e.toString())
            .toList(),
      );
}
