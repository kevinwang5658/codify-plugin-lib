import { describe, expect, it } from 'vitest';
import { ArrayStatefulParameter, ArrayStatefulParameterOptions, } from './stateful-parameter.js';
import { Plan } from './plan.js';
import { spy } from 'sinon';
import { ParameterOperation, ResourceOperation } from 'codify-schemas';

interface TestConfig {
  propA: string[];
  [x: string]: unknown;
}

class TestArrayParameter extends ArrayStatefulParameter<TestConfig, string> {
  constructor(options?: ArrayStatefulParameterOptions<TestConfig>) {
    super(options ?? {
      name: 'propA'
    })
  }

  async applyAddItem(item: string, plan: Plan<TestConfig>): Promise<void> {}
  async applyRemoveItem(item: string, plan: Plan<TestConfig>): Promise<void> {}

  async refresh(): Promise<string[] | null> {
    return null;
  }
}


describe('Stateful parameter tests', () => {
  it('applyAddItem is called the correct number of times', async () => {
    const plan = Plan.create<TestConfig>(
      { propA: ['a', 'b', 'c'] },
      null,
      { type: 'typeA' },
      { statefulMode: false }
    );

    expect(plan.changeSet.operation).to.eq(ResourceOperation.CREATE);
    expect(plan.changeSet.parameterChanges.length).to.eq(1);

    const testParameter = spy(new TestArrayParameter());
    await testParameter.applyAdd(plan.desiredConfig.propA, plan);

    expect(testParameter.applyAddItem.callCount).to.eq(3);
    expect(testParameter.applyRemoveItem.called).to.be.false;
  })

  it('applyRemoveItem is called the correct number of times', async () => {
    const plan = Plan.create<TestConfig>(
      null,
      { propA: ['a', 'b', 'c'] },
      { type: 'typeA' },
      { statefulMode: true }
    );

    expect(plan.changeSet.operation).to.eq(ResourceOperation.DESTROY);
    expect(plan.changeSet.parameterChanges.length).to.eq(1);

    const testParameter = spy(new TestArrayParameter());
    await testParameter.applyRemove(plan.currentConfig.propA, plan);

    expect(testParameter.applyAddItem.called).to.be.false;
    expect(testParameter.applyRemoveItem.callCount).to.eq(3);
  })

  it('In stateless mode only applyAddItem is called only for modifies', async () => {
    const plan = Plan.create<TestConfig>(
      { propA: ['a', 'c', 'd', 'e', 'f'] }, // b to remove, d, e, f to add
      { propA: ['a', 'b', 'c'] },
      { type: 'typeA' },
      { statefulMode: true, parameterOptions: { propA: { isStatefulParameter: true }} }
    );

    expect(plan.changeSet.operation).to.eq(ResourceOperation.MODIFY);
    expect(plan.changeSet.parameterChanges[0]).toMatchObject({
      name: 'propA',
      previousValue: ['a', 'b', 'c'],
      newValue: ['a', 'c', 'd', 'e', 'f'],
      operation: ParameterOperation.MODIFY,
    })

    const testParameter = spy(new TestArrayParameter());
    await testParameter.applyModify(plan.desiredConfig.propA, plan.currentConfig.propA, false, plan);

    expect(testParameter.applyAddItem.calledThrice).to.be.true;
    expect(testParameter.applyRemoveItem.called).to.be.false;
  })

  it('isElementEqual is called for modifies', async () => {
    const plan = Plan.create<TestConfig>(
      { propA: ['9.12', '9.13'] }, // b to remove, d, e, f to add
      { propA: ['9.12.9'] },
      { type: 'typeA' },
      { statefulMode: false, parameterOptions: { propA: { isStatefulParameter: true }} }
    );

    expect(plan.changeSet.operation).to.eq(ResourceOperation.MODIFY);
    expect(plan.changeSet.parameterChanges[0]).toMatchObject({
      name: 'propA',
      previousValue: ['9.12.9'],
      newValue: ['9.12', '9.13'],
      operation: ParameterOperation.MODIFY,
    })

    const testParameter = spy(new class extends TestArrayParameter {
      constructor() {
        super({
          name: 'propA',
          isElementEqual: (desired, current) => current.includes(desired),
        });
      }
    });

    await testParameter.applyModify(plan.desiredConfig.propA, plan.currentConfig.propA, false, plan);

    expect(testParameter.applyAddItem.calledOnce).to.be.true;
    expect(testParameter.applyRemoveItem.called).to.be.false;
  })
})
