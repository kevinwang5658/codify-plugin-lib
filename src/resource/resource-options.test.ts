import { describe, expect, it } from 'vitest';
import { ResourceOptions, ResourceOptionsParser } from './resource-options.js';
import { TestConfig } from './resource-controller.test.js';

describe('Resource options parser tests', () => {
  it('Parses default values from options', () => {
    const option: ResourceOptions<TestConfig> = {
      type: 'typeId',
      parameterOptions: {
        propA: { default: 'propA' },
        propB: { default: 'propB' },
        propC: { isEqual: () => true },
        propD: { },
      }
    }

    const result = new ResourceOptionsParser(option);
    expect(result.defaultValues).to.deep.eq({
      propA: 'propA',
      propB: 'propB'
    })
  })
})
