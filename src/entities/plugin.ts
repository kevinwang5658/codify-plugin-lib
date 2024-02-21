import { Resource } from './resource';
import {
  ApplyRequestData,
  PlanRequestData,
  PlanResponseData,
  ResourceConfig,
  ValidateRequestData,
  ValidateResponseData
} from 'codify-schemas';
import { Plan } from './plan';

export class Plugin {
  planStorage: Map<string, Plan<ResourceConfig>>;

  constructor(
    public resources: Map<string, Resource<ResourceConfig>>
  ) {
    this.planStorage = new Map();
  }

  async onInitialize(): Promise<void> {

  }

  async validate(data: ValidateRequestData): Promise<ValidateResponseData> {
    for (const config of data.configs) {
      if (!this.resources.has(config.type)) {
        throw new Error(`Resource type not found: ${config.type}`);
      }

      await this.resources.get(config.type)!.validate(config);
    }

    await this.crossValidateResources(data.configs);
    return null;
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
    const { planId } = data;
    const plan = this.planStorage.get(planId);
    if (!plan) {
      throw new Error(`Plan with id: ${planId} was not found`);
    }

    const resource = this.resources.get(plan.getResourceType());
    if (!resource) {
      throw new Error('Malformed plan with resource that cannot be found');
    }

    await resource.apply(plan);
  }

  protected async crossValidateResources(configs: ResourceConfig[]): Promise<void> {}

}
