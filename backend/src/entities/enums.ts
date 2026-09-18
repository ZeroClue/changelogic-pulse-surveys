export type OrganizationRole = 'manager' | 'member';

export type QuestionType = 'rating' | 'yes_no';

export const QUESTION_TYPES = ['rating', 'yes_no'] as const;

export const ORGANIZATION_ROLES = ['manager', 'member'] as const;
