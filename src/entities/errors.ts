import { Plan } from './plan.js';
import { StringIndexedObject } from 'codify-schemas';

export class SudoError extends Error {
  command: string;

  constructor(command: string) {
    super();
    this.command = command;
  }
}

export class ApplyValidationError<T extends StringIndexedObject> extends Error {
  desiredPlan: Plan<T>;
  validatedPlan: Plan<T>;

  constructor(
    desiredPlan: Plan<T>,
    validatedPlan: Plan<T>
  ) {
    super();
    this.desiredPlan = desiredPlan;
    this.validatedPlan = validatedPlan;
  }
}
