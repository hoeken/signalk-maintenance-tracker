import type { WorkSums } from '../db/logs.repo';
import type { Aggregate, WorkStats } from '../types';

export function aggregate(total: number, count: number): Aggregate {
  return { total, count, average: count > 0 ? total / count : null };
}

/** Aggregate over the recorded values; nulls (not recorded) are skipped. */
export function aggregateOf(values: (number | null)[]): Aggregate {
  const recorded = values.filter((v): v is number => v !== null);
  return aggregate(
    recorded.reduce((sum, v) => sum + v, 0),
    recorded.length,
  );
}

export function workStatsFromSums(s: WorkSums): WorkStats {
  return {
    hours: aggregate(s.hours_total, s.hours_count),
    cost: aggregate(s.cost_total, s.cost_count),
  };
}

export const EMPTY_SUMS: WorkSums = {
  hours_total: 0,
  hours_count: 0,
  cost_total: 0,
  cost_count: 0,
};

export function addSums(a: WorkSums, b: WorkSums): WorkSums {
  return {
    hours_total: a.hours_total + b.hours_total,
    hours_count: a.hours_count + b.hours_count,
    cost_total: a.cost_total + b.cost_total,
    cost_count: a.cost_count + b.cost_count,
  };
}
