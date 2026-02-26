import type {
  RescueCommandPlanCandidate,
  RescueCommandPlanContext,
  RescuePlannerId,
} from './command-planner-types.ts';

export type RescueCommandPlannerStrategy = {
  id: RescuePlannerId;
  priority: number;
  plan: (context: RescueCommandPlanContext) => Promise<RescueCommandPlanCandidate | null>;
};
