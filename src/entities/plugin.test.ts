import { describe, expect, it } from 'vitest';
import { Plugin } from './plugin.js';
import { ParameterOperation, ResourceOperation, StringIndexedObject } from 'codify-schemas';
import { Resource } from './resource.js';
import { Plan } from './plan.js';
import { ValidationResult } from './resource-types.js';
import { ApplyValidationError } from './errors.js';

interface TestConfig extends StringIndexedObject {
  propA: string;
  propB: number;
  propC?: string;
}

class TestResource extends Resource<TestConfig> {
  constructor() {
    super({
      type: 'testResource'
    });
  }

  applyCreate(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  applyDestroy(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  async refresh(keys: Map<string, unknown>): Promise<Partial<TestConfig> | null> {
    return {
      propA: 'a',
      propB: 10,
      propC: 'c',
    };
  }

  async validateResource(config: unknown): Promise<ValidationResult> {
    return {
      isValid: true
    }
  }
}

describe('Plugin tests', () => {
  it('Validates that applies were successfully applied', async () => {
    const resource= new class extends TestResource {
      async applyCreate(plan: Plan<TestConfig>): Promise<void> {
      }

      // Refresh has to line up with desired for the apply to go through
      async refresh(keys: Map<string, unknown>): Promise<Partial<TestConfig> | null> {
        return {
          propA: 'abc'
        }
      }
    }

    const plugin = Plugin.create('testPlugin', [resource])

    const plan = {
      operation: ResourceOperation.CREATE,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.ADD, newValue: 'abc', previousValue: null },
      ]
    };

    // If this doesn't throw then it passes the test
    await plugin.apply({ plan });
  });

  it('Validates that applies were successfully applied (error)', async () => {
    const resource = new class extends TestResource {
      async applyCreate(plan: Plan<TestConfig>): Promise<void> {
      }

      // Return null to indicate that the resource was not created
      async refresh(keys: Map<string, unknown>): Promise<Partial<TestConfig> | null> {
        return null;
      }
    }
    const plugin = Plugin.create('testPlugin', [resource])

    const plan = {
      operation: ResourceOperation.CREATE,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.ADD, newValue: 'abc', previousValue: null },
      ]
    };

    await expect(async () => plugin.apply({ plan })).rejects.toThrowError(expect.any(ApplyValidationError));
  });

  it('Validates that deletes were successfully applied', async () => {
    const resource = new class extends TestResource {
      async applyCreate(plan: Plan<TestConfig>): Promise<void> {
      }

      // Return null to indicate that the resource was deleted
      async refresh(keys: Map<string, unknown>): Promise<Partial<TestConfig> | null> {
        return null;
      }
    }

    const testPlugin = Plugin.create('testPlugin', [resource])

    const plan = {
      operation: ResourceOperation.DESTROY,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.REMOVE, newValue: null, previousValue: 'abc' },
      ]
    };

    // If this doesn't throw then it passes the test
    await testPlugin.apply({ plan })
  });

  it('Validates that deletes were successfully applied (error)', async () => {
    const resource = new class extends TestResource {
      async applyCreate(plan: Plan<TestConfig>): Promise<void> {
      }

      // Return a value to indicate that the resource still exists
      async refresh(keys: Map<string, unknown>): Promise<Partial<TestConfig> | null> {
        return { propA: 'abc' };
      }
    }

    const testPlugin = Plugin.create('testPlugin', [resource])

    const plan = {
      operation: ResourceOperation.DESTROY,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.REMOVE, newValue: null, previousValue: 'abc' },
      ]
    };

    // If this doesn't throw then it passes the test
    expect(async () => await testPlugin.apply({ plan })).rejects.toThrowError(expect.any(ApplyValidationError));
  });

  it('Validates that re-create was successfully applied', async () => {
    const resource = new class extends TestResource {
      async applyCreate(plan: Plan<TestConfig>): Promise<void> {
      }

      async refresh(keys: Map<string, unknown>): Promise<Partial<TestConfig> | null> {
        return { propA: 'def'};
      }
    }

    const testPlugin = Plugin.create('testPlugin', [resource])

    const plan = {
      operation: ResourceOperation.RECREATE,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.MODIFY, newValue: 'def', previousValue: 'abc' },
      ]
    };

    // If this doesn't throw then it passes the test
    await testPlugin.apply({ plan })
  });

  it('Validates that modify was successfully applied (error)', async () => {
    const resource = new class extends TestResource {
      async applyCreate(plan: Plan<TestConfig>): Promise<void> {
      }

      async refresh(keys: Map<string, unknown>): Promise<Partial<TestConfig> | null> {
        return { propA: 'abc' };
      }
    }

    const testPlugin = Plugin.create('testPlugin', [resource])

    const plan = {
      operation: ResourceOperation.DESTROY,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.REMOVE, newValue: 'def', previousValue: 'abc' },
      ]
    };

    // If this doesn't throw then it passes the test
    expect(async () => await testPlugin.apply({ plan })).rejects.toThrowError(expect.any(ApplyValidationError));
  });
});
