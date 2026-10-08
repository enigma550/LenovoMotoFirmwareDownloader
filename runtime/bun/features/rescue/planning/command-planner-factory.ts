import type { RescueCommandPlannerStrategy } from './command-planner-strategy.ts';
import { edlFirehosePlannerStrategy } from './strategies/edl-firehose-planner.ts';
import { mediatekScriptPlannerStrategy } from './strategies/mediatek-script-planner.ts';
import { unisocPacPlannerStrategy } from './strategies/unisoc-pac-planner.ts';
import { xmlFastbootPlannerStrategy } from './strategies/xml-fastboot-planner.ts';

export function createRescueCommandPlannerStrategies(): RescueCommandPlannerStrategy[] {
  return [
    xmlFastbootPlannerStrategy,
    mediatekScriptPlannerStrategy,
    edlFirehosePlannerStrategy,
    unisocPacPlannerStrategy,
  ];
}
