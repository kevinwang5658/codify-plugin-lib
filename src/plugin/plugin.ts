import { JSONSchemaType } from 'ajv';
import {
  ApplyRequestData,
  GetResourceInfoRequestData,
  GetResourceInfoResponseData,
  ImportRequestData,
  ImportResponseData,
  InitializeResponseData,
  PlanRequestData,
  PlanResponseData,
  ResourceConfig,
  ResourceJson,
  ValidateRequestData,
  ValidateResponseData
} from 'codify-schemas';

import { ApplyValidationError } from '../common/errors.js';
import { Plan } from '../plan/plan.js';
import { BackgroundPty } from '../pty/background-pty.js';
import { getPty } from '../pty/index.js';
import { Resource } from '../resource/resource.js';
import { ResourceController } from '../resource/resource-controller.js';
import { ptyLocalStorage } from '../utils/pty-local-storage.js';

export class Plugin {
  planStorage: Map<string, Plan<any>>;
  planPty = new BackgroundPty();

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

  async getResourceInfo(data: GetResourceInfoRequestData): Promise<GetResourceInfoResponseData> {
    if (!this.resourceControllers.has(data.type)) {
      throw new Error(`Cannot get info for resource ${data.type}, resource doesn't exist`);
    }

    const resource = this.resourceControllers.get(data.type)!;

    const schema = resource.settings.schema as JSONSchemaType<any> | undefined;
    const requiredPropertyNames = (
      resource.settings.importAndDestroy?.requiredParameters
      ?? schema?.required
      ?? null
    ) as null | string[];

    const allowMultiple = resource.settings.allowMultiple !== undefined
      ? (typeof resource.settings.allowMultiple === 'boolean'
          ? { identifyingParameters: schema?.required ?? [] }
          : { identifyingParameters: resource.settings.allowMultiple.identifyingParameters ?? schema?.required ?? [] }
      ) : undefined

    return {
      plugin: this.name,
      type: data.type,
      dependencies: resource.dependencies,
      schema: schema as Record<string, unknown> | undefined,
      importAndDestroy: {
        preventImport: resource.settings.importAndDestroy?.preventImport,
        requiredParameters: requiredPropertyNames,
      },
      import: {
        requiredParameters: requiredPropertyNames,
      },
      allowMultiple
    }
  }

  async import(data: ImportRequestData): Promise<ImportResponseData> {
    const { core, parameters } = data;

    if (!this.resourceControllers.has(core.type)) {
      throw new Error(`Cannot get info for resource ${core.type}, resource doesn't exist`);
    }

    const result = await ptyLocalStorage.run(this.planPty, () =>
      this.resourceControllers
        .get(core.type!)
        ?.import(core, parameters)
    )

    return {
      request: data,
      result: result ?? [],
    }
  }

  async validate(data: ValidateRequestData): Promise<ValidateResponseData> {
    const validationResults = [];
    for (const config of data.configs) {
      const { core, parameters } = config;

      if (!this.resourceControllers.has(core.type)) {
        throw new Error(`Resource type not found: ${core.type}`);
      }

      const validation = await this.resourceControllers
        .get(core.type)!
        .validate(core, parameters);

      validationResults.push(validation);
    }

    await this.crossValidateResources(data.configs);
    return {
      resourceValidations: validationResults
    };
  }

  async plan(data: PlanRequestData): Promise<PlanResponseData> {
    const { type } = data.core

    if (!this.resourceControllers.has(type)) {
      throw new Error(`Resource type not found: ${type}`);
    }

    const plan = await ptyLocalStorage.run(this.planPty, async () => this.resourceControllers.get(type)!.plan(
      data.core,
      data.desired ?? null,
      data.state ?? null,
      data.isStateful
    ))

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

    // Validate using desired/desired. If the apply was successful, no changes should be reported back.
    // Default back desired back to current if it is not defined (for destroys only)
    const validationPlan = await ptyLocalStorage.run(new BackgroundPty(), async () => {
      const result = await resource.plan(
        plan.coreParameters,
        plan.desiredConfig,
        plan.desiredConfig ?? plan.currentConfig,
        plan.isStateful
      );

      await getPty().kill();
      return result;
    })

    if (validationPlan.requiresChanges()) {
      throw new ApplyValidationError(plan);
    }
  }

  async kill() {
    await this.planPty.kill();
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

  protected async crossValidateResources(resources: ResourceJson[]): Promise<void> {
  }
}
