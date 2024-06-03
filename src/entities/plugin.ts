import { Resource } from './resource.js';
import {
  ApplyRequestData,
  InitializeResponseData,
  PlanRequestData,
  PlanResponseData,
  ResourceConfig,
  ResourceOperation,
  ValidateRequestData,
  ValidateResponseData
} from 'codify-schemas';
import { Plan } from './plan.js';
import { splitUserConfig } from '../utils/utils.js';
import { ApplyValidationError } from './errors.js';

export class Plugin {
  planStorage: Map<string, Plan<any>>;

  static create(name: string, resources: Resource<any>[]) {
    const resourceMap = new Map<string, Resource<any>>(
      resources.map((r) => [r.typeId, r] as const)
    );

    return new Plugin(name, resourceMap);
  }

  constructor(
    public name: string,
    public resources: Map<string, Resource<ResourceConfig>>
  ) {
    this.planStorage = new Map();
  }

  async initialize(): Promise<InitializeResponseData> {
    for (const resource of this.resources.values()) {
      await resource.onInitialize();
    }

    return {
      resourceDefinitions: [...this.resources.values()]
        .map((r) => ({
          type: r.typeId,
          dependencies: r.dependencies,
        }))
    }
  }

  async validate(data: ValidateRequestData): Promise<ValidateResponseData> {
    const validationResults = [];
    for (const config of data.configs) {
      if (!this.resources.has(config.type)) {
        throw new Error(`Resource type not found: ${config.type}`);
      }

      const { parameters } = splitUserConfig(config);
      const validateResult = await this.resources.get(config.type)!.validateResource(parameters);

      validationResults.push({
        ...validateResult,
        resourceType: config.type,
        resourceName: config.name,
      });
    }

    await this.crossValidateResources(data.configs);
    return {
      validationResults
    };
  }

  async plan(data: PlanRequestData): Promise<PlanResponseData> {
    if (!this.resources.has(data.type)) {
      throw new Error(`Resource type not found: ${data.type}`);
    }

    const plan = await this.resources.get(data.type)!.plan(data);
    this.planStorage.set(plan.id, plan);

    return plan.toResponse();
  }

  async apply(data: ApplyRequestData): Promise<void> {
    if (!data.planId && !data.plan) {
      throw new Error(`For applies either plan or planId must be supplied`);
    }

    const plan = this.resolvePlan(data);

    const resource = this.resources.get(plan.getResourceType());
    if (!resource) {
      throw new Error('Malformed plan with resource that cannot be found');
    }

    await resource.apply(plan);

    // Perform a validation check after to ensure that the plan was properly applied.
    // Sometimes no errors are returned (exit code 0) but the apply was not successful
    const validationPlan = await resource.plan({ ...plan.resourceMetadata, ...plan.desiredConfig });
    if (validationPlan.changeSet.operation !== ResourceOperation.NOOP) {
      throw new ApplyValidationError(plan, validationPlan);
    }
  }

  private resolvePlan(data: ApplyRequestData): Plan<ResourceConfig> {
    const { planId, plan: planRequest } = data;

    if (planId) {
      if (!this.planStorage.has(planId)) {
        throw new Error(`Plan with id: ${planId} was not found`);
      }

      return this.planStorage.get(planId)!
    }

    if (!planRequest?.resourceType || !this.resources.has(planRequest.resourceType)) {
      throw new Error('Malformed plan. Resource type must be supplied or resource type was not found');
    }

    const resource = this.resources.get(planRequest.resourceType)!;
    return Plan.fromResponse(data.plan, resource.defaultValues);
  }

  protected async crossValidateResources(configs: ResourceConfig[]): Promise<void> {}

}
