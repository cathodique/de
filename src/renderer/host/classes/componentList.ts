import { ComponentClass, ComponentHandleFactory } from "../utils/types.js";
import { Component } from "./component.js";
import { Latch } from "./latch.js";
import { LocalModule } from "./module.js";

export class InvalidComponentError extends Error {}

// ASSUMPTION: All components will return themselves.
export class ComponentList extends EventTarget implements ComponentListHandle {
  componentClasses = new Map<string, ComponentClass>();
  componentClassToClassName = new Map<ComponentClass, string>()

  componentInstances = new Map<string, Component>();
  instanceExists(id: string) {
    return this.componentInstances.has(id);
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

  module: LocalModule;
  constructor(mod: LocalModule) {
    super();
    this.module = mod;
  }

  #readyLatch = new Latch<void>();
  get ready() {
    return this.#readyLatch.promise;
  }
  markReady() {
    this.#readyLatch.resolve?.();
  }

  register(componentName: string, componentClass: ComponentClass) {
    if (this.componentClasses.has(componentName))
      throw new Error("This component already exists");

    this.componentClasses.set(componentName, componentClass);
    this.markAs(componentClass, componentName);
  }
  markAs(componentClass: ComponentClass, componentName: string) {
    this.componentClassToClassName.set(componentClass, componentName);
  }

  get(componentName: string) {
    const InnerClass = this.componentClasses.get(componentName);
    if (!InnerClass) return;

    return {
      create: (...args: any[]) => {
        switch (InnerClass.type) {
          case "REF_ONLY": {
            throw new Error("You are not supposed to instanciate this class");
          }
          case "SINGLETON": {
            if (!InnerClass.singletonInstance) throw new Error("Singleton instance was not set up.");
            return InnerClass.singletonInstance;
          }
          case "NORMAL": {
            return "create" in InnerClass
              ? InnerClass.create(this.module, ...args)
              : new InnerClass(this.module, ...args);
          }
        }
      }
    };
  }

  has(componentName: string) {
    return this.componentClasses.has(componentName);
  }
}

export type ComponentListHandle = {
  get(componentName: string): undefined
    | ComponentHandleFactory;
};
