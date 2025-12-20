import { KeyedLatch, Latch } from "./latch.js";
import { OrderedPeer } from "./orderedPeer.js";
import { CathodiqueConsumerHandler } from "../ipcHandlers/cathodiqueConsumer.js";
import { CathodiqueHostHandler } from "../ipcHandlers/cathodiqueHost.js";
import { DOMHostHandler } from "../ipcHandlers/domHost.js";
import { nanoid } from "../../.common/utils/utils.js";
import { makeComponentProxy } from "../utils/componentProxy.js";
import { OtherNodeRegistry } from "./sharedDomHost.js";

export class Module {
  static summonnedModules = new Map<string, Module>();

  static getModule(moduleName: string) {
    return this.summonnedModules.get(moduleName) ?? new Module(moduleName);
  }

  iframe: HTMLIFrameElement;
  moduleName: string;
  #ipcLatch: Latch<OrderedPeer>;
  get peer() { return this.#ipcLatch.promise }
  #winLatch: Latch<WindowProxy>;
  get win() { return this.#winLatch.promise }

  constructor(moduleName: string) {
    if (Module.summonnedModules.has(moduleName)) throw new Error("Module already initialized");

    this.moduleName = moduleName;

    const moduleSubdomain = moduleName.split('.').toReversed().join('.');

    this.iframe = document.createElement("iframe");
    this.iframe.src = `https://${moduleSubdomain}.raytu.be/module.html`;
    this.iframe.hidden = true;
    document.body.append(this.iframe);

    this.#ipcLatch = new Latch();
    this.#winLatch = new Latch();

    this.#init();
  }

  #iframeLoaded = false
  get iframeLoad() {
    if (this.#iframeLoaded) return Promise.resolve();
    return new Promise<void>((r) => {
      this.iframe.addEventListener("load", () => r(), { once: true });
    })
      .then(function (this: Module) { this.#iframeLoaded = true; }.bind(this))
  }

  componentReady = new KeyedLatch<string, void>();

  async #init() {
    await this.iframeLoad;

    const win = this.iframe.contentWindow!;
    this.#winLatch.resolve!(win);

    const moduleSubdomain = this.moduleName.split('.').toReversed().join('.');

    console.log(`https://${moduleSubdomain}.raytu.be`);

    OtherNodeRegistry.setRegistry(win, new OtherNodeRegistry(win));

    const ipc = new OrderedPeer(
      this.iframe.contentWindow!,
      `https://${moduleSubdomain}.raytu.be`,
      [
        new CathodiqueConsumerHandler(this.componentReady) as any,
        new CathodiqueHostHandler(this) as any,
        new DOMHostHandler(win, this) as any,
      ]
    );
    this.#ipcLatch.resolve!(ipc);
  }

  async waitForComponent(componentName: string) {
    await this.componentReady.get(componentName);
  }

  createInstance(componentName: string) {
    const componentId = nanoid();

    const peerPromise = this.waitForComponent(componentName).then(async function (this: Module) {
      const peer = await this.peer;
      await peer.rpc("createInstance", {
        className: componentName,
        componentId,
      })
      return peer;
    }.bind(this));

    return makeComponentProxy(componentId, peerPromise);
  }
}
