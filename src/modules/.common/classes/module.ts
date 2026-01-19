import { CathodiqueAvailableComponentsHandler, CathodiqueConsumerHandler } from "../ipcHandlers/cathodiqueConsumer.js";
import { parentIpc } from "../parentIpc.js";
import { ComponentInstanceProxy, makeComponentProxy } from "../utils/remoteToLocalAdapter.js";
import { KeyedLatch, Latch } from "./latch.js";
import { OrderedPeer } from "./orderedPeer.js";
import { Resolver } from "./resolver.js";
import { DummyNodeRegistry } from "./sharedDomDummy.js";

// The RemoteModule class manages the lifecycle of a RemoteModule
// Mainly, the components made available (through keyed latch componentReady)
export class RemoteModule {
  static summonnedModulesByPort = new Map<MessagePort, RemoteModule>();
  static summonnedModulesByToken = new Map<string, RemoteModule>();

  static getOrCreate(port: MessagePort | undefined, id: string) {
    if (this.summonnedModulesByToken.has(id)) return this.summonnedModulesByToken.get(id)!;

    if (!port) throw new Error("Message port supposedly neutered yet is not in my registry");

    return this.createModule(port, id);
  }

  static async createModule(port: MessagePort, opaqueToken: string) {
    const peer = new OrderedPeer(port, opaqueToken, "*");
    const latch = new Latch<string[]>();
    peer.addHandler(new CathodiqueAvailableComponentsHandler(latch));

    const availableComponents = await latch.promise;

    const mod = new RemoteModule(port, availableComponents, peer, opaqueToken);
    this.summonnedModulesByPort.set(port, mod);
    this.summonnedModulesByToken.set(opaqueToken, mod)

    return mod;
  }

  static async moduleByOpaqueToken(opaqueToken: string) {
    return this.summonnedModulesByToken.get(opaqueToken)
      || Resolver.getModuleByToken(opaqueToken);
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

  availableComponents: string[];

  port: MessagePort;
  peer: OrderedPeer;
  constructor(port: MessagePort, availableComponents: string[], peer: OrderedPeer, id: string) {
    this.port = port;
    this.id = id;

    this.availableComponents = availableComponents;

    // "*" is fine because we can trust the origin who passed the messageport onto us
    this.peer = peer;
    this.peer.addHandler(new CathodiqueConsumerHandler(this));

    DummyNodeRegistry.setRegistry(this.peer, new DummyNodeRegistry(this.peer));
  }

  localHandle = {
    get: (componentName: string) => ({
      create: (...args: any[]) => {
        return makeComponentProxy(this, componentName, { args });
      },
    }),
  };

  async instanceExists(componentId: string) {
    return await this.peer.rpc("instanceExists", { componentId });
  }
}
