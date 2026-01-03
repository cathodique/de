import { CathodiqueConsumerHandler } from "../ipcHandlers/cathodiqueConsumer.js";
import { ComponentInstanceProxy, makeComponentProxy } from "../utils/remoteToLocalAdapter.js";
import { KeyedLatch } from "./latch.js";
import { OrderedPeer } from "./orderedPeer.js";
import { DummyNodeRegistry } from "./sharedDomDummy.js";

// The RemoteModule class manages the lifecycle of a RemoteModule
// Mainly, the components made available (through keyed latch componentReady)
export class RemoteModule {
  static summonnedModulesByPort = new Map<MessagePort, RemoteModule>();
  static summonnedModulesById = new Map<string, RemoteModule>();

  static getOrCreate(port: MessagePort, id: string) {
    if (this.summonnedModulesByPort.has(port)) return this.summonnedModulesByPort.get(port)!;

    return this.createModule(port, id);
  }

  static createModule(port: MessagePort, id: string) {
    const mod = new RemoteModule(port, id);
    this.summonnedModulesByPort.set(port, mod);
    this.summonnedModulesById.set(id, mod)

    return mod;
  }

  static moduleById(id: string) {
    return this.summonnedModulesById.get(id);
  }
  static moduleOfPort(port: MessagePort) {
    return this.summonnedModulesByPort.get(port);
  }

  id: string;

  port: MessagePort;
  peer: OrderedPeer;
  constructor(port: MessagePort, id: string) {
    this.port = port;
    this.id = id;

    // "*" is fine because we can trust the origin who passed the messageport onto us
    this.peer = new OrderedPeer(port, "*");
    this.peer.addHandler(new CathodiqueConsumerHandler(this.componentReady));

    DummyNodeRegistry.setRegistry(port, new DummyNodeRegistry(port));
  }

  componentReady = new KeyedLatch<string, void>();

  async waitForComponent(componentName: string) {
    await this.componentReady.get(componentName);
  }

  localHandle = {
    get: function (this: RemoteModule, componentName: string) {
      return function (this: RemoteModule, ...args: any[]) {
        return makeComponentProxy(this, componentName, { args });
      }.bind(this) as unknown as new () => ComponentInstanceProxy;
    }.bind(this),
  }

  async componentExists(id: string) {
    return await this.peer.rpc("componentExists", { componentId: id });
  }
}
