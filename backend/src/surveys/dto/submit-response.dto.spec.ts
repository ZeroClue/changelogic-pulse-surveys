import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import {
  ExactlyOneAnswerValueConstraint,
  SubmitResponseDto,
  UniqueQuestionIdsConstraint,
} from './submit-response.dto';

const ORG_A_SURVEY_QUESTIONS = [
  '00000000-0000-4000-8000-000000000111',
  '00000000-0000-4000-8000-000000000112',
];

function buildDto(answers: unknown[]): SubmitResponseDto {
  return plainToInstance(SubmitResponseDto, { answers });
}

async function errorsOf(dto: SubmitResponseDto): Promise<string[]> {
  const errors = await validate(dto, { whitelist: true });
  const messages: string[] = [];
  const walk = (list: ValidationError[]): void => {
    for (const error of list) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints));
      }
      if (error.children) {
        walk(error.children);
      }
    }
  };
  walk(errors);
  return messages;
}

describe('ExactlyOneAnswerValueConstraint', () => {
  const constraint = new ExactlyOneAnswerValueConstraint();

  it('accepts exactly one value', () => {
    expect(constraint.validate({ questionId: 'x', ratingValue: 3 })).toBe(true);
    expect(constraint.validate({ questionId: 'x', boolValue: true })).toBe(
      true,
    );
  });

  it('rejects both values', () => {
    expect(
      constraint.validate({ questionId: 'x', ratingValue: 3, boolValue: true }),
    ).toBe(false);
  });

  it('rejects neither value (including explicit nulls)', () => {
    expect(constraint.validate({ questionId: 'x' })).toBe(false);
    expect(
      constraint.validate({
        questionId: 'x',
        ratingValue: null,
        boolValue: null,
      }),
    ).toBe(false);
  });
});

describe('UniqueQuestionIdsConstraint', () => {
  const constraint = new UniqueQuestionIdsConstraint();

  it('accepts distinct questionIds', () => {
    expect(
      constraint.validate([
        { questionId: 'a', ratingValue: 1 },
        { questionId: 'b', boolValue: true },
      ]),
    ).toBe(true);
  });

  it('rejects duplicate questionIds', () => {
    expect(
      constraint.validate([
        { questionId: 'a', ratingValue: 1 },
        { questionId: 'a', ratingValue: 2 },
      ]),
    ).toBe(false);
  });
});

describe('SubmitResponseDto', () => {
  it('accepts a valid rating + yes/no payload', async () => {
    const dto = buildDto([
      { questionId: ORG_A_SURVEY_QUESTIONS[0], ratingValue: 4 },
      { questionId: ORG_A_SURVEY_QUESTIONS[1], boolValue: true },
    ]);
    expect(await errorsOf(dto)).toEqual([]);
  });

  it('rejects both ratingValue and boolValue on one answer', async () => {
    const dto = buildDto([
      {
        questionId: ORG_A_SURVEY_QUESTIONS[0],
        ratingValue: 4,
        boolValue: true,
      },
    ]);
    const messages = await errorsOf(dto);
    expect(messages.join(' | ')).toMatch(
      /exactly one of ratingValue or boolValue/i,
    );
  });

  it('rejects an answer with no value', async () => {
    const dto = buildDto([{ questionId: ORG_A_SURVEY_QUESTIONS[0] }]);
    const messages = await errorsOf(dto);
    expect(messages.join(' | ')).toMatch(
      /exactly one of ratingValue or boolValue/i,
    );
  });

  it('rejects duplicate questionIds', async () => {
    const dto = buildDto([
      { questionId: ORG_A_SURVEY_QUESTIONS[0], ratingValue: 2 },
      { questionId: ORG_A_SURVEY_QUESTIONS[0], ratingValue: 3 },
    ]);
    const messages = await errorsOf(dto);
    expect(messages.join(' | ')).toMatch(/duplicate questionIds/i);
  });

  it('rejects rating values outside 1–5', async () => {
    const dto = buildDto([
      { questionId: ORG_A_SURVEY_QUESTIONS[0], ratingValue: 9 },
    ]);
    const messages = await errorsOf(dto);
    expect(messages.join(' | ')).toMatch(/ratingValue/i);
  });

  it('rejects empty answers arrays', async () => {
    const dto = buildDto([]);
    const messages = await errorsOf(dto);
    expect(messages.join(' | ')).toMatch(/answers/i);
  });

  it('rejects more answers than the 3-question cap', async () => {
    const dto = buildDto([
      { questionId: ORG_A_SURVEY_QUESTIONS[0], ratingValue: 1 },
      { questionId: ORG_A_SURVEY_QUESTIONS[1], ratingValue: 2 },
      { questionId: ORG_A_SURVEY_QUESTIONS[0], boolValue: true },
      { questionId: ORG_A_SURVEY_QUESTIONS[1], boolValue: false },
    ]);
    const messages = await errorsOf(dto);
    expect(messages.join(' | ')).toMatch(/answers/i);
  });

  it('rejects non-uuid questionIds', async () => {
    const dto = buildDto([{ questionId: 'not-a-uuid', ratingValue: 1 }]);
    const messages = await errorsOf(dto);
    expect(messages.join(' | ')).toMatch(/questionId/i);
  });
});
