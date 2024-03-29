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
    if (!this.validateMessage(message)) {
      throw new Error(`Message is malformed: ${JSON.stringify(this.messageSchemaValidator.errors, null, 2)}`);
    }

    if (!this.requestValidators.has(message.cmd)) {
      throw new Error(`Unsupported message: ${message.cmd}`);
    }

    const requestValidator = this.requestValidators.get(message.cmd)!;
    if (!requestValidator(message.data)) {
      throw new Error(`Malformed message data: ${JSON.stringify(requestValidator.errors, null, 2)}`)
    }

    let result: unknown;
    try {
      result = await SupportedRequests[message.cmd].handler(this.plugin, message.data);
    } catch(e: any) {
      process.send!({
        cmd: message.cmd + '_Response',
        status: MessageStatus.ERROR,
        data: e.message,
      })

      return;
    }

    const responseValidator = this.responseValidators.get(message.cmd);
    if (responseValidator && !responseValidator(result)) {
      throw new Error(`Malformed response data: ${JSON.stringify(responseValidator.errors, null, 2)}`)
    }

    process.send!({
      cmd: message.cmd + '_Response',
      status: MessageStatus.SUCCESS,
      data: result,
    })
  }

  private validateMessage(message: unknown): message is IpcMessage {
    return this.messageSchemaValidator(message);
  }
}
