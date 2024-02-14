import { ParameterOperation, ResourceOperation } from '../../../../codify/codify-schemas';

export class ChangeSet {
  operation: ResourceOperation
  parameterChanges: Array<{
    name: string;
    operation: ParameterOperation;
    previousValue: string;
    newValue: string;
  }>

  constructor(
    operation: ResourceOperation,
    parameterChanges: Array<{
      name: string;
      operation: ParameterOperation;
      previousValue: string;
      newValue: string;
    }>
  ) {
    this.operation = operation;
    this.parameterChanges = parameterChanges;
  }
}
