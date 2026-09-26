// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { QuestionType } from '@prisma/client';
import { Decimal, round2 } from '../../../core/utils/money.util';

/**
 * Objective auto-grading for candidate assessments.
 *
 * Only question types with a single provable answer are graded here. Essays and
 * code are returned as `needsManualGrading` so a human scores them — an
 * automated guess on a free-text answer is worse than no score at all.
 */

export interface GradableQuestion {
  id: string;
  type: QuestionType;
  correctKeys: string[];
  points: number;
}

export interface SubmittedAnswer {
  questionId: string;
  selectedKeys?: string[];
  textAnswer?: string | null;
}

export interface GradedAnswer {
  questionId: string;
  score: Decimal;
  isCorrect: boolean | null;
  needsManualGrading: boolean;
}

export interface GradingResult {
  answers: GradedAnswer[];
  autoScore: Decimal;
  maxScore: Decimal;
  /** Points locked behind essay/code questions awaiting a human. */
  pendingManualPoints: Decimal;
  percentage: Decimal;
  isPassed: boolean | null;
}

const AUTO_GRADABLE: ReadonlySet<QuestionType> = new Set([
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.TRUE_FALSE,
  QuestionType.SHORT_ANSWER,
]);

export function gradeAssessment(
  questions: GradableQuestion[],
  submitted: SubmittedAnswer[],
  passingScorePercent: number,
): GradingResult {
  const byQuestion = new Map(submitted.map((a) => [a.questionId, a]));

  const answers: GradedAnswer[] = questions.map((question) => {
    const answer = byQuestion.get(question.id);
    const points = new Decimal(question.points);

    if (!AUTO_GRADABLE.has(question.type)) {
      return {
        questionId: question.id,
        score: new Decimal(0),
        isCorrect: null,
        needsManualGrading: true,
      };
    }

    if (!answer) {
      return {
        questionId: question.id,
        score: new Decimal(0),
        isCorrect: false,
        needsManualGrading: false,
      };
    }

    const isCorrect =
      question.type === QuestionType.SHORT_ANSWER
        ? matchesShortAnswer(answer.textAnswer, question.correctKeys)
        : matchesChoice(answer.selectedKeys ?? [], question.correctKeys);

    return {
      questionId: question.id,
      score: isCorrect ? points : new Decimal(0),
      isCorrect,
      needsManualGrading: false,
    };
  });

  const maxScore = questions.reduce((acc, q) => acc.plus(q.points), new Decimal(0));
  const autoScore = answers.reduce((acc, a) => acc.plus(a.score), new Decimal(0));
  const pendingManualPoints = questions
    .filter((q) => !AUTO_GRADABLE.has(q.type))
    .reduce((acc, q) => acc.plus(q.points), new Decimal(0));

  const percentage = maxScore.isZero()
    ? new Decimal(0)
    : round2(autoScore.dividedBy(maxScore).times(100));

  // A pass/fail verdict is withheld while manual points could still change it.
  const isPassed = pendingManualPoints.greaterThan(0)
    ? null
    : percentage.greaterThanOrEqualTo(passingScorePercent);

  return {
    answers,
    autoScore: round2(autoScore),
    maxScore: round2(maxScore),
    pendingManualPoints: round2(pendingManualPoints),
    percentage,
    isPassed,
  };
}

/** Multiple choice is all-or-nothing: the selected set must match exactly. */
function matchesChoice(selected: string[], correct: string[]): boolean {
  if (correct.length === 0) return false;
  const selectedSet = new Set(selected.map(normalise));
  const correctSet = new Set(correct.map(normalise));
  if (selectedSet.size !== correctSet.size) return false;
  for (const key of correctSet) {
    if (!selectedSet.has(key)) return false;
  }
  return true;
}

/** Short answers match any accepted variant, case- and space-insensitively. */
function matchesShortAnswer(text: string | null | undefined, accepted: string[]): boolean {
  if (!text) return false;
  const value = normalise(text);
  return accepted.some((candidate) => normalise(candidate) === value);
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface ScorecardCriterion {
  criterion: string;
  score: number;
  weight?: number;
}

/** Weighted average of an interviewer's scorecard criteria. */
export function computeScorecardScore(criteria: ScorecardCriterion[]): Decimal {
  if (criteria.length === 0) return new Decimal(0);

  const totalWeight = criteria.reduce((acc, c) => acc + (c.weight ?? 1), 0);
  if (totalWeight === 0) return new Decimal(0);

  const weighted = criteria.reduce(
    (acc, c) => acc.plus(new Decimal(c.score).times(c.weight ?? 1)),
    new Decimal(0),
  );
  return round2(weighted.dividedBy(totalWeight));
}
