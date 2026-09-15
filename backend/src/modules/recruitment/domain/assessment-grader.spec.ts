import { QuestionType } from '@prisma/client';
import { computeScorecardScore, gradeAssessment, type GradableQuestion } from './assessment-grader';

const questions: GradableQuestion[] = [
  { id: 'q1', type: QuestionType.SINGLE_CHOICE, correctKeys: ['b'], points: 2 },
  { id: 'q2', type: QuestionType.MULTIPLE_CHOICE, correctKeys: ['a', 'c'], points: 3 },
  { id: 'q3', type: QuestionType.TRUE_FALSE, correctKeys: ['true'], points: 1 },
  { id: 'q4', type: QuestionType.SHORT_ANSWER, correctKeys: ['Bangkok', 'กรุงเทพ'], points: 2 },
];

describe('gradeAssessment', () => {
  it('awards full marks for a perfect submission', () => {
    const result = gradeAssessment(
      questions,
      [
        { questionId: 'q1', selectedKeys: ['b'] },
        { questionId: 'q2', selectedKeys: ['a', 'c'] },
        { questionId: 'q3', selectedKeys: ['true'] },
        { questionId: 'q4', textAnswer: 'bangkok' },
      ],
      60,
    );

    expect(result.autoScore.toNumber()).toBe(8);
    expect(result.maxScore.toNumber()).toBe(8);
    expect(result.percentage.toNumber()).toBe(100);
    expect(result.isPassed).toBe(true);
  });

  it('treats a partially correct multiple choice as wrong', () => {
    const result = gradeAssessment(questions, [{ questionId: 'q2', selectedKeys: ['a'] }], 60);
    const q2 = result.answers.find((a) => a.questionId === 'q2');

    expect(q2?.isCorrect).toBe(false);
    expect(q2?.score.toNumber()).toBe(0);
  });

  it('rejects an over-selected multiple choice', () => {
    const result = gradeAssessment(
      questions,
      [{ questionId: 'q2', selectedKeys: ['a', 'b', 'c'] }],
      60,
    );
    expect(result.answers.find((a) => a.questionId === 'q2')?.isCorrect).toBe(false);
  });

  it('matches short answers case- and whitespace-insensitively', () => {
    const result = gradeAssessment(questions, [{ questionId: 'q4', textAnswer: '  BANGKOK ' }], 60);
    expect(result.answers.find((a) => a.questionId === 'q4')?.isCorrect).toBe(true);
  });

  it('accepts any listed variant of a short answer', () => {
    const result = gradeAssessment(questions, [{ questionId: 'q4', textAnswer: 'กรุงเทพ' }], 60);
    expect(result.answers.find((a) => a.questionId === 'q4')?.isCorrect).toBe(true);
  });

  it('scores an unanswered question as zero, not as skipped', () => {
    const result = gradeAssessment(questions, [], 60);
    expect(result.autoScore.toNumber()).toBe(0);
    expect(result.answers.every((a) => a.isCorrect === false)).toBe(true);
  });

  it('withholds the pass/fail verdict while essays await a human', () => {
    const withEssay: GradableQuestion[] = [
      ...questions,
      { id: 'q5', type: QuestionType.ESSAY, correctKeys: [], points: 10 },
    ];

    const result = gradeAssessment(
      withEssay,
      [
        { questionId: 'q1', selectedKeys: ['b'] },
        { questionId: 'q5', textAnswer: 'A long thoughtful answer.' },
      ],
      60,
    );

    expect(result.pendingManualPoints.toNumber()).toBe(10);
    expect(result.isPassed).toBeNull();
    expect(result.answers.find((a) => a.questionId === 'q5')?.needsManualGrading).toBe(true);
  });

  it('fails a submission below the passing score', () => {
    const result = gradeAssessment(questions, [{ questionId: 'q3', selectedKeys: ['true'] }], 60);
    expect(result.percentage.toNumber()).toBe(12.5);
    expect(result.isPassed).toBe(false);
  });

  it('handles an empty question set without dividing by zero', () => {
    const result = gradeAssessment([], [], 60);
    expect(result.percentage.toNumber()).toBe(0);
    expect(result.maxScore.toNumber()).toBe(0);
  });
});

describe('computeScorecardScore', () => {
  it('averages unweighted criteria', () => {
    expect(
      computeScorecardScore([
        { criterion: 'Technical', score: 4 },
        { criterion: 'Communication', score: 3 },
      ]).toNumber(),
    ).toBe(3.5);
  });

  it('respects weights', () => {
    expect(
      computeScorecardScore([
        { criterion: 'Technical', score: 5, weight: 3 },
        { criterion: 'Culture', score: 1, weight: 1 },
      ]).toNumber(),
    ).toBe(4);
  });

  it('returns zero for an empty scorecard', () => {
    expect(computeScorecardScore([]).toNumber()).toBe(0);
  });
});
