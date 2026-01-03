import { nanoid } from "../utils/utils.js";
import { BaseModule, LocalModule } from "./module.js";
import { orchestrator } from "./orchestrator.js";

export interface ComponentContext {
  module: BaseModule;
}
export type ComponentHandle = {
  module: BaseModule;
  componentId: string | Promise<string>;

  init(): any;
} & { [k in `$${string}`]: any };

const isComponentSymbol = Symbol();
export class Component extends EventTarget {
  static isComponentSymbol: typeof isComponentSymbol = isComponentSymbol;

  [x: `$${string}`]: any;

  componentId: string;
  module: LocalModule;

  [isComponentSymbol] = true;
  constructor(module: LocalModule) {
    super();
    this.componentId = nanoid();
    this.module = module;
  }

  init() {}

  getDependency(dependency: string) {
    const newMod = orchestrator.load(dependency);
    return newMod?.localHandle;
  }
  getAllDependency(dependency: string) {
    const newMod = orchestrator.loadAll(dependency);
    return newMod?.map((v) => v.localHandle);
  }
};
