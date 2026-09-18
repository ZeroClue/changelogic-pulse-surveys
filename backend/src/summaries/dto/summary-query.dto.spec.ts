import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SummaryQueryDto } from './summary-query.dto';

function errorsOf(query: Record<string, unknown>): Promise<string[]> {
  return validate(plainToInstance(SummaryQueryDto, query), {
    whitelist: true,
  }).then((errors) =>
    errors.map((error) =>
      error.constraints
        ? Object.values(error.constraints).join('; ')
        : 'unknown',
    ),
  );
}

describe('SummaryQueryDto (?week validation, review S-4)', () => {
  it('accepts an absent week', async () => {
    expect(await errorsOf({})).toEqual([]);
  });

  it('accepts a Monday date', async () => {
    expect(await errorsOf({ week: '2024-01-01' })).toEqual([]);
  });

  it('rejects a non-Monday date', async () => {
    // 2024-01-02 is a Tuesday.
    const messages = await errorsOf({ week: '2024-01-02' });
    expect(messages.join(' | ')).toMatch(/Monday/i);
  });

  it('rejects malformed dates', async () => {
    for (const week of [
      'not-a-date',
      '2024-1-1',
      '2024-02-30',
      '2024-01-01; --',
    ]) {
      const messages = await errorsOf({ week });
      expect(messages.join(' | ')).toMatch(/Monday/i);
    }
  });
});
