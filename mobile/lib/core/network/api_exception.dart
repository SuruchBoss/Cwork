import '../i18n/i18n.dart';

/// A failed API call, carrying the server's stable error `code`.
///
/// The UI branches on `code`, never on the message text — the server's message
/// is human prose that will change; codes are the contract. When the server
/// gives no message, the fallbacks are localised (CW-016).
class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.code,
    required this.message,
    this.details,
    this.requestId,
  });

  final int statusCode;
  final String code;
  final String message;
  final Object? details;
  final String? requestId;

  factory ApiException.fromResponse(int statusCode, Object? body) {
    if (body is Map) {
      return ApiException(
        statusCode: statusCode,
        code: body['code']?.toString() ?? 'UNKNOWN',
        message: body['message']?.toString() ?? tr0('An unexpected error occurred'),
        details: body['details'],
        requestId: body['requestId']?.toString(),
      );
    }
    return ApiException(
      statusCode: statusCode,
      code: 'UNKNOWN',
      message: tr0('An unexpected error occurred'),
    );
  }

  static ApiException get offline => ApiException(
        statusCode: 0,
        code: 'OFFLINE',
        message: tr0('Could not connect to the network'),
      );

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isOffline => code == 'OFFLINE';

  @override
  String toString() => 'ApiException($statusCode, $code): $message';
}
