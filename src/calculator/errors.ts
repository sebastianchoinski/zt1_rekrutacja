export interface InputIssue {
  path: string;
  message: string;
}

export class CalculationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly issues: InputIssue[] = [],
  ) {
    super(message);
    this.name = 'CalculationError';
  }
}
