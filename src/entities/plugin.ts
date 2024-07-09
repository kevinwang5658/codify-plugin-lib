import {
  ApplyRequestData,
  InitializeResponseData,
  PlanRequestData,
  PlanResponseData,
  ResourceConfig,
  ValidateRequestData,
  ValidateResponseData
} from 'codify-schemas';

import { splitUserConfig } from '../utils/utils.js';
import { Plan } from './plan.js';
import { Resource } from './resource.js';

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
          dependencies: r.dependencies,
          type: r.typeId,
        }))
    }
  }

  async validate(data: ValidateRequestData): Promise<ValidateResponseData> {
    const validationResults = [];
    for (const config of data.configs) {
      if (!this.resources.has(config.type)) {
        throw new Error(`Resource type not found: ${config.type}`);
      }

      const { parameters, resourceMetadata } = splitUserConfig(config);
      const validation = await this.resources
        .get(config.type)!
        .validate(parameters, resourceMetadata);

      validationResults.push(validation);
    }

    await this.crossValidateResources(data.configs);
    return {
      resourceValidations: validationResults
    };
  }

  async plan(data: PlanRequestData): Promise<PlanResponseData> {
    const type = data.desired?.type ?? data.state?.type

    if (!type || !this.resources.has(type)) {
      throw new Error(`Resource type not found: ${type}`);
    }

    const plan = await this.resources.get(type)!.plan(
      data.desired ?? null,
      data.state ?? null,
      data.isStateful
    );
    this.planStorage.set(plan.id, plan);

    return plan.toResponse();
  }

  async apply(data: ApplyRequestData): Promise<void> {
    if (!data.planId && !data.plan) {
      throw new Error('For applies either plan or planId must be supplied');
    }

    const plan = this.resolvePlan(data);

    const resource = this.resources.get(plan.getResourceType());
    if (!resource) {
      throw new Error('Malformed plan with resource that cannot be found');
    }

    await resource.apply(plan);
  }

  private resolvePlan(data: ApplyRequestData): Plan<ResourceConfig> {
    const { plan: planRequest, planId } = data;

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
    return Plan.fromResponse(planRequest, resource.defaultValues);
  }

  protected async crossValidateResources(configs: ResourceConfig[]): Promise<void> {}

}
