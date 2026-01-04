import { CathodiqueConsumerHandler } from "../ipcHandlers/cathodiqueConsumer.js";
import { ComponentInstanceProxy, makeComponentProxy } from "../utils/remoteToLocalAdapter.js";
import { KeyedLatch } from "./latch.js";
import { OrderedPeer } from "./orderedPeer.js";
import { DummyNodeRegistry } from "./sharedDomDummy.js";

// The RemoteModule class manages the lifecycle of a RemoteModule
// Mainly, the components made available (through keyed latch componentReady)
export class RemoteModule {
  static summonnedModulesByPort = new Map<MessagePort, RemoteModule>();
  static summonnedModulesByOpaqueToken = new Map<string, RemoteModule>();

  static getOrCreate(port: MessagePort, id: string) {
    if (this.summonnedModulesByPort.has(port)) return this.summonnedModulesByPort.get(port)!;

    return this.createModule(port, id);
  }

  static createModule(port: MessagePort, opaqueToken: string) {
    const mod = new RemoteModule(port, opaqueToken);
    this.summonnedModulesByPort.set(port, mod);
    this.summonnedModulesByOpaqueToken.set(opaqueToken, mod)

    return mod;
  }

  static moduleByOpaqueToken(opaqueToken: string) {
    return this.summonnedModulesByOpaqueToken.get(opaqueToken);
  }
  static moduleOfPort(port: MessagePort) {
    return this.summonnedModulesByPort.get(port);
  }

  #componentInstances = new Map<string, ComponentInstanceProxy>(); // TODO Memory management
  registerInstanceProxy(id: string, comp: ComponentInstanceProxy) {
    this.#componentInstances.set(id, comp);
  }
  instanceProxyExists(componentId: string) {
    return this.#componentInstances.get(componentId);
  }
  getInstanceProxy(componentId: string) {
    return this.#componentInstances.get(componentId);
  }

  id: string;

  port: MessagePort;
  peer: OrderedPeer;
  constructor(port: MessagePort, id: string) {
    this.port = port;
    this.id = id;

    // "*" is fine because we can trust the origin who passed the messageport onto us
    this.peer = new OrderedPeer(port, "*");
    this.peer.addHandler(new CathodiqueConsumerHandler(this));

    DummyNodeRegistry.setRegistry(port, new DummyNodeRegistry(port));
  }

  componentReady = new KeyedLatch<string, void>();

  async waitForComponent(componentName: string) {
    await this.componentReady.get(componentName);
  }

  localHandle = {
    get: (componentName: string) => {
      return function (this: RemoteModule, ...args: any[]) {
        return makeComponentProxy(this, componentName, { args });
      }.bind(this) as unknown as new () => ComponentInstanceProxy;
    },
  };

  async componentExists(componentId: string) {
    return await this.peer.rpc("componentExists", { componentId });
  }
}
