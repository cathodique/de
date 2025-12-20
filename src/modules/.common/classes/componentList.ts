import { parentIpc } from "../parentIpc.js";
import type { Component } from "./component.js";

export class ComponentList extends EventTarget {
  componentClasses = new Map();

  register(componentName: string, componentClass: new (...a: any[]) => Component) {
    if (this.componentClasses.has(componentName))
      throw new Error("This component already exists");
    this.componentClasses.set(componentName, componentClass);

    parentIpc.post({
      type: "componentRegistered",
      data: { componentName },
    });
  }

  get(componentName: string) {
    return this.componentClasses.get(componentName);
  }
}

export const componentList = new ComponentList();
