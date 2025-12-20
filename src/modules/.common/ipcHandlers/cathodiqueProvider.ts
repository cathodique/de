import { ComponentList } from "../classes/componentList.js";
import { SharedDOM } from "../classes/sharedDomRemote.js";

export class CathodiqueProviderHandler {
  componentList: ComponentList;

  constructor(componentList: ComponentList) {
    this.componentList = componentList;
  }

  componentInstances = new Map<string, any>();

  async createInstance({ data }: { data: { className: string; componentId: string } }) {
    // TODO Obj verification
    const ClassObj = this.componentList.get(data.className);
    if (!ClassObj) return; // Quiet fail

    const componentInstance = new ClassObj();

    await componentInstance.init();

    this.componentInstances.set(data.componentId, componentInstance);
    return;
  }

  getProperty({ data }: { data: { propertyName: string; componentId: string } }) {
    const component = this.componentInstances.get(data.componentId);

    const value = component[data.propertyName];

    if (value instanceof Node) {
      const nodeId = SharedDOM.initOrGet(value);

      return { nodeId };
    }

    return { value };
  }

  async callProperty({ data }: {
    data: {
      methodName: string;
      arguments: string[];
      componentId: string;
    };
  }) {
    const component = this.componentInstances.get(data.componentId);

    const value = await component?.[data.methodName]?.(...data.arguments);

    if (value instanceof Node) {
      const nodeId = SharedDOM.initOrGet(value);

      return { nodeId };
    }

    return { value };
  }
};
