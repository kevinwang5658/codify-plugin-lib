import { Plugin } from '../entities/plugin.js';
import addFormats from 'ajv-formats';
import {
  ApplyRequestDataSchema,
  ApplyResponseDataSchema,
  InitializeRequestDataSchema,
  InitializeResponseDataSchema,
  IpcMessage,
  IpcMessageSchema,
  MessageStatus,
  PlanRequestDataSchema,
  PlanResponseDataSchema,
  ResourceSchema,
  ValidateRequestDataSchema,
  ValidateResponseDataSchema
} from 'codify-schemas';
import Ajv2020, { SchemaObject, ValidateFunction } from 'ajv/dist/2020.js';
import { ApplyValidationError, SudoError } from '../entities/errors.js';

const SupportedRequests: Record<string, { requestValidator: SchemaObject; responseValidator: SchemaObject; handler: (plugin: Plugin, data: any) => Promise<unknown> }> = {
  'initialize': {
    requestValidator: InitializeRequestDataSchema,
    responseValidator: InitializeResponseDataSchema,
    handler: async (plugin: Plugin) => plugin.initialize()
  },
  'validate': {
    requestValidator: ValidateRequestDataSchema,
    responseValidator: ValidateResponseDataSchema,
    handler: async (plugin: Plugin, data: any) => plugin.validate(data)
  },
  'plan': {
    requestValidator: PlanRequestDataSchema,
    responseValidator: PlanResponseDataSchema,
    handler: async (plugin: Plugin, data: any) => plugin.plan(data)
  },
  'apply': {
    requestValidator: ApplyRequestDataSchema,
    responseValidator: ApplyResponseDataSchema,
    handler: async (plugin: Plugin, data: any) => {
      await plugin.apply(data);
      return null;
    }
  }
}

export class MessageHandler {
  private ajv: Ajv2020.default;
  private readonly plugin: Plugin;
  private messageSchemaValidator: ValidateFunction;
  private requestValidators: Map<string, ValidateFunction>;
  private responseValidators: Map<string, ValidateFunction>;

  constructor(plugin: Plugin) {
    this.ajv = new Ajv2020.default({ strict: true });
    addFormats.default(this.ajv);
    this.ajv.addSchema(ResourceSchema);
    this.plugin = plugin;

    this.messageSchemaValidator = this.ajv.compile(IpcMessageSchema);
    this.requestValidators = new Map(
      Object.entries(SupportedRequests)
        .map(([k, v]) => [k, this.ajv.compile(v.requestValidator)])
    )
    this.responseValidators = new Map(
      Object.entries(SupportedRequests)
        .map(([k, v]) => [k, this.ajv.compile(v.responseValidator)])
    )
  }

  async onMessage(message: unknown): Promise<void> {
    try {
      if (!this.validateMessage(message)) {
        throw new Error(`Plugin: ${this.plugin}. Message is malformed: ${JSON.stringify(this.messageSchemaValidator.errors, null, 2)}`);
      }

      if (!this.requestValidators.has(message.cmd)) {
        throw new Error(`Plugin: ${this.plugin}. Unsupported message: ${message.cmd}`);
      }

      const requestValidator = this.requestValidators.get(message.cmd)!;
      if (!requestValidator(message.data)) {
        throw new Error(`Plugin: ${this.plugin}. cmd: ${message.cmd}. Malformed message data: ${JSON.stringify(requestValidator.errors, null, 2)}`)
      }

      const result = await SupportedRequests[message.cmd].handler(this.plugin, message.data);

      const responseValidator = this.responseValidators.get(message.cmd);
      if (responseValidator && !responseValidator(result)) {
        throw new Error(`Plugin: ${this.plugin}. Malformed response data: ${JSON.stringify(responseValidator.errors, null, 2)}`)
      }

      process.send!({
        cmd: message.cmd + '_Response',
        status: MessageStatus.SUCCESS,
        data: result,
      })

    } catch (e: unknown) {
      this.handleErrors(message, e as Error);
    }
  }

  private validateMessage(message: unknown): message is IpcMessage {
    return this.messageSchemaValidator(message);
  }

  private handleErrors(message: unknown, e: Error) {
    if (!message) {
      return;
    }

    if (!message.hasOwnProperty('cmd')) {
      return;
    }

    // @ts-ignore
    const cmd = message.cmd + '_Response';

    if (e instanceof SudoError) {
      return process.send?.({
        cmd,
        status: MessageStatus.ERROR,
        data: `Plugin: '${this.plugin.name}'. Forbidden usage of sudo for command '${e.command}'. Please contact the plugin developer to fix this.`,
      })
    }

    if (e instanceof ApplyValidationError) {
      return process.send?.({
        cmd,
        status: MessageStatus.ERROR,
        data: `Plugin: '${this.plugin.name}'. Apply validation was not successful (additional changes are needed to match the desired plan).

Validation plan:
${JSON.stringify(e.validatedPlan, null, 2)},
        
User desired plan:
${JSON.stringify(e.desiredPlan, null, 2)}
`
      })
    }

    const isDebug = process.env.DEBUG?.includes('*') ?? false;

    process.send?.({
      cmd,
      status: MessageStatus.ERROR,
      data: isDebug ? e.stack : e.message,
    })
  }
}
