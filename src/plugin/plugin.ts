import { JSONSchemaType } from 'ajv';
import {
  ApplyRequestData,
  GetResourceInfoRequestData,
  GetResourceInfoResponseData,
  ImportRequestData,
  ImportResponseData,
  InitializeRequestData,
  InitializeResponseData,
  MatchRequestData,
  MatchResponseData,
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
import { VerbosityLevel } from '../utils/utils.js';

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

  async initialize(data: InitializeRequestData): Promise<InitializeResponseData> {
    if (data.verbosityLevel) {
      VerbosityLevel.set(data.verbosityLevel);
    }

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
      ?? (typeof resource.settings.allowMultiple === 'object' ? resource.settings.allowMultiple.identifyingParameters : null)
      ?? schema?.required
      ?? undefined
    ) as any;

    const allowMultiple = resource.settings.allowMultiple !== undefined
      && resource.settings.allowMultiple !== false;

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

  async match(data: MatchRequestData): Promise<MatchResponseData> {
    const { resource: resourceConfig, array } = data;

    const resource = this.resourceControllers.get(resourceConfig.core.type);
    if (!resource) {
      throw new Error(`Resource of type ${resourceConfig.core.type} could not be found for match`);
    }

    const match = await resource.match(resourceConfig, array);
    return { match }
  }

  async import(data: ImportRequestData): Promise<ImportResponseData> {
    const { core, parameters, autoSearchAll } = data;

    if (!this.resourceControllers.has(core.type)) {
      throw new Error(`Cannot get info for resource ${core.type}, resource doesn't exist`);
    }

    const result = await ptyLocalStorage.run(this.planPty, () =>
      this.resourceControllers
        .get(core.type!)
        ?.import(core, parameters, autoSearchAll)
    )

    return {
      request: data,
      result: result ?? [],
    }
  }

  async validate(data: ValidateRequestData): Promise<ValidateResponseData> {
    const validationResults: ValidateResponseData['resourceValidations'] = [];
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

    // Validate that if allow multiple is false, then only 1 of each resource exists
    const countMap = data.configs.reduce((map, resource) => {
      if (!map.has(resource.core.type)) {
        map.set(resource.core.type, 0);
      }

      const count = map.get(resource.core.type)!;
      map.set(resource.core.type, count + 1)

      return map;
    }, new Map<string, number>())

    const invalidMultipleConfigs = [...countMap.entries()].filter(([k, v]) => {
      const controller = this.resourceControllers.get(k)!;
      return !controller.parsedSettings.allowMultiple && v > 1;
    });

    if (invalidMultipleConfigs.length > 0) {
      throw new Error(
        `Multiples of the following configs were found but only 1 is allowed. [${invalidMultipleConfigs.map(([k, v]) => `${v}x ${k}`).join(', ')}] found.`)
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
