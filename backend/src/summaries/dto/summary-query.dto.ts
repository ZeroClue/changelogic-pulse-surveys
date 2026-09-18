import { IsOptional, Validate } from 'class-validator';
import {
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { parseMondayWeekParam } from '../../common/weeks';

/**
 * `?week=` must be a real calendar date in `YYYY-MM-DD` form AND a Monday
 * (SPEC §3, review S-4). Anything else is a 400 from the validation pipe.
 */
@ValidatorConstraint({ name: 'mondayWeekDate', async: false })
export class MondayWeekDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null || value === '') {
      return true;
    }
    return typeof value === 'string' && parseMondayWeekParam(value) !== null;
  }

  defaultMessage(): string {
    return 'week must be a Monday date in YYYY-MM-DD form';
  }
}

export class SummaryQueryDto {
  /** Optional Monday (YYYY-MM-DD); defaults to the current calendar week. */
  @IsOptional()
  @Validate(MondayWeekDateConstraint)
  week?: string;
}
