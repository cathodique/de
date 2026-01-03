import { Component, ComponentHandle } from "./component.js";
import { LocalModule } from "./module.js";

export class InvalidComponentError extends Error {}

export class ComponentList extends EventTarget {
  componentClasses = new Map<string, new (mod: LocalModule, ...args: any[]) => ComponentHandle>();
  componentClassToClassName = new Map<new (mod: LocalModule, ...args: any[]) => ComponentHandle, string>()

  module: LocalModule;
  constructor(mod: LocalModule) {
    super();
    this.module = mod;
  }

  componentTypeOf(component: Component) {
    // Traversing prototype chain (from most specific to least specific)
    // will take less time than traversing all the possible components.
    let currentPrototype: any = Object.getPrototypeOf(component);
    while (currentPrototype !== null) {
      if (this.componentClassToClassName.has(currentPrototype.constructor)) {
        return this.componentClassToClassName.get(currentPrototype.constructor)!;
      }
      currentPrototype = Object.getPrototypeOf(currentPrototype);
    }

    throw new InvalidComponentError();
    // Implications: The object has had [Symbol(Component.isComponentSymbol)] set to true but was not a component
  }

  register(componentName: string, componentClass: new (mod: LocalModule) => ComponentHandle) {
    if (this.componentClasses.has(componentName))
      throw new Error("This component already exists");

    this.componentClasses.set(componentName, componentClass);
    this.componentClassToClassName.set(componentClass, componentName);
  }

  get(componentName: string) {
    const InnerClass = this.componentClasses.get(componentName);
    if (!InnerClass) return;

    return function (this: ComponentList, ...args: any[]) {
      return new InnerClass(this.module, ...args);
    }.bind(this) as unknown as new (...args: any[]) => ComponentHandle;
  }
}

export type ComponentListHandle = {
  get(componentName: string): undefined
    | (new (...args: any[]) => ComponentHandle);
};
