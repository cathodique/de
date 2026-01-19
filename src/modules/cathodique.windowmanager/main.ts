import type { ComponentListHandle } from "../.common/classes/componentList.js";
import type { ComponentHandle } from "../.common/classes/component.js";
import type { ComponentInstanceProxy } from "../.common/utils/remoteToLocalAdapter.js";
import { Component, componentList, Resolver } from "../.common/index.js";

class WindowManager extends Component {
  $output = (document.querySelector("window_manager")! as HTMLTemplateElement)
    .content.cloneNode(true) as DocumentFragment;

  #windowFrameModule;
  #windowRegistry;
  windowFrames = new Map<ComponentInstanceProxy, ComponentHandle>(); // Window to WindowFrame

  static async create() {
    const windowFrameModule = await Resolver.getDependency("WindowFrame");
    const windowRegistry = await Resolver.summon("Cathodique::Window.WindowRegistry");

    return new WindowManager(windowFrameModule, windowRegistry);
  }

  constructor(windowFrameModule: ComponentListHandle, windowRegistry: ComponentInstanceProxy) {
    super();

    // windowRegistry.$hello();

    this.#windowFrameModule = windowFrameModule;
    this.#windowRegistry = windowRegistry;

    this.#windowRegistry.on("newWindow", this.newWindow);
  }
  async newWindow(window: ComponentInstanceProxy) {
    alert("aaa");

    // window is a window component :3
    const WindowFrame = this.#windowFrameModule.get("WindowFrame")!;
    const windowFrame = await WindowFrame.create(window);
    this.windowFrames.set(window, windowFrame);

    this.$output.append(await windowFrame.$output);
  }
}

componentList.register("WindowFrame", WindowManager);
// componentList.rea
