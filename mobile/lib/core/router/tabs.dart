// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/material.dart';

import '../../features/approvals/presentation/approvals_screen.dart';
import '../../features/assistant/presentation/assistant_screen.dart';
import '../../features/auth/domain/session.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/leave/presentation/leave_screen.dart';
import '../../features/payslip/presentation/payslip_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';

/// One bottom-navigation destination.
class AppTab {
  const AppTab({
    required this.id,
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.screen,
  });

  final String id;

  /// An English message key (CW-016); the shell translates it with `ref.tr`.
  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final Widget screen;
}

/// Navigation is derived from the user's permissions, not hard-coded, so a
/// role never sees a tab whose API would refuse it. The server still enforces
/// every action — this only avoids showing a dead end.
///
/// `assistantEnabled` is a second, different question. Every role carries
/// `assistant:use`, and the server ships with the assistant off, so permissions
/// alone would put a tab in front of every employee that opens onto an
/// explanation of why it does not work. A control that fails when pressed reads
/// as a broken product rather than a disabled option.
///
/// Kept out of the widget so it can be unit-tested without pumping the tree.
List<AppTab> visibleTabsFor(SessionUser user, {required bool assistantEnabled}) {
  return <AppTab>[
    const AppTab(
      id: 'home',
      label: 'Home',
      icon: Icons.home_outlined,
      selectedIcon: Icons.home,
      screen: HomeScreen(),
    ),
    if (user.can(Perm.leaveReadSelf))
      const AppTab(
        id: 'leave',
        label: 'Leave',
        icon: Icons.beach_access_outlined,
        selectedIcon: Icons.beach_access,
        screen: LeaveScreen(),
      ),
    if (user.isApprover)
      const AppTab(
        id: 'approvals',
        label: 'Approvals',
        icon: Icons.task_alt_outlined,
        selectedIcon: Icons.task_alt,
        screen: ApprovalsScreen(),
      ),
    if (user.can(Perm.payslipReadSelf))
      const AppTab(
        id: 'payslips',
        label: 'Slips',
        icon: Icons.receipt_long_outlined,
        selectedIcon: Icons.receipt_long,
        screen: PayslipScreen(),
      ),
    if (assistantEnabled && user.can(Perm.assistantUse))
      const AppTab(
        id: 'assistant',
        label: 'Assistant',
        icon: Icons.auto_awesome_outlined,
        selectedIcon: Icons.auto_awesome,
        screen: AssistantScreen(),
      ),
    const AppTab(
      id: 'profile',
      label: 'Profile',
      icon: Icons.person_outline,
      selectedIcon: Icons.person,
      screen: ProfileScreen(),
    ),
  ];
}
