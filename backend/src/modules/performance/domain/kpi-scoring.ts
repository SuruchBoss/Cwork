// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { KpiDirection } from '@prisma/client';
import { Decimal, round2 } from '../../../core/utils/money.util';

/**
 * KPI achievement and review scoring.
 *
 * Achievement is capped at 150% by default: uncapped achievement lets one
 * outlier goal mask failure everywhere else, which is the classic way a KPI
 * system stops meaning anything.
 */
export const DEFAULT_ACHIEVEMENT_CAP = 150;

export interface AchievementInput {
  direction: KpiDirection;
  targetValue: number | Decimal;
  actualValue: number | Decimal | null | undefined;
  baselineValue?: number | Decimal | null;
  cap?: number;
}

/** Achievement percentage for one goal (0–cap). */
export function computeAchievement(input: AchievementInput): Decimal | null {
  if (input.actualValue === null || input.actualValue === undefined) return null;

  const target = new Decimal(input.targetValue.toString());
  const actual = new Decimal(input.actualValue.toString());
  const cap = new Decimal(input.cap ?? DEFAULT_ACHIEVEMENT_CAP);

  let achievement: Decimal;

  switch (input.direction) {
    case KpiDirection.HIGHER_IS_BETTER: {
      if (target.isZero()) {
        // A zero target with any positive result is full achievement.
        achievement = actual.greaterThan(0) ? new Decimal(100) : new Decimal(0);
        break;
      }
      // With a baseline, measure progress across the gap rather than the raw ratio.
      if (input.baselineValue !== null && input.baselineValue !== undefined) {
        const baseline = new Decimal(input.baselineValue.toString());
        const gap = target.minus(baseline);
        achievement = gap.isZero()
          ? new Decimal(100)
          : actual.minus(baseline).dividedBy(gap).times(100);
        break;
      }
      achievement = actual.dividedBy(target).times(100);
      break;
    }

    case KpiDirection.LOWER_IS_BETTER: {
      if (target.isZero()) {
        achievement = actual.isZero() ? new Decimal(100) : new Decimal(0);
        break;
      }
      // Beating a "lower is better" target scores above 100.
      achievement = target.dividedBy(actual.isZero() ? new Decimal(0.0001) : actual).times(100);
      break;
    }

    case KpiDirection.EXACT_TARGET:
    default: {
      if (target.isZero()) {
        achievement = actual.isZero() ? new Decimal(100) : new Decimal(0);
        break;
      }
      // Penalise deviation in either direction, symmetrically.
      const deviation = actual.minus(target).abs().dividedBy(target);
      achievement = new Decimal(100).minus(deviation.times(100));
      break;
    }
  }

  const clamped = Decimal.max(new Decimal(0), Decimal.min(achievement, cap));
  return round2(clamped);
}

export interface WeightedGoal {
  weight: number | Decimal;
  achievement: number | Decimal | null;
}

export interface KpiScoreResult {
  totalWeight: Decimal;
  weightedScore: Decimal;
  /** True when weights total 100 — a review should not close otherwise. */
  isWeightValid: boolean;
  scoredGoals: number;
  unscoredGoals: number;
}

/** Weighted KPI score across a person's goals for one cycle. */
export function computeKpiScore(goals: WeightedGoal[]): KpiScoreResult {
  const totalWeight = goals.reduce((acc, g) => acc.plus(g.weight.toString()), new Decimal(0));

  const scored = goals.filter((g) => g.achievement !== null && g.achievement !== undefined);
  const weightedSum = scored.reduce(
    (acc, g) => acc.plus(new Decimal(g.achievement!.toString()).times(g.weight.toString())),
    new Decimal(0),
  );

  // Normalise by the weight of *scored* goals so an unscored goal does not
  // silently drag the total down before it has been assessed.
  const scoredWeight = scored.reduce((acc, g) => acc.plus(g.weight.toString()), new Decimal(0));

  return {
    totalWeight: round2(totalWeight),
    weightedScore: scoredWeight.isZero()
      ? new Decimal(0)
      : round2(weightedSum.dividedBy(scoredWeight)),
    isWeightValid: totalWeight.equals(100),
    scoredGoals: scored.length,
    unscoredGoals: goals.length - scored.length,
  };
}

export interface CompetencyScore {
  weight: number | Decimal;
  score: number | Decimal;
}

/** Weighted competency score, expressed as a percentage of `maxScale`. */
export function computeCompetencyScore(scores: CompetencyScore[], maxScale = 5): Decimal {
  if (scores.length === 0) return new Decimal(0);

  const totalWeight = scores.reduce((acc, s) => acc.plus(s.weight.toString()), new Decimal(0));
  const effectiveWeights = totalWeight.isZero()
    ? scores.map(() => new Decimal(1))
    : scores.map((s) => new Decimal(s.weight.toString()));

  const denominator = effectiveWeights.reduce((acc, w) => acc.plus(w), new Decimal(0));
  const weighted = scores.reduce(
    (acc, s, index) => acc.plus(new Decimal(s.score.toString()).times(effectiveWeights[index])),
    new Decimal(0),
  );

  return round2(weighted.dividedBy(denominator).dividedBy(maxScale).times(100));
}

export interface OverallScoreInput {
  kpiScore: number | Decimal | null;
  competencyScore: number | Decimal | null;
  kpiWeight: number;
  competencyWeight: number;
}

/** Blends KPI and competency scores using the cycle's configured split. */
export function computeOverallScore(input: OverallScoreInput): Decimal | null {
  const hasKpi = input.kpiScore !== null && input.kpiScore !== undefined;
  const hasCompetency = input.competencyScore !== null && input.competencyScore !== undefined;
  if (!hasKpi && !hasCompetency) return null;

  // If one half is missing, the other carries the whole weight rather than
  // scoring the employee as if they had failed it.
  if (!hasCompetency) return round2(new Decimal(input.kpiScore!.toString()));
  if (!hasKpi) return round2(new Decimal(input.competencyScore!.toString()));

  return round2(
    new Decimal(input.kpiScore!.toString())
      .times(input.kpiWeight)
      .plus(new Decimal(input.competencyScore!.toString()).times(input.competencyWeight))
      .dividedBy(input.kpiWeight + input.competencyWeight),
  );
}

export interface RatingBand {
  grade: string;
  min: number;
  label?: string;
}

/** Maps a score onto the cycle's rating scale (highest matching band wins). */
export function resolveGrade(score: Decimal | number | null, scale: RatingBand[]): string | null {
  if (score === null || scale.length === 0) return null;
  const value = new Decimal(score.toString());

  return (
    [...scale].sort((a, b) => b.min - a.min).find((band) => value.greaterThanOrEqualTo(band.min))
      ?.grade ?? null
  );
}
