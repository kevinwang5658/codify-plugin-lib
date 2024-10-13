import {
  ApplyRequestData,
  InitializeResponseData,
  PlanRequestData,
  PlanResponseData,
  ResourceConfig,
  ValidateRequestData,
  ValidateResponseData
} from 'codify-schemas';

import { Plan } from '../plan/plan.js';
import { Resource } from '../resource/resource.js';
import { ResourceController } from '../resource/resource-controller.js';

export class Plugin {
  planStorage: Map<string, Plan<any>>;

  constructor(
    public name: string,
    public resourceControllers: Map<string, ResourceController<ResourceConfig>>
  ) {
    this.planStorage = new Map();
  }

  static create(name: string, resources: Resource<any>[]) {
    const controllers = resources
      .map((resource) => new ResourceController(resource))

    const controllersMap = new Map<string, ResourceController<any>>(
      controllers.map((r) => [r.typeId, r] as const)
    );

    return new Plugin(name, controllersMap);
  }

  async initialize(): Promise<InitializeResponseData> {
    for (const controller of this.resourceControllers.values()) {
      await controller.initialize();
    }

    return {
      resourceDefinitions: [...this.resourceControllers.values()]
        .map((r) => ({
          dependencies: r.dependencies,
          type: r.typeId,
        }))
    }
  }

  async validate(data: ValidateRequestData): Promise<ValidateResponseData> {
    const validationResults = [];
    for (const config of data.configs) {
      if (!this.resourceControllers.has(config.type)) {
        throw new Error(`Resource type not found: ${config.type}`);
      }

      const validation = await this.resourceControllers
        .get(config.type)!
        .validate(config);

      validationResults.push(validation);
    }

    await this.crossValidateResources(data.configs);
    return {
      resourceValidations: validationResults
    };
  }

  async plan(data: PlanRequestData): Promise<PlanResponseData> {
    const type = data.desired?.type ?? data.state?.type

    if (!type || !this.resourceControllers.has(type)) {
      throw new Error(`Resource type not found: ${type}`);
    }

    const plan = await this.resourceControllers.get(type)!.plan(
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

    const resource = this.resourceControllers.get(plan.getResourceType());
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

    if (!planRequest?.resourceType || !this.resourceControllers.has(planRequest.resourceType)) {
      throw new Error('Malformed plan. Resource type must be supplied or resource type was not found');
    }

    const resource = this.resourceControllers.get(planRequest.resourceType)!;
    return Plan.fromResponse(planRequest, resource.parsedSettings.defaultValues);
  }

  protected async crossValidateResources(configs: ResourceConfig[]): Promise<void> {}

}
