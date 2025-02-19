import { describe, expect, it } from 'vitest';
import { Plugin } from './plugin.js';
import { ApplyRequestData, ParameterOperation, ResourceOperation, StringIndexedObject } from 'codify-schemas';
import { Resource } from '../resource/resource.js';
import { Plan } from '../plan/plan.js';
import { spy } from 'sinon';
import { ResourceSettings } from '../resource/resource-settings.js';
import { TestConfig } from '../utils/test-utils.test.js';
import { getPty } from '../pty/index.js';

interface TestConfig extends StringIndexedObject {
  propA: string;
  propB: number;
  propC?: string;
}

class TestResource extends Resource<TestConfig> {
  getSettings(): ResourceSettings<TestConfig> {
    return {
      id: 'testResource'
    };
  }

  create(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  destroy(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  async refresh(): Promise<Partial<TestConfig> | null> {
    return {
      propA: 'a',
      propB: 10,
      propC: 'c',
    };
  }
}

describe('Plugin tests', () => {
  it('Can apply resource', async () => {
    const resource = spy(new class extends TestResource {
      async refresh(): Promise<Partial<TestConfig> | null> {
        return {
          propA: 'abc',
        }
      }
    })
    const plugin = Plugin.create('testPlugin', [resource as any])

    const plan: ApplyRequestData['plan'] = {
      operation: ResourceOperation.CREATE,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.ADD, newValue: 'abc', previousValue: null },
      ],
      isStateful: false,
    };

    await plugin.apply({ plan });
    expect(resource.create.calledOnce).to.be.true;
  });

  it('Can destroy resource', async () => {
    const resource = spy(new class extends TestResource {
      async refresh(): Promise<Partial<TestConfig> | null> {
        return null;
      }
    });
    const testPlugin = Plugin.create('testPlugin', [resource as any])

    const plan: ApplyRequestData['plan'] = {
      operation: ResourceOperation.DESTROY,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.REMOVE, newValue: null, previousValue: 'abc' },
      ],
      isStateful: true,
    };

    await testPlugin.apply({ plan })
    expect(resource.destroy.calledOnce).to.be.true;
  });

  it('Can re-create resource', async () => {
    const resource = spy(new class extends TestResource {
      async refresh(): Promise<Partial<TestConfig> | null> {
        return {
          propA: 'def',
        }
      }
    })
    const testPlugin = Plugin.create('testPlugin', [resource as any])

    const plan: ApplyRequestData['plan'] = {
      operation: ResourceOperation.RECREATE,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.MODIFY, newValue: 'def', previousValue: 'abc' },
      ],
      isStateful: false,
    };

    await testPlugin.apply({ plan })
    expect(resource.destroy.calledOnce).to.be.true;
    expect(resource.create.calledOnce).to.be.true;
  });

  it('Can modify resource', async () => {
    const resource = spy(new class extends TestResource {
      async refresh(): Promise<Partial<TestConfig> | null> {
        return {
          propA: 'def',
        }
      }
    })
    const testPlugin = Plugin.create('testPlugin', [resource as any])

    const plan: ApplyRequestData['plan'] = {
      operation: ResourceOperation.MODIFY,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.MODIFY, newValue: 'def', previousValue: 'abc' },
      ],
      isStateful: false,
    };

    await testPlugin.apply({ plan })
    expect(resource.modify.calledOnce).to.be.true;
  });

  it('Can get resource info', async () => {
    const schema = {
      '$schema': 'http://json-schema.org/draft-07/schema',
      '$id': 'https://www.codifycli.com/asdf-schema.json',
      'title': 'Asdf resource',
      'type': 'object',
      'properties': {
        'plugins': {
          'type': 'array',
          'description': 'Asdf plugins to install. See: https://github.com/asdf-community for a full list',
          'items': {
            'type': 'string'
          }
        }
      },
      'required': ['plugins'],
      'additionalProperties': false
    }


    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          id: 'typeId',
          schema,
        }
      }
    }
    const testPlugin = Plugin.create('testPlugin', [resource as any])

    const resourceInfo = await testPlugin.getResourceInfo({ type: 'typeId' })
    expect(resourceInfo.import).toMatchObject({
      requiredParameters: [
        'plugins'
      ]
    })
  })

  it('Get resource info to default import to the one specified in the resource settings', async () => {
    const schema = {
      '$schema': 'http://json-schema.org/draft-07/schema',
      '$id': 'https://www.codifycli.com/asdf-schema.json',
      'title': 'Asdf resource',
      'type': 'object',
      'properties': {
        'plugins': {
          'type': 'array',
          'description': 'Asdf plugins to install. See: https://github.com/asdf-community for a full list',
          'items': {
            'type': 'string'
          }
        }
      },
      'required': ['plugins'],
      'additionalProperties': false
    }


    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          id: 'typeId',
          schema,
          importAndDestroy: {
            requiredParameters: []
          }
        }
      }
    }
    const testPlugin = Plugin.create('testPlugin', [resource as any])

    const resourceInfo = await testPlugin.getResourceInfo({ type: 'typeId' })
    expect(resourceInfo.import).toMatchObject({
      requiredParameters: []
    })
  })

  it('Fails an apply if the validation fails', async () => {
    const resource = spy(new class extends TestResource {
      async refresh(): Promise<Partial<TestConfig> | null> {
        return {
          propA: 'abc',
        }
      }
    })
    const testPlugin = Plugin.create('testPlugin', [resource as any])

    const plan: ApplyRequestData['plan'] = {
      operation: ResourceOperation.MODIFY,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.MODIFY, newValue: 'def', previousValue: 'abc' },
      ],
      isStateful: false,
    };

    await expect(() => testPlugin.apply({ plan }))
      .rejects
      .toThrowError();
    expect(resource.modify.calledOnce).to.be.true;
  })

  it('Allows the usage of pty in refresh (plan)', async () => {
    const resource = spy(new class extends TestResource {
      async refresh(): Promise<Partial<TestConfig> | null> {
        expect(getPty()).to.not.be.undefined;
        expect(getPty()).to.not.be.null;

        return null;
      }
    })

    const testPlugin = Plugin.create('testPlugin', [resource as any]);
    await testPlugin.plan({
      core: { type: 'testResource' },
      desired: {},
      state: undefined,
      isStateful: false,
    })

    expect(resource.refresh.calledOnce).to.be.true;
  });

  it('Allows the usage of pty in validation refresh (apply)', async () => {
    const resource = spy(new class extends TestResource {
      async refresh(): Promise<Partial<TestConfig> | null> {
        expect(getPty()).to.not.be.undefined;
        expect(getPty()).to.not.be.null;

        return {
          propA: 'abc'
        };
      }
    })

    const testPlugin = Plugin.create('testPlugin', [resource as any]);

    const plan: ApplyRequestData['plan'] = {
      operation: ResourceOperation.CREATE,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.ADD, newValue: 'abc', previousValue: null },
      ],
      isStateful: false,
    };

    await testPlugin.apply({ plan })
    expect(resource.refresh.calledOnce).to.be.true;
  })

  it('Maintains types for validate', async () => {
    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          id: 'type',
          schema: {
            '$schema': 'http://json-schema.org/draft-07/schema',
            '$id': 'https://www.codifycli.com/ssh-config.json',
            'type': 'object',
            'properties': {
              'hosts': {
                'description': 'The host blocks inside of the ~/.ssh/config file. See http://man.openbsd.org/OpenBSD-current/man5/ssh_config.5 ',
                'type': 'array',
                'items': {
                  'type': 'object',
                  'description': 'The individual host blocks inside of the ~/.ssh/config file',
                  'properties': {
                    'UseKeychain': {
                      'type': 'boolean',
                      'description': 'A UseKeychain option was introduced in macOS Sierra allowing users to specify whether they would like for the passphrase to be stored in the keychain'
                    },
                  }
                }
              }
            }
          }
        }
      };
    }

    const plugin = Plugin.create('testPlugin', [resource as any]);
    const result = await plugin.validate({
      configs: [{
        core: { type: 'type' },
        parameters: {
          hosts: [{
            UseKeychain: true,
          }]
        }
      }]
    })

    console.log(result);
  })

  it('Returns allowMultiple for getResourceInfo', async () => {
    const resource = spy(new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          ...super.getSettings(),
          allowMultiple: {
            identifyingParameters: ['path', 'paths']
          }
        }
      }
    })

    const testPlugin = Plugin.create('testPlugin', [resource as any]);

    const resourceInfo = await testPlugin.getResourceInfo({
      type: 'testResource',
    })

    expect(resourceInfo.allowMultiple).to.be.true;
  })

  it('Can match resources together', async () => {
    const resource = spy(new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          ...super.getSettings(),
          parameterSettings: {
            path: { type: 'directory' },
            paths: { type: 'array', itemType: 'directory' }
          },
          allowMultiple: {
            identifyingParameters: ['path', 'paths']
          }
        }
      }
    })

    const testPlugin = Plugin.create('testPlugin', [resource as any]);

    const { match } = await testPlugin.match({
      resource: {
        core: { type: 'testResource' },
        parameters: { path: '/my/path', propA: 'abc' },
      },
      array: [
        {
          core: { type: 'testResource' },
          parameters: { path: '/my/other/path', propA: 'abc' },
        },
        {
          core: { type: 'testResource' },
          parameters: { paths: ['/my/path'], propA: 'def' },
        },
        {
          core: { type: 'testResource' },
          parameters: { path: '/my/path', propA: 'hig' },
        },
      ]
    })
    expect(match).toMatchObject({
      core: { type: 'testResource' },
      parameters: { path: '/my/path', propA: 'hig' },
    })

  })
});
