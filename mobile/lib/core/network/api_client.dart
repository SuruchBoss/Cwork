import 'dart:async';

import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

/// Called when the refresh token is rejected and the session is unrecoverable.
typedef SessionExpiredCallback = void Function();

/// HTTP client for the HRIS API.
///
/// Owns one thing the rest of the app should never think about: when the access
/// token expires mid-session, the first 401 triggers a refresh and every
/// concurrent request waits on that single refresh. Without this, a screen that
/// fires three requests at once would rotate the refresh token three times and
/// the server's reuse detection would revoke the whole session.
class ApiClient {
  ApiClient({
    required TokenStorage tokenStorage,
    required SessionExpiredCallback onSessionExpired,
    Dio? dio,
  })  : _tokenStorage = tokenStorage,
        _onSessionExpired = onSessionExpired,
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: AppConfig.apiBaseUrl,
                connectTimeout: AppConfig.connectTimeout,
                receiveTimeout: AppConfig.receiveTimeout,
                contentType: 'application/json',
                // Let the interceptor decide: Dio must not throw before we can
                // inspect a 401 and attempt a refresh.
                validateStatus: (int? status) => status != null && status < 500,
              ),
            ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (RequestOptions options, RequestInterceptorHandler handler) async {
          if (options.extra['anonymous'] != true) {
            final String? token = await _tokenStorage.readAccessToken();
            if (token != null) {
              options.headers['Authorization'] = 'Bearer $token';
            }
          }
          handler.next(options);
        },
      ),
    );
  }

  final Dio _dio;
  final TokenStorage _tokenStorage;
  final SessionExpiredCallback _onSessionExpired;

  Future<String?>? _refreshInFlight;

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? query,
    bool anonymous = false,
  }) =>
      _send<T>('GET', path, query: query, anonymous: anonymous);

  Future<T> post<T>(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool anonymous = false,
  }) =>
      _send<T>('POST', path, body: body, query: query, anonymous: anonymous);

  Future<T> patch<T>(String path, {Object? body}) => _send<T>('PATCH', path, body: body);

  Future<T> delete<T>(String path, {Object? body}) => _send<T>('DELETE', path, body: body);

  Future<T> _send<T>(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool anonymous = false,
  }) async {
    Response<dynamic> response;
    try {
      response = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(method: method, extra: <String, dynamic>{'anonymous': anonymous}),
      );
    } on DioException catch (error) {
      if (error.type == DioExceptionType.connectionError ||
          error.type == DioExceptionType.connectionTimeout) {
        throw ApiException.offline;
      }
      throw ApiException.fromResponse(
        error.response?.statusCode ?? 500,
        error.response?.data,
      );
    }

    if (response.statusCode == 401 && !anonymous) {
      final String? refreshed = await _refreshOnce();
      if (refreshed == null) {
        _onSessionExpired();
        throw ApiException.fromResponse(401, response.data);
      }
      return _send<T>(method, path, body: body, query: query, anonymous: anonymous);
    }

    final int status = response.statusCode ?? 500;
    if (status >= 400) {
      throw ApiException.fromResponse(status, response.data);
    }

    return response.data as T;
  }

  /// Collapses concurrent refresh attempts into one in-flight request.
  Future<String?> _refreshOnce() {
    final Future<String?>? existing = _refreshInFlight;
    if (existing != null) return existing;

    final Future<String?> attempt = _performRefresh();
    _refreshInFlight = attempt;
    return attempt.whenComplete(() => _refreshInFlight = null);
  }

  Future<String?> _performRefresh() async {
    final String? refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken == null) return null;

    try {
      final Response<dynamic> response = await _dio.post<dynamic>(
        '/auth/refresh',
        data: <String, dynamic>{'refreshToken': refreshToken},
        options: Options(extra: <String, dynamic>{'anonymous': true}),
      );

      if (response.statusCode != 200 || response.data is! Map) return null;

      final Map<dynamic, dynamic> data = response.data as Map<dynamic, dynamic>;
      final String? access = data['accessToken'] as String?;
      final String? refresh = data['refreshToken'] as String?;
      if (access == null || refresh == null) return null;

      await _tokenStorage.saveTokens(accessToken: access, refreshToken: refresh);
      return access;
    } on DioException {
      return null;
    }
  }
}
