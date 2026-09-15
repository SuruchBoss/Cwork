/// A failed API call, carrying the server's stable error `code`.
///
/// The UI branches on `code`, never on the message text — messages are Thai
/// prose meant for humans and will change; codes are the contract.
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
        message: body['message']?.toString() ?? 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
        details: body['details'],
        requestId: body['requestId']?.toString(),
      );
    }
    return ApiException(
      statusCode: statusCode,
      code: 'UNKNOWN',
      message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
    );
  }

  static const ApiException offline = ApiException(
    statusCode: 0,
    code: 'OFFLINE',
    message: 'ไม่สามารถเชื่อมต่อเครือข่ายได้',
  );

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isOffline => code == 'OFFLINE';

  @override
  String toString() => 'ApiException($statusCode, $code): $message';
}
