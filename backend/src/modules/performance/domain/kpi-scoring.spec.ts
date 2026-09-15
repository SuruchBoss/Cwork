import { KpiDirection } from '@prisma/client';
import {
  computeAchievement,
  computeCompetencyScore,
  computeKpiScore,
  computeOverallScore,
  resolveGrade,
} from './kpi-scoring';

describe('computeAchievement', () => {
  it('scores a met target at 100%', () => {
    const result = computeAchievement({
      direction: KpiDirection.HIGHER_IS_BETTER,
      targetValue: 100,
      actualValue: 100,
    });
    expect(result?.toNumber()).toBe(100);
  });

  it('scores over-performance above 100%', () => {
    const result = computeAchievement({
      direction: KpiDirection.HIGHER_IS_BETTER,
      targetValue: 100,
      actualValue: 120,
    });
    expect(result?.toNumber()).toBe(120);
  });

  it('caps achievement so one outlier cannot mask the rest', () => {
    const result = computeAchievement({
      direction: KpiDirection.HIGHER_IS_BETTER,
      targetValue: 100,
      actualValue: 400,
    });
    expect(result?.toNumber()).toBe(150);
  });

  it('measures progress from a baseline when one is given', () => {
    // Target 100, baseline 50, actual 75 → half the gap closed.
    const result = computeAchievement({
      direction: KpiDirection.HIGHER_IS_BETTER,
      targetValue: 100,
      actualValue: 75,
      baselineValue: 50,
    });
    expect(result?.toNumber()).toBe(50);
  });

  it('rewards coming in under a lower-is-better target', () => {
    // Target 10 defects, actual 5 → 200%, capped to 150.
    const result = computeAchievement({
      direction: KpiDirection.LOWER_IS_BETTER,
      targetValue: 10,
      actualValue: 5,
    });
    expect(result?.toNumber()).toBe(150);
  });

  it('penalises exceeding a lower-is-better target', () => {
    const result = computeAchievement({
      direction: KpiDirection.LOWER_IS_BETTER,
      targetValue: 10,
      actualValue: 20,
    });
    expect(result?.toNumber()).toBe(50);
  });

  it('penalises deviation in both directions for an exact target', () => {
    const over = computeAchievement({
      direction: KpiDirection.EXACT_TARGET,
      targetValue: 100,
      actualValue: 120,
    });
    const under = computeAchievement({
      direction: KpiDirection.EXACT_TARGET,
      targetValue: 100,
      actualValue: 80,
    });
    expect(over?.toNumber()).toBe(80);
    expect(under?.toNumber()).toBe(80);
  });

  it('never returns a negative achievement', () => {
    const result = computeAchievement({
      direction: KpiDirection.EXACT_TARGET,
      targetValue: 100,
      actualValue: 1000,
    });
    expect(result?.toNumber()).toBe(0);
  });

  it('returns null while a goal has no actual value yet', () => {
    expect(
      computeAchievement({
        direction: KpiDirection.HIGHER_IS_BETTER,
        targetValue: 100,
        actualValue: null,
      }),
    ).toBeNull();
  });
});

describe('computeKpiScore', () => {
  it('weights goals by their declared weight', () => {
    const result = computeKpiScore([
      { weight: 70, achievement: 100 },
      { weight: 30, achievement: 50 },
    ]);

    expect(result.weightedScore.toNumber()).toBe(85);
    expect(result.isWeightValid).toBe(true);
  });

  it('flags a cycle whose weights do not total 100', () => {
    const result = computeKpiScore([
      { weight: 50, achievement: 100 },
      { weight: 30, achievement: 100 },
    ]);

    expect(result.isWeightValid).toBe(false);
    expect(result.totalWeight.toNumber()).toBe(80);
  });

  it('ignores unscored goals instead of treating them as zero', () => {
    const result = computeKpiScore([
      { weight: 50, achievement: 80 },
      { weight: 50, achievement: null },
    ]);

    expect(result.weightedScore.toNumber()).toBe(80);
    expect(result.unscoredGoals).toBe(1);
  });

  it('returns zero when nothing has been scored', () => {
    const result = computeKpiScore([{ weight: 100, achievement: null }]);
    expect(result.weightedScore.toNumber()).toBe(0);
  });
});

describe('computeCompetencyScore', () => {
  it('converts a 1–5 scale into a percentage', () => {
    const result = computeCompetencyScore([
      { weight: 1, score: 4 },
      { weight: 1, score: 5 },
    ]);
    expect(result.toNumber()).toBe(90);
  });

  it('falls back to equal weights when all weights are zero', () => {
    const result = computeCompetencyScore([
      { weight: 0, score: 3 },
      { weight: 0, score: 5 },
    ]);
    expect(result.toNumber()).toBe(80);
  });
});

describe('computeOverallScore', () => {
  it('blends KPI and competency by the cycle weights', () => {
    const result = computeOverallScore({
      kpiScore: 90,
      competencyScore: 70,
      kpiWeight: 70,
      competencyWeight: 30,
    });
    expect(result?.toNumber()).toBe(84);
  });

  it('gives the full weight to whichever half exists', () => {
    expect(
      computeOverallScore({
        kpiScore: 90,
        competencyScore: null,
        kpiWeight: 70,
        competencyWeight: 30,
      })?.toNumber(),
    ).toBe(90);
    expect(
      computeOverallScore({
        kpiScore: null,
        competencyScore: 60,
        kpiWeight: 70,
        competencyWeight: 30,
      })?.toNumber(),
    ).toBe(60);
  });

  it('returns null when nothing has been scored', () => {
    expect(
      computeOverallScore({
        kpiScore: null,
        competencyScore: null,
        kpiWeight: 70,
        competencyWeight: 30,
      }),
    ).toBeNull();
  });
});

describe('resolveGrade', () => {
  const scale = [
    { grade: 'A', min: 90 },
    { grade: 'B', min: 75 },
    { grade: 'C', min: 60 },
    { grade: 'D', min: 0 },
  ];

  it('picks the highest band the score reaches', () => {
    expect(resolveGrade(95, scale)).toBe('A');
    expect(resolveGrade(75, scale)).toBe('B');
    expect(resolveGrade(74.9, scale)).toBe('C');
    expect(resolveGrade(0, scale)).toBe('D');
  });

  it('returns null without a score or a scale', () => {
    expect(resolveGrade(null, scale)).toBeNull();
    expect(resolveGrade(90, [])).toBeNull();
  });
});
