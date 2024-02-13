import Ajv2020, { ValidateFunction } from 'ajv/dist/2020';
import { Plugin } from '../entities/plugin';
import {
  IpcMessage,
  IpcMessageSchema,
  ResourceSchema,
  ValidateRequestDataSchema,
  ValidateResponseDataSchema,
  MessageStatus, PlanRequestDataSchema, PlanResponseDataSchema, ApplyRequestDataSchema
} from 'codify-schemas';

const SupportedRequests: Record<string, { requestValidator: ValidateFunction; responseValidator: ValidateFunction; handler: (plugin: Plugin, data: any) => Promise<unknown> }> = {
  'validate': {
    requestValidator: ValidateRequestDataSchema,
    responseValidator: ValidateResponseDataSchema,
    handler: (plugin: Plugin, data: any) => plugin.validate(data)
  },
  'plan': {
    requestValidator: PlanRequestDataSchema,
    responseValidator: PlanResponseDataSchema,
    handler: (plugin: Plugin, data: any) => plugin.plan(data)
  },
  'apply': {
    requestValidator: ApplyRequestDataSchema,
    responseValidator: ApplyRequestDataSchema, // Replace with response validator
    handler: (plugin: Plugin, data: any) => plugin.onInitialize()
  }
}

export class MessageHandler {
  ajv: Ajv2020;
  plugin: Plugin;
  messageSchemaValidator: ValidateFunction;
  requestValidators: Map<string, ValidateFunction>;
  responseValidators: Map<string, ValidateFunction>;

  constructor(plugin: Plugin) {
    this.ajv = new Ajv2020({ strict: true });
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
      throw new Error(`Message is malformed: ${JSON.stringify(this.ajv.errors, null, 2)}`);
    }

    if (!this.requestValidators.has(message.cmd)) {
      throw new Error(`Unsupported message: ${message.cmd}`);
    }

    const requestValidator = this.requestValidators.get(message.cmd)!;
    if (!requestValidator(message)) {
      throw new Error(`Malformed message data: ${JSON.stringify(this.ajv.errors, null, 2)}`)
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
      throw new Error(`Malformed response data: ${JSON.stringify(this.ajv.errors, null, 2)}`)
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
