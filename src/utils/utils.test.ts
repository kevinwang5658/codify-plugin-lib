import { describe, expect, it } from 'vitest';
import { splitUserConfig } from './utils.js';

describe('Utils tests', () => {
  it('Can split a config correctly', () => {
    const { parameters, coreParameters } = splitUserConfig({
      type: 'type',
      name: 'name',
      dependsOn: ['a', 'b', 'c'],
      propA: 'propA',
      propB: 'propB',
      propC: 'propC',
      propD: 'propD',
    })

    expect(coreParameters).toMatchObject({
      type: 'type',
      name: 'name',
      dependsOn: ['a', 'b', 'c'],
    })

    expect(parameters).toMatchObject({
      propA: 'propA',
      propB: 'propB',
      propC: 'propC',
      propD: 'propD',
    })
  })
})
