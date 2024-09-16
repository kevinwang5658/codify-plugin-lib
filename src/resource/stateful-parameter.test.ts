import { describe, expect, it } from 'vitest';
import { spy } from 'sinon';
import { ParameterOperation, ResourceOperation } from 'codify-schemas';
import { TestArrayStatefulParameter, TestConfig, testPlan } from '../utils/test-utils.test.js';
import { ArrayParameterSetting } from './resource-settings.js';

describe('Stateful parameter tests', () => {
  it('addItem is called the correct number of times', async () => {
    const plan = testPlan<TestConfig>({
      desired: { propZ: ['a', 'b', 'c'] },
    });

    expect(plan.changeSet.operation).to.eq(ResourceOperation.CREATE);
    expect(plan.changeSet.parameterChanges.length).to.eq(1);

    const testParameter = spy(new TestArrayStatefulParameter());
    await testParameter.add((plan.desiredConfig! as any).propZ, plan);

    expect(testParameter.addItem.callCount).to.eq(3);
    expect(testParameter.removeItem.called).to.be.false;
  })

  it('applyRemoveItem is called the correct number of times', async () => {
    const plan = testPlan<TestConfig>({
      desired: null,
      current: [{ propZ: ['a', 'b', 'c'] }],
      state: { propZ: ['a', 'b', 'c'] },
      statefulMode: true,
    });

    expect(plan.changeSet.operation).to.eq(ResourceOperation.DESTROY);
    expect(plan.changeSet.parameterChanges.length).to.eq(1);

    const testParameter = spy(new TestArrayStatefulParameter());
    await testParameter.remove((plan.currentConfig as any).propZ, plan);

    expect(testParameter.addItem.called).to.be.false;
    expect(testParameter.removeItem.callCount).to.eq(3);
  })

  it('In stateless mode only applyAddItem is called only for modifies', async () => {
    const parameter = new TestArrayStatefulParameter()
    const plan = testPlan<TestConfig>({
      desired: { propZ: ['a', 'c', 'd', 'e', 'f'] }, // b to remove, d, e, f to add
      current: [{ propZ: ['a', 'b', 'c'] }],
      settings: { id: 'type', parameterSettings: { propZ: { type: 'stateful', definition: parameter } } },
    });

    expect(plan.changeSet.operation).to.eq(ResourceOperation.MODIFY);
    expect(plan.changeSet.parameterChanges[0]).toMatchObject({
      name: 'propZ',
      previousValue: ['a', 'c'], // In stateless mode the previous value gets filtered to prevent deletes
      newValue: ['a', 'c', 'd', 'e', 'f'],
      operation: ParameterOperation.MODIFY,
    })

    const testParameter = spy(parameter);
    await testParameter.modify((plan.desiredConfig as any).propZ, (plan.currentConfig as any).propZ, plan);

    expect(testParameter.addItem.calledThrice).to.be.true;
    expect(testParameter.removeItem.called).to.be.false;
  })

  it('isElementEqual is called for modifies', async () => {
    const testParameter = spy(new class extends TestArrayStatefulParameter {
      getSettings(): ArrayParameterSetting {
        return {
          type: 'array',
          isElementEqual: (desired, current) => current.includes(desired),
        }
      }
    });

    const plan = testPlan<TestConfig>({
      desired: { propZ: ['9.12', '9.13'] }, // b to remove, d, e, f to add
      current: [{ propZ: ['9.12.9'] }],
      settings: { id: 'type', parameterSettings: { propZ: { type: 'stateful', definition: testParameter } } }
    });

    expect(plan.changeSet.operation).to.eq(ResourceOperation.MODIFY);
    expect(plan.changeSet.parameterChanges[0]).toMatchObject({
      name: 'propZ',
      previousValue: ['9.12.9'],
      newValue: ['9.12', '9.13'],
      operation: ParameterOperation.MODIFY,
    })

    await testParameter.modify((plan.desiredConfig as any).propZ, (plan.currentConfig as any).propZ, plan);

    expect(testParameter.addItem.calledOnce).to.be.true;
    expect(testParameter.removeItem.called).to.be.false;
  })
})
