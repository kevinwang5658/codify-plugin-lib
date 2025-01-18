import { Plan } from '../plan/plan.js';

export class ApplyValidationError extends Error {
  resourceType: string;
  resourceName?: string;
  plan: Plan<any>;

  constructor(plan: Plan<any>) {
    super(`Failed to apply changes to resource: "${plan.resourceId}". Additional changes are needed to complete apply.\nChanges remaining:\n${ApplyValidationError.prettyPrintPlan(plan)}`);

    this.resourceType = plan.coreParameters.type;
    this.resourceName = plan.coreParameters.name;
    this.plan = plan;
  }

  private static prettyPrintPlan(plan: Plan<any>): string {
    const { operation, parameters } = plan.toResponse();

    const prettyParameters = parameters.map(({ name, operation, previousValue, newValue }) => ({
      name,
      operation,
      currentValue: previousValue,
      desiredValue: newValue,
    }));

    return JSON.stringify({
      operation,
      parameters: prettyParameters,
    }, null, 2);
  }
}
