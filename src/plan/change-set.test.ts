import { ChangeSet } from './change-set.js';
import { ParameterOperation, ResourceOperation } from 'codify-schemas';
import { describe, expect, it } from 'vitest';

describe('Change set tests', async () => {
  it('Correctly diffs two resource configs (modify)', async () => {
    const after = {
      propA: 'before',
      propB: 'before'
    }

    const before = {
      propA: 'after',
      propB: 'after'
    }

    const cs = await ChangeSet.calculateModification(after, before);
    expect(cs.parameterChanges.length).to.eq(2);
    expect(cs.parameterChanges[0].operation).to.eq(ParameterOperation.MODIFY);
    expect(cs.parameterChanges[1].operation).to.eq(ParameterOperation.MODIFY);
    expect(cs.operation).to.eq(ResourceOperation.RECREATE)
  })

  it('Correctly diffs two resource configs (add)', async () => {
    const after = {
      propA: 'before',
      propB: 'after'
    }

    const before = {
      propA: 'after',
    }

    const cs = await ChangeSet.calculateModification(after, before,);
    expect(cs.parameterChanges.length).to.eq(2);
    expect(cs.parameterChanges[0].operation).to.eq(ParameterOperation.MODIFY);
    expect(cs.parameterChanges[1].operation).to.eq(ParameterOperation.ADD);
    expect(cs.operation).to.eq(ResourceOperation.RECREATE)

  })

  it('Correctly diffs two resource configs (remove)', async () => {
    const after = {
      propA: 'after',
    }

    const before = {
      propA: 'before',
      propB: 'before'
    }

    const cs = await ChangeSet.calculateModification(after, before);
    expect(cs.parameterChanges.length).to.eq(2);
    expect(cs.parameterChanges[0].operation).to.eq(ParameterOperation.MODIFY);
    expect(cs.parameterChanges[1].operation).to.eq(ParameterOperation.REMOVE);
    expect(cs.operation).to.eq(ResourceOperation.RECREATE)
  })

  it('Correctly diffs two resource configs (no-op)', async () => {
    const after = {
      propA: 'prop',
    }

    const before = {
      propA: 'prop',
    }

    const cs = await ChangeSet.calculateModification(after, before);
    expect(cs.parameterChanges.length).to.eq(1);
    expect(cs.parameterChanges[0].operation).to.eq(ParameterOperation.NOOP);
    expect(cs.operation).to.eq(ResourceOperation.NOOP)
  })

  it('Correctly diffs two resource configs (create)', () => {
    const cs = ChangeSet.create({
      propA: 'prop',
      propB: 'propB'
    });

    expect(cs.parameterChanges.length).to.eq(2);
    expect(cs.parameterChanges[0].operation).to.eq(ParameterOperation.ADD);
    expect(cs.parameterChanges[1].operation).to.eq(ParameterOperation.ADD);
    expect(cs.operation).to.eq(ResourceOperation.CREATE)
  })

  it('Correctly diffs two resource configs (destory)', () => {
    const cs = ChangeSet.destroy({
      propA: 'prop',
      propB: 'propB'
    });

    expect(cs.parameterChanges.length).to.eq(2);
    expect(cs.parameterChanges[0].operation).to.eq(ParameterOperation.REMOVE);
    expect(cs.parameterChanges[1].operation).to.eq(ParameterOperation.REMOVE);
    expect(cs.operation).to.eq(ResourceOperation.DESTROY)
  })

  it('handles simple arrays', async () => {
    const before = {
      propA: ['a', 'b', 'c'],
    }

    const after = {
      propA: ['b', 'a', 'c'],
    }

    const cs = await ChangeSet.calculateModification(after, before, { propA: { type: 'array' } });
    expect(cs.parameterChanges.length).to.eq(1);
    expect(cs.parameterChanges[0].operation).to.eq(ParameterOperation.NOOP);
    expect(cs.operation).to.eq(ResourceOperation.NOOP)
  })

  it('handles simple arrays 2', async () => {
    const after = {
      propA: ['a', 'b', 'c'],
    }

    const before = {
      propA: ['b', 'a'],
    }

    const cs = await ChangeSet.calculateModification(after, before, { propA: { type: 'array' } });
    expect(cs.parameterChanges.length).to.eq(1);
    expect(cs.parameterChanges[0].operation).to.eq(ParameterOperation.MODIFY);
    expect(cs.operation).to.eq(ResourceOperation.RECREATE)
  })

  it('determines the order of operations with canModify 1', async () => {
    const after = {
      propA: 'after',
    }

    const before = {
      propA: 'before',
      propB: 'before'
    }

    const cs = await ChangeSet.calculateModification(after, before, { propA: { canModify: true } });
    expect(cs.parameterChanges.length).to.eq(2);
    expect(cs.parameterChanges[0].operation).to.eq(ParameterOperation.MODIFY);
    expect(cs.parameterChanges[1].operation).to.eq(ParameterOperation.REMOVE);
    expect(cs.operation).to.eq(ResourceOperation.RECREATE)
  })

  it('determines the order of operations with canModify 2', async () => {
    const after = {
      propA: 'after',
    }

    const before = {
      propA: 'before',
      propB: 'before'
    }

    const cs = await ChangeSet.calculateModification<any>(after, before, {
      propA: { canModify: true },
      propB: { canModify: true }
    });
    expect(cs.parameterChanges.length).to.eq(2);
    expect(cs.parameterChanges[0].operation).to.eq(ParameterOperation.MODIFY);
    expect(cs.parameterChanges[1].operation).to.eq(ParameterOperation.REMOVE);
    expect(cs.operation).to.eq(ResourceOperation.MODIFY)
  })


  it('correctly determines array equality', async () => {
    const arrA = ['a', 'b', 'd'];
    const arrB = ['a', 'b', 'd'];

    const result = await ChangeSet.calculateModification({ propA: arrA }, { propA: arrB }, { propA: { type: 'array' } })

    expect(result.operation).to.eq(ResourceOperation.NOOP);
  })

  it('correctly determines array equality 2', async () => {
    const arrA = ['a', 'b'];
    const arrB = ['a', 'b', 'd'];

    const result = await ChangeSet.calculateModification({ propA: arrA }, { propA: arrB }, { propA: { type: 'array' } })

    expect(result.parameterChanges[0].operation).to.eq(ParameterOperation.MODIFY);
  })

  it('correctly determines array equality 3', async () => {
    const arrA = ['b', 'a', 'd'];
    const arrB = ['a', 'b', 'd'];

    const result = await ChangeSet.calculateModification({ propA: arrA }, { propA: arrB }, { propA: { type: 'array' } })

    expect(result.parameterChanges[0].operation).to.eq(ParameterOperation.NOOP);
  })

  it('correctly determines array equality 4', async () => {
    const arrA = [{ key1: 'a' }, { key1: 'a' }, { key1: 'a' }];
    const arrB = [{ key1: 'a' }, { key1: 'a' }, { key1: 'b' }];

    const result = await ChangeSet.calculateModification({ propA: arrA }, { propA: arrB }, {
      propA: {
        type: 'array',
        isElementEqual: (a, b) => a.key1 === b.key1
      }
    })

    expect(result.parameterChanges[0].operation).to.eq(ParameterOperation.MODIFY);
  })

  it('correctly determines array equality 5', async () => {
    const arrA = [{ key1: 'b' }, { key1: 'a' }, { key1: 'a' }];
    const arrB = [{ key1: 'a' }, { key1: 'a' }, { key1: 'b' }];

    const result = await ChangeSet.calculateModification({ propA: arrA }, { propA: arrB }, {
      propA: {
        type: 'array',
        isElementEqual: (a, b) => a.key1 === b.key1
      }
    })

    expect(result.parameterChanges[0].operation).to.eq(ParameterOperation.NOOP);
  })
})
