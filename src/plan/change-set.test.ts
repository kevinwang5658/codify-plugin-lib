import { ChangeSet } from './change-set.js';
import { ParameterOperation, ResourceOperation } from 'codify-schemas';
import { describe, expect, it } from 'vitest';

describe('Change set tests (stateful)', () => {
  it ('Correctly diffs two resource configs (modify)', () => {
    const after = {
      propA: 'before',
      propB: 'before'
    }

    const before = {
      propA: 'after',
      propB: 'after'
    }

    const cs = ChangeSet.calculateParameterChangeSet(after, before, { statefulMode: true });
    expect(cs.length).to.eq(2);
    expect(cs[0].operation).to.eq(ParameterOperation.MODIFY);
    expect(cs[1].operation).to.eq(ParameterOperation.MODIFY);
  })

  it ('Correctly diffs two resource configs (add)', () => {
    const after = {
      propA: 'before',
      propB: 'after'
    }

    const before = {
      propA: 'after',
    }

    const cs = ChangeSet.calculateParameterChangeSet(after, before, { statefulMode: true });
    expect(cs.length).to.eq(2);
    expect(cs[0].operation).to.eq(ParameterOperation.MODIFY);
    expect(cs[1].operation).to.eq(ParameterOperation.ADD);
  })

  it ('Correctly diffs two resource configs (remove)', () => {
    const after = {
      propA: 'after',
    }

    const before = {
      propA: 'before',
      propB: 'before'
    }

    const cs = ChangeSet.calculateParameterChangeSet(after, before, { statefulMode: true });
    expect(cs.length).to.eq(2);
    expect(cs[0].operation).to.eq(ParameterOperation.MODIFY);
    expect(cs[1].operation).to.eq(ParameterOperation.REMOVE);
  })

  it ('Correctly diffs two resource configs (no-op)', () => {
    const after = {
      propA: 'prop',
    }

    const before = {
      propA: 'prop',
    }

    const cs = ChangeSet.calculateParameterChangeSet(after, before, { statefulMode: true });
    expect(cs.length).to.eq(1);
    expect(cs[0].operation).to.eq(ParameterOperation.NOOP);
  })

  it ('handles simple arrays', () => {
    const before = {
      propA: ['a', 'b', 'c'],
    }

    const after = {
      propA: ['b', 'a', 'c'],
    }

    const cs = ChangeSet.calculateParameterChangeSet(after, before, { statefulMode: true });
    expect(cs.length).to.eq(1);
    expect(cs[0].operation).to.eq(ParameterOperation.NOOP);
  })

  it ('handles simple arrays', () => {
    const after = {
      propA: ['a', 'b', 'c'],
    }

    const before = {
      propA: ['b', 'a'],
    }

    const cs = ChangeSet.calculateParameterChangeSet(after, before, { statefulMode: true });
    expect(cs.length).to.eq(1);
    expect(cs[0].operation).to.eq(ParameterOperation.MODIFY);
  })

  it ('determines the order of operations 1', () => {
    const op1 = ResourceOperation.MODIFY;
    const op2 = ResourceOperation.CREATE

    const opResult = ChangeSet.combineResourceOperations(op1, op2);
    expect(opResult).to.eq(ResourceOperation.CREATE);
  })

  it ('determines the order of operations 2', () => {
    const op1 = ResourceOperation.NOOP;
    const op2 = ResourceOperation.MODIFY

    const opResult = ChangeSet.combineResourceOperations(op1, op2);
    expect(opResult).to.eq(ResourceOperation.MODIFY);
  })

  it ('determines the order of operations 3', () => {
    const op1 = ResourceOperation.MODIFY;
    const op2 = ResourceOperation.MODIFY

    const opResult = ChangeSet.combineResourceOperations(op1, op2);
    expect(opResult).to.eq(ResourceOperation.MODIFY);
  })

  it('correctly determines array equality', () => {
    const arrA = ['a', 'b', 'd'];
    const arrB = ['a', 'b', 'd'];

    expect(ChangeSet.isSame(arrA, arrB)).to.be.true;
  })

  it('correctly determines array equality 2', () => {
    const arrA = ['a', 'b'];
    const arrB = ['a', 'b', 'd'];

    expect(ChangeSet.isSame(arrA, arrB)).to.be.false;
  })

  it('correctly determines array equality 3', () => {
    const arrA = ['b', 'a', 'd'];
    const arrB = ['a', 'b', 'd'];

    expect(ChangeSet.isSame(arrA, arrB)).to.be.true;
  })

  it('correctly determines array equality 4', () => {
    const arrA = [{ key1: 'a' }, { key1: 'a' }, { key1: 'a' }];
    const arrB = [{ key1: 'a' }, { key1: 'a' }, { key1: 'b' }];

    expect(ChangeSet.isSame(arrA, arrB)).to.be.false;
  })

  it('correctly determines array equality 5', () => {
    const arrA = [{ key1: 'b' }, { key1: 'a' }, { key1: 'a' }];
    const arrB = [{ key1: 'a' }, { key1: 'a' }, { key1: 'b' }];

    expect(ChangeSet.isSame(arrA, arrB)).to.be.false;
  })
})
