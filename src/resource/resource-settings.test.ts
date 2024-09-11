import { describe, expect, it } from 'vitest';
import { ResourceSettings } from './resource-settings.js';
import { ParsedResourceSettings } from './parsed-resource-settings.js';
import { TestConfig } from '../utils/test-utils.test.js';

describe('Resource options parser tests', () => {
  it('Parses default values from options', () => {
    const option: ResourceSettings<TestConfig> = {
      type: 'typeId',
      parameterSettings: {
        propA: { default: 'propA' },
        propB: { default: 'propB' },
        propC: { isEqual: () => true },
        propD: { },
      }
    }

    const result = new ParsedResourceSettings(option);
    expect(result.defaultValues).to.deep.eq({
      propA: 'propA',
      propB: 'propB'
    })
  })
})
