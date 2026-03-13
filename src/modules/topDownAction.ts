import { TOP_DOWN_ACTION_PRESET } from "./actionModulePresets";
import { PresetActionModule } from "./thirdPersonAction";

export class TopDownActionModule extends PresetActionModule {
  constructor() {
    super(TOP_DOWN_ACTION_PRESET);
  }
}
