/// The signed-in user, as returned by `GET /auth/me`.
class SessionUser {
  const SessionUser({
    required this.id,
    required this.email,
    required this.organizationId,
    required this.employeeId,
    required this.displayName,
    required this.roles,
    required this.permissions,
    required this.locale,
  });

  final String id;
  final String email;
  final String organizationId;
  final String? employeeId;
  final String? displayName;
  final List<String> roles;
  final List<String> permissions;
  final String locale;

  factory SessionUser.fromJson(Map<String, dynamic> json) => SessionUser(
        id: json['id'] as String,
        email: json['email'] as String,
        organizationId: json['organizationId'] as String,
        employeeId: json['employeeId'] as String?,
        displayName: json['displayName'] as String?,
        roles: (json['roles'] as List<dynamic>? ?? <dynamic>[])
            .map((dynamic e) => e.toString())
            .toList(),
        permissions: (json['permissions'] as List<dynamic>? ?? <dynamic>[])
            .map((dynamic e) => e.toString())
            .toList(),
        locale: json['locale'] as String? ?? 'th',
      );

  String get name => displayName ?? email;

  bool can(String permission) => permissions.contains(permission);

  bool canAny(List<String> required) => required.any((String p) => permissions.contains(p));

  /// Managers get an extra tab; the server still enforces every action.
  bool get isApprover => can('approval:act');
}

/// Permission constants mirroring the server's `permissions.ts`.
class Perm {
  const Perm._();

  static const String clockSelf = 'attendance:clock:self';
  static const String attendanceReadSelf = 'attendance:read:self';
  static const String leaveRequestSelf = 'leave:request:self';
  static const String leaveReadSelf = 'leave:read:self';
  static const String payslipReadSelf = 'payslip:read:self';
  static const String expenseSubmitSelf = 'expense:submit:self';
  static const String documentRequestSelf = 'document:request:self';
  static const String assistantUse = 'assistant:use';
  static const String approvalAct = 'approval:act';
  static const String overtimeRequestSelf = 'overtime:request:self';
}
