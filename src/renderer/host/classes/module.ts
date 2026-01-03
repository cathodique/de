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
import { Component } from "./component.js";

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

  static getModule(moduleName: string) {
    if (this.summonnedModules.has(moduleName)) {
      return this.summonnedModules.get(moduleName)!;
    }

    return new RemoteModule(moduleName);
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
  abstract componentExists(id: string): boolean | Promise<boolean>;
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

  componentInstances = new Map<string, Component>();
  componentExists(id: string) {
    return this.componentInstances.has(id);
  }
  register(id: string, comp: Component) {
    this.componentInstances.set(id, comp);
  }
}

export class RemoteModule extends BaseModule {
  iframe: HTMLIFrameElement;
  #ipcLatch: Latch<OrderedPeer>;
  get peer() { return this.#ipcLatch.promise }
  #winLatch: Latch<WindowProxy>;
  get win() { return this.#winLatch.promise }

  componentList: ComponentListHandle;
  constructor(moduleName: string) {
    super(moduleName);

    this.iframe = this.#createIframe();
    document.body.append(this.iframe);

    this.#ipcLatch = new Latch();
    this.#winLatch = new Latch();

    this.#init();

    this.componentList = new ComponentListProxy();
  }

  get #moduleSubdomain() {
    return this.moduleName.split('.').toReversed().join('.');
  }
  get origin() {
    return `https://${this.#moduleSubdomain}.raytu.be`;
  }

  #createIframe() {
    const iframe = document.createElement("iframe");
    iframe.src = `https://${this.#moduleSubdomain}.raytu.be/module.html`;
    iframe.hidden = true;

    return iframe;
  }

  #iframeLoaded = false
  get iframeLoad() {
    if (this.#iframeLoaded) return Promise.resolve();
    return new Promise<void>((r) => {
      this.iframe.addEventListener("load", () => r(), { once: true });
    })
      .then(function (this: RemoteModule) { this.#iframeLoaded = true; }.bind(this))
  }

  componentReady = new KeyedLatch<string, void>();

  // Init resolves latches: It's why it's hidden
  async #init() {
    await this.iframeLoad;

    const win = this.iframe.contentWindow!;
    this.#winLatch.resolve!(win);

    const moduleSubdomain = this.moduleName.split('.').toReversed().join('.');

    OtherNodeRegistry.setRegistry(win, new OtherNodeRegistry(win));

    const ipc = new OrderedPeer(
      this.iframe.contentWindow!,
      `https://${moduleSubdomain}.raytu.be`,
    );
    ipc.addHandler(new CathodiqueConsumerHandler(this.componentReady));
    ipc.addHandler(new CathodiqueHostHandler(this));
    ipc.addHandler(new DOMHostHandler(win, this));

    this.#ipcLatch.resolve!(ipc);
  }

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

    const ipc = await this.#ipcLatch.promise;
    await ipc.rpc("connectAsProvider",
      new WithTransfer(
        { data: { port: messageChannel.providerPort, moduleToken: undefined } },
        [messageChannel.providerPort],
      ));

    this.remoteHandles.set(to, messageChannel.consumerPort);
    return messageChannel.consumerPort;
  }

  async submitRemoteHandle(port: MessagePort, from: RemoteModule) {
    const ipc = await this.#ipcLatch.promise;
    await ipc.rpc("connectAsProvider",
      new WithTransfer(
        { data: { port: port, moduleToken: from.opaqueToken } },
        [port],
      ));
  }

  async componentExists(id: string) {
    return await (await this.peer).rpc("componentExists", { componentId: id });
  }
}
