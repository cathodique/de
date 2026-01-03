import { LocalModule } from "../classes/module.js";
import { Component } from "../classes/component";

class WindowLocal extends Component {
  $element = document.createElement("canvas");
}

const WindowModule = LocalModule.setupModule("Cathodique::Window");
WindowModule.localHandle.register("Window", WindowLocal);

export { WindowModule };
