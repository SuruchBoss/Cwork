import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/leave_repository.dart';
import '../domain/leave_models.dart';

final Provider<LeaveRepository> leaveRepositoryProvider =
    Provider<LeaveRepository>((Ref ref) => LeaveRepository(ref.watch(apiClientProvider)));

final FutureProvider<List<LeaveBalance>> leaveBalancesProvider =
    FutureProvider<List<LeaveBalance>>((Ref ref) {
  return ref.watch(leaveRepositoryProvider).balances();
});

final FutureProvider<List<LeaveType>> leaveTypesProvider =
    FutureProvider<List<LeaveType>>((Ref ref) {
  return ref.watch(leaveRepositoryProvider).types();
});

final FutureProvider<List<LeaveRequest>> myLeaveRequestsProvider =
    FutureProvider<List<LeaveRequest>>((Ref ref) {
  return ref.watch(leaveRepositoryProvider).myRequests();
});

/// Refreshes everything a leave change can affect, in one place so no screen
/// is left showing a stale balance after a submit or cancel.
void invalidateLeave(Ref ref) {
  ref.invalidate(leaveBalancesProvider);
  ref.invalidate(myLeaveRequestsProvider);
}
