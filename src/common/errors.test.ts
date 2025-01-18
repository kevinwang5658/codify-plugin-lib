import { describe, expect, it } from 'vitest';
import { ApplyValidationError } from './errors.js';
import { testPlan } from '../utils/test-utils.test.js';

describe('Test file for errors file', () => {
  it('Can properly format ApplyValidationError', () => {
    const plan = testPlan({
      desired: null,
      current: [{ propZ: ['a', 'b', 'c'] }],
      state: { propZ: ['a', 'b', 'c'] },
      core: {
        type: 'homebrew',
        name: 'first'
      },
      isStateful: true,
    })

    try {
      throw new ApplyValidationError(plan);
    } catch (e) {
      console.error(e);
      expect(e.message).toMatch(
        `Failed to apply changes to resource: "homebrew.first". Additional changes are needed to complete apply.
Changes remaining:
{
  "operation": "destroy",
  "parameters": [
    {
      "name": "propZ",
      "operation": "remove",
      "currentValue": [
        "a",
        "b",
        "c"
      ],
      "desiredValue": null
    }
  ]
}`
      )
    }
  })
})
