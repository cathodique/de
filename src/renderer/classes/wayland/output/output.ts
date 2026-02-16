import { Reactive } from "@cathodique/wl-serv-high/lib";
import { OutputConfiguration, OutputRegistry } from "@cathodique/wl-serv-high/registries";

export class Output {
  configToOutput = new Map<Reactive<OutputConfiguration>, Output>();

  wlOutputReg: OutputRegistry;
  config: Reactive<OutputConfiguration>;
  dom = document.createElement("div");
  get wlOutputAuth() {
    const result = this.wlOutputReg.get(this.config);
    if (!result) throw new Error();
    return result;
  }

  constructor(config: Reactive<OutputConfiguration>, seatReg: OutputRegistry) {
    this.wlOutputReg = seatReg;
    this.config = config;

    this.initOutput();
  }

  initOutput() {
    this.dom.style.position = "absolute";
    this.dom.style.pointerEvents = "none";
    this.dom.style.top = `${this.config.value.x}px`;
    this.dom.style.left = `${this.config.value.y}px`;
    this.dom.style.width = `${this.config.value.w}px`;
    this.dom.style.height = `${this.config.value.h}px`;

    document.body.append(this.dom);
  }
}
