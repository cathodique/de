import { KeyedLatch, Latch } from "./latch.js";
import { OrderedPeer } from "./orderedPeer.js";
import { CathodiqueAvailableComponentsHandler, CathodiqueConsumerHandler } from "../ipcHandlers/cathodiqueConsumer.js";
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

  static addModule(moduleName: string, module: BaseModule) {
    if (BaseModule.summonnedModules.has(moduleName)) throw new Error("Module already initialized");
    BaseModule.summonnedModulesByToken.set(module.opaqueToken, module);
    BaseModule.summonnedModules.set(moduleName, module);
  }

  static summonnedModulesByToken = new Map<string, BaseModule>();
  static moduleByToken(id: string) {
    return this.summonnedModulesByToken.get(id);
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
  abstract win: WindowProxy;

  moduleName: string;
  constructor(moduleName: string) {
    this.opaqueToken = orchestrator.data.moduleData[moduleName]!.opaqueToken;

    this.moduleName = moduleName;
  }

  abstract localHandle: ComponentListHandle;
  abstract getRemoteHandle(to: RemoteModule): MessagePort | undefined | Promise<MessagePort | undefined>;
  abstract instanceExists(id: string): boolean | Promise<boolean>;
  abstract getComponent(id: string): ComponentHandle | undefined | Promise<ComponentHandle | undefined>;
}

export class LocalModule extends BaseModule {
  static availableModules = new Set<string>();

  static setupModule(moduleName: string) {
    this.availableModules.add(moduleName);
    const mod = new LocalModule(moduleName);
    return mod;
  }

  win = window;

  components = new Map<string, Component>();

  localHandle: ComponentList;
  constructor(moduleName: string) {
    super(moduleName);

    this.localHandle = new ComponentList(this);
  }

  remoteHandles = new Set<RemoteModule>();
  getRemoteHandle(from: RemoteModule) {
    if (this.remoteHandles.has(from)) return undefined;

    const messageChannel = new SemanticMessageChannel();

    const peer = new OrderedPeer(messageChannel.providerPort, "*");
    peer.addHandler(new CathodiqueProviderHandler(from, this, peer));

    this.remoteHandles.add(from);
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
    iframe.src = `https://${moduleSubdomain}.raytu.be/module.html?parent_origin=${encodeURIComponent(window.origin)}`;
    iframe.hidden = true;

    document.body.append(iframe);

    const win = iframe.contentWindow!;
    OtherNodeRegistry.setRegistry(win, new OtherNodeRegistry(win));

    const peer = new OrderedPeer(
      iframe.contentWindow!,
      `https://${moduleSubdomain}.raytu.be`,
    );
    const availableComponents = new Latch<string[]>();
    peer.addHandler(new CathodiqueAvailableComponentsHandler(availableComponents));

    return new RemoteModule(moduleName, await availableComponents.promise, peer, iframe);
  }

  peer: OrderedPeer;
  iframe: HTMLIFrameElement;
  get win() { return this.iframe.contentWindow! };

  componentList: ComponentListHandle;
  private constructor(moduleName: string, availableComponents: string[], peer: OrderedPeer, iframe: HTMLIFrameElement) {
    super(moduleName);

    this.peer = peer;
    this.iframe = iframe;

    this.availableComponents = availableComponents;

    this.componentList = new ComponentListProxy(this);

    this.peer.addHandler(new CathodiqueHostHandler(this));
    this.peer.addHandler(new DOMHostHandler(this.win, this));
    this.peer.addHandler(new CathodiqueConsumerHandler(this));
  }

  get #moduleSubdomain() {
    return RemoteModule.moduleSubdomainOf(this.moduleName);
  }
  get origin() {
    return `https://${this.#moduleSubdomain}.raytu.be`;
  }

  availableComponents: string[];

  localHandle = {
    get: (componentName: string) => ({
      create: (...args: any[]) => {
        return makeComponentProxy(this, componentName, { args });
      },
    }),
  }

  remoteHandles = new Set<RemoteModule>();
  async getRemoteHandle(to: RemoteModule) {
    if (this.remoteHandles.has(to)) return undefined;

    const messageChannel = new SemanticMessageChannel();

    await this.peer.rpc("connectAsProvider",
      new WithTransfer(
        { port: messageChannel.providerPort, id: to.opaqueToken },
        [messageChannel.providerPort],
      ));

    this.remoteHandles.add(to);
    return messageChannel.consumerPort;
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
