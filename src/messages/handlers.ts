import { Ajv, SchemaObject, ValidateFunction } from 'ajv';
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

import { SudoError } from '../entities/errors.js';
import { Plugin } from '../entities/plugin.js';

const SupportedRequests: Record<string, { handler: (plugin: Plugin, data: any) => Promise<unknown>; requestValidator: SchemaObject; responseValidator: SchemaObject }> = {
  'apply': {
    async handler(plugin: Plugin, data: any) {
      await plugin.apply(data);
      return null;
    },
    requestValidator: ApplyRequestDataSchema,
    responseValidator: ApplyResponseDataSchema
  },
  'initialize': {
    handler: async (plugin: Plugin) => plugin.initialize(),
    requestValidator: InitializeRequestDataSchema,
    responseValidator: InitializeResponseDataSchema
  },
  'plan': {
    handler: async (plugin: Plugin, data: any) => plugin.plan(data),
    requestValidator: PlanRequestDataSchema,
    responseValidator: PlanResponseDataSchema
  },
  'validate': {
    handler: async (plugin: Plugin, data: any) => plugin.validate(data),
    requestValidator: ValidateRequestDataSchema,
    responseValidator: ValidateResponseDataSchema
  }
}

export class MessageHandler {
  private ajv: Ajv;
  private readonly plugin: Plugin;
  private messageSchemaValidator: ValidateFunction;
  private requestValidators: Map<string, ValidateFunction>;
  private responseValidators: Map<string, ValidateFunction>;

  constructor(plugin: Plugin) {
    this.ajv = new Ajv({ strict: true, strictRequired: false });
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
        data: result,
        status: MessageStatus.SUCCESS,
      })

    } catch (error: unknown) {
      this.handleErrors(message, error as Error);
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
        data: `Plugin: '${this.plugin.name}'. Forbidden usage of sudo for command '${e.command}'. Please contact the plugin developer to fix this.`,
        status: MessageStatus.ERROR,
      })
    }

    const isDebug = process.env.DEBUG?.includes('*') ?? false;

    process.send?.({
      cmd,
      data: isDebug ? e.stack : e.message,
      status: MessageStatus.ERROR,
    })
  }
}
