import { describe, expect, test } from 'bun:test';
import { createSingleFlight } from './single-flight.ts';

describe('createSingleFlight', () => {
  test('deduplicates concurrent calls with the same key', async () => {
    const flight = createSingleFlight<string>();
    let executions = 0;

    const task = async () => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return `result-${executions}`;
    };

    const [first, second, third] = await Promise.all([
      flight.run('key', task),
      flight.run('key', task),
      flight.run('key', task),
    ]);

    expect(executions).toBe(1);
    expect(first).toBe('result-1');
    expect(second).toBe('result-1');
    expect(third).toBe('result-1');
  });

  test('runs tasks for different keys independently', async () => {
    const flight = createSingleFlight<string>();
    const results = await Promise.all([
      flight.run('a', async () => 'A'),
      flight.run('b', async () => 'B'),
    ]);
    expect(results).toEqual(['A', 'B']);
  });

  test('clears after settle so later calls re-execute (including failures)', async () => {
    const flight = createSingleFlight<string>();
    let executions = 0;

    await expect(
      flight.run('key', async () => {
        executions += 1;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const result = await flight.run('key', async () => {
      executions += 1;
      return 'second';
    });

    expect(result).toBe('second');
    expect(executions).toBe(2);
  });

  test('failed calls propagate the same error to all waiters', async () => {
    const flight = createSingleFlight<string>();
    let executions = 0;
    const task = async () => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error('shared failure');
    };

    const outcomes = await Promise.allSettled([flight.run('key', task), flight.run('key', task)]);

    expect(executions).toBe(1);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe('rejected');
    }
  });
});
