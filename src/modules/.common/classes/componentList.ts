import { ComponentHandleClass } from "../utils/types.js";
import { Component, ComponentHandle } from "./component.js";

export class InvalidComponentError extends Error {}

export class ComponentList extends EventTarget {
  componentClasses = new Map<string, ComponentHandleClass>();
  componentClassToClassName = new Map<ComponentHandleClass, string>()

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

  register(componentName: string, componentClass: ComponentHandleClass) {
    if (this.componentClasses.has(componentName))
      throw new Error("This component already exists");

    this.componentClasses.set(componentName, componentClass);
    this.componentClassToClassName.set(componentClass, componentName);
  }

  get(componentName: string) {
    return this.componentClasses.get(componentName);
  }

  has(componentName: string) {
    return this.componentClasses.has(componentName);
  }
}

export type ComponentListHandle = {
  get(componentName: string): undefined
    | ComponentHandleClass;
};

export const componentList = new ComponentList();
