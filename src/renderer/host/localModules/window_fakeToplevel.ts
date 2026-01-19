import { Component } from "../classes/component.js";
import { windowModule } from "./window_toplevel.js";

export class FakeToplevel extends Component {
  constructor(contents: string) {
    super(windowModule);
  }
}
windowModule.localHandle.markAs(FakeToplevel, "Window");
