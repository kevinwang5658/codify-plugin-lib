import { ChangeSet } from './change-set';
import { expect } from 'chai';
import { ParameterOperation, ResourceOperation } from 'codify-schemas';

describe('Change set tests', () => {
  it ('Correctly diffs two resource configs (modify)', () => {
    const before = {
      type: 'config',
      propA: 'before',
      propB: 'before'
    }

    const after = {
      type: 'config',
      propA: 'after',
      propB: 'after'
    }

    const cs = ChangeSet.calculateParameterChangeSet(before, after);
    expect(cs.length).to.eq(2);
    expect(cs[0].operation).to.eq(ParameterOperation.MODIFY);
    expect(cs[1].operation).to.eq(ParameterOperation.MODIFY);
  })

  it ('Correctly diffs two resource configs (add)', () => {
    const before = {
      type: 'config',
      propA: 'before',
    }

    const after = {
      type: 'config',
      propA: 'after',
      propB: 'after'
    }

    const cs = ChangeSet.calculateParameterChangeSet(before, after);
    expect(cs.length).to.eq(2);
    expect(cs[0].operation).to.eq(ParameterOperation.MODIFY);
    expect(cs[1].operation).to.eq(ParameterOperation.ADD);
  })

  it ('Correctly diffs two resource configs (remove)', () => {
    const before = {
      type: 'config',
      propA: 'before',
      propB: 'before'
    }

    const after = {
      type: 'config',
      propA: 'after',
    }

    const cs = ChangeSet.calculateParameterChangeSet(before, after);
    expect(cs.length).to.eq(2);
    expect(cs[0].operation).to.eq(ParameterOperation.MODIFY);
    expect(cs[1].operation).to.eq(ParameterOperation.REMOVE);
  })

  it ('Correctly diffs two resource configs (no-op)', () => {
    const before = {
      type: 'config',
      propA: 'prop',
    }

    const after = {
      type: 'config',
      propA: 'prop',
    }

    const cs = ChangeSet.calculateParameterChangeSet(before, after);
    expect(cs.length).to.eq(1);
    expect(cs[0].operation).to.eq(ParameterOperation.NOOP);
  })

  it ('handles simple arrays', () => {
    const before = {
      type: 'config',
      propA: ['a', 'b', 'c'],
    }

    const after = {
      type: 'config',
      propA: ['b', 'a', 'c'],
    }

    const cs = ChangeSet.calculateParameterChangeSet(before, after);
    expect(cs.length).to.eq(1);
    expect(cs[0].operation).to.eq(ParameterOperation.NOOP);
  })

  it ('handles simple arrays', () => {
    const before = {
      type: 'config',
      propA: ['a', 'b'],
    }

    const after = {
      type: 'config',
      propA: ['b', 'a', 'c'],
    }

    const cs = ChangeSet.calculateParameterChangeSet(before, after);
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
