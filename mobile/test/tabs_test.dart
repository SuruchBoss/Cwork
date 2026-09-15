import 'package:flutter_test/flutter_test.dart';
import 'package:cwork/core/router/tabs.dart';
import 'package:cwork/features/auth/domain/session.dart';

SessionUser userWith(List<String> permissions) => SessionUser(
      id: 'u1',
      email: 'somchai@cwork.example',
      organizationId: 'org1',
      employeeId: 'e1',
      displayName: 'สมชาย ใจดี',
      roles: const <String>['EMPLOYEE'],
      permissions: permissions,
      locale: 'th',
    );

List<String> idsFor(SessionUser user) => visibleTabsFor(user).map((AppTab tab) => tab.id).toList();

void main() {
  group('visibleTabsFor', () {
    test('always shows home and profile, even with no permissions', () {
      expect(idsFor(userWith(<String>[])), <String>['home', 'profile']);
    });

    test('shows the employee self-service tabs', () {
      final List<String> ids = idsFor(
        userWith(<String>[Perm.leaveReadSelf, Perm.payslipReadSelf, Perm.assistantUse]),
      );

      expect(ids, <String>['home', 'leave', 'payslips', 'assistant', 'profile']);
    });

    test('hides the approvals tab from someone who cannot approve', () {
      expect(idsFor(userWith(<String>[Perm.leaveReadSelf])), isNot(contains('approvals')));
    });

    test('shows the approvals tab to a manager', () {
      final List<String> ids = idsFor(
        userWith(<String>[Perm.leaveReadSelf, Perm.approvalAct]),
      );

      expect(ids, contains('approvals'));
      // Approvals sits between leave and profile so the order stays stable.
      expect(ids.indexOf('approvals'), greaterThan(ids.indexOf('leave')));
    });

    test('hides the assistant tab when the deployment has no AI', () {
      expect(idsFor(userWith(<String>[Perm.leaveReadSelf])), isNot(contains('assistant')));
    });

    test('hides payslips from an account with no payslip permission', () {
      expect(idsFor(userWith(<String>[Perm.assistantUse])), isNot(contains('payslips')));
    });
  });

  group('SessionUser', () {
    test('falls back to email when there is no display name', () {
      const SessionUser user = SessionUser(
        id: 'u1',
        email: 'nobody@cwork.example',
        organizationId: 'org1',
        employeeId: null,
        displayName: null,
        roles: <String>[],
        permissions: <String>[],
        locale: 'th',
      );

      expect(user.name, 'nobody@cwork.example');
    });

    test('canAny is true when any one permission is held', () {
      final SessionUser user = userWith(<String>[Perm.leaveReadSelf]);

      expect(user.canAny(<String>[Perm.payslipReadSelf, Perm.leaveReadSelf]), isTrue);
      expect(user.canAny(<String>[Perm.payslipReadSelf]), isFalse);
    });

    test('parses the API payload', () {
      final SessionUser user = SessionUser.fromJson(<String, dynamic>{
        'id': 'u1',
        'email': 'a@b.c',
        'organizationId': 'org1',
        'employeeId': 'e1',
        'displayName': 'ชื่อ นามสกุล',
        'roles': <dynamic>['EMPLOYEE', 'MANAGER'],
        'permissions': <dynamic>['approval:act'],
        'locale': 'th',
      });

      expect(user.roles, <String>['EMPLOYEE', 'MANAGER']);
      expect(user.isApprover, isTrue);
    });
  });
}
