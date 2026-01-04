import { KeyedLatch, Latch } from "./latch.js";
import { OrderedPeer } from "./orderedPeer.js";
import { CathodiqueConsumerHandler } from "../ipcHandlers/cathodiqueConsumer.js";
import { CathodiqueHostHandler } from "../ipcHandlers/cathodiqueHost.js";
import { DOMHostHandler } from "../ipcHandlers/domHost.js";
import { OtherNodeRegistry } from "./sharedDomHost.js";
import { ComponentList, ComponentListHandle } from "./componentList.js";
import { SemanticMessageChannel } from "./semanticMessageChannel.js";
import { CathodiqueProviderHandler } from "../ipcHandlers/cathodiqueProvider.js";
import { ComponentInstanceProxy, ComponentListProxy, makeComponentProxy } from "../utils/remoteToLocalAdapter.js";
import { WithTransfer } from "./withTransfer.js";
import { orchestrator } from "./orchestrator.js";
import { Component, ComponentHandle } from "./component.js";
import z from "zod";

/*
Four cases.

consumer|provider
module  |module
--------+--------
local   |local
local   |remote
remote  |local
remote  |remote

For local consumer, we need to provide a proxy to directly interact with the Module
For remote consumer, we need to create a messagechannel
*/

export abstract class BaseModule {
  static summonnedModules = new Map<string, BaseModule>();
  static tokenToModule = new Map<string, BaseModule>();

  static summonnedModulesById = new Map<string, BaseModule>();
  static moduleById(id: string) {
    return this.summonnedModulesById.get(id);
  }

  static originOfModule(module?: BaseModule) {
    if (module instanceof RemoteModule) {
      return module.origin;
    }
    return window.origin;
  }

  static async getModule(moduleName: string) {
    if (this.summonnedModules.has(moduleName)) {
      return this.summonnedModules.get(moduleName)!;
    }

    return RemoteModule.create(moduleName);
  }

  opaqueToken: string;

  moduleName: string;
  constructor(moduleName: string) {
    if (BaseModule.summonnedModules.has(moduleName)) throw new Error("Module already initialized");
    BaseModule.summonnedModules.set(moduleName, this);

    this.opaqueToken = orchestrator.data.moduleData[moduleName]!.opaqueToken;

    this.moduleName = moduleName;
  }

  abstract localHandle: ComponentListHandle;
  abstract getRemoteHandle(to: RemoteModule): MessagePort | Promise<MessagePort>;
  abstract instanceExists(id: string): boolean | Promise<boolean>;
  abstract getComponent(id: string): ComponentHandle | undefined | Promise<ComponentHandle | undefined>;
}

export class LocalModule extends BaseModule {
  static availableModules = new Set<string>();

  static setupModule(moduleName: string) {
    this.availableModules.add(moduleName);
    const mod = new LocalModule(moduleName);
    BaseModule.summonnedModules.set(moduleName, mod);
    return mod;
  }

  components = new Map<string, Component>();

  localHandle: ComponentList;
  constructor(moduleName: string) {
    super(moduleName);

    this.localHandle = new ComponentList(this);
  }

  remoteHandles = new Map<RemoteModule, MessagePort>();
  getRemoteHandle(from: RemoteModule) {
    if (this.remoteHandles.has(from)) return this.remoteHandles.get(from)!;

    const messageChannel = new SemanticMessageChannel();

    const ipc = new OrderedPeer(messageChannel.providerPort, BaseModule.originOfModule(from));
    ipc.addHandler(new CathodiqueProviderHandler(from, this));

    this.remoteHandles.set(from, messageChannel.consumerPort);
    return messageChannel.consumerPort;
  }

  #componentInstances = new Map<string, Component>();
  instanceExists(id: string) {
    return this.#componentInstances.has(id);
  }
  register(id: string, comp: Component) {
    this.#componentInstances.set(id, comp);
  }
  getComponent(id: string) {
    return this.#componentInstances.get(id);
  }
}

export class RemoteModule extends BaseModule {
  static iframeLoad(iframe: HTMLIFrameElement) {
    return new Promise<void>((r) => {
      iframe.addEventListener("load", () => r(), { once: true });
    });
  }
  static moduleSubdomainOf(moduleName: string) {
    return moduleName.split('.').toReversed().join('.');
  }
  // Init resolves latches: It's why it's hidden
  static async create(moduleName: string) {
    const moduleSubdomain = this.moduleSubdomainOf(moduleName);

    const iframe = document.createElement("iframe");
    iframe.src = `https://${moduleSubdomain}.raytu.be/module.html`;
    iframe.hidden = true;

    document.body.append(iframe);

    const win = iframe.contentWindow!;
    OtherNodeRegistry.setRegistry(win, new OtherNodeRegistry(win));

    return new RemoteModule(moduleName, iframe);
  }

  peer: OrderedPeer;
  iframe: HTMLIFrameElement;
  get win() { return this.iframe.contentWindow! };

  componentList: ComponentListHandle;
  private constructor(moduleName: string, iframe: HTMLIFrameElement) {
    super(moduleName);

    this.iframe = iframe;

    this.componentList = new ComponentListProxy();
    this.peer = new OrderedPeer(
      iframe.contentWindow!,
      `https://${this.#moduleSubdomain}.raytu.be`,
    );
    this.peer.addHandler(new CathodiqueConsumerHandler(this));
    this.peer.addHandler(new CathodiqueHostHandler(this));
    this.peer.addHandler(new DOMHostHandler(this.win, this));
  }

  get #moduleSubdomain() {
    return RemoteModule.moduleSubdomainOf(this.moduleName);
  }
  get origin() {
    return `https://${this.#moduleSubdomain}.raytu.be`;
  }

  #iframeLoaded = false
  componentReady = new KeyedLatch<string, void>();

  async waitForComponent(componentName: string) {
    await this.componentReady.get(componentName);
  }

  localHandle = {
    get: function (this: RemoteModule, componentName: string) {
      return function (this: RemoteModule, ...args: any[]) {
        return makeComponentProxy(this, componentName, { args });
      }.bind(this) as unknown as new () => ComponentInstanceProxy; // Proxy magic: TS is wrong here
    }.bind(this),
  }

  remoteHandles = new Map<RemoteModule, MessagePort>();
  async getRemoteHandle(to: RemoteModule) {
    if (this.remoteHandles.has(to)) return this.remoteHandles.get(to)!;

    const messageChannel = new SemanticMessageChannel();

    await this.peer.rpc("connectAsProvider",
      new WithTransfer(
        { data: { port: messageChannel.providerPort, moduleToken: undefined } },
        [messageChannel.providerPort],
      ));

    this.remoteHandles.set(to, messageChannel.consumerPort);
    return messageChannel.consumerPort;
  }

  async submitRemoteHandle(port: MessagePort, from: RemoteModule) {
    await this.peer.rpc("connectAsProvider",
      new WithTransfer(
        { data: { port: port, moduleToken: from.opaqueToken } },
        [port],
      ));
  }

  async instanceExists(id: string) {
    return await this.peer.rpc("instanceExists", { componentId: id });
  }
  async getInstanceData(id: string) {
    return await this.peer.rpc("getInstanceData", { componentId: id });
  }

  #componentInstances = new Map<string, ComponentInstanceProxy>();
  instanceProxyExists(id: string) {
    return this.#componentInstances.has(id);
  }
  getInstanceProxy(id: string) {
    return this.#componentInstances.get(id);
  }

  registerInstanceProxy(id: string, comp: ComponentInstanceProxy) {
    this.#componentInstances.set(id, comp);
  }
  async getComponent(id: string): Promise<ComponentInstanceProxy | undefined> {
    if (this.#componentInstances.has(id)) return this.#componentInstances.get(id)!;

    const componentData = z.union(
      [
        z.undefined(),
        z.object({
          componentName: z.string(),
        }),
      ]
    ).parse(await this.getInstanceData(id));
    if (componentData) {
      return makeComponentProxy(this, componentData.componentName, { componentId: id });
    }
  }
}
