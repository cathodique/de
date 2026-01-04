import { OutputConfiguration } from "@cathodique/wl-serv-high/objects";
import { OutputRegistry } from "@cathodique/wl-serv-high/registries";

export class Output {
  configToOutput = new Map<OutputConfiguration, Output>();

  wlOutputReg: OutputRegistry;
  config: OutputConfiguration;
  dom = document.createElement("div");
  get wlOutputAuth() {
    const result = this.wlOutputReg.get(this.config);
    if (!result) throw new Error();
    return result;
  }

  constructor(config: OutputConfiguration, seatReg: OutputRegistry) {
    this.wlOutputReg = seatReg;
    this.config = config;

    this.initOutput();
  }

  initOutput() {
    this.dom.style.position = "absolute";
    this.dom.style.top = `${this.config.x}px`;
    this.dom.style.left = `${this.config.y}px`;
    this.dom.style.width = `${this.config.w}px`;
    this.dom.style.height = `${this.config.h}px`;

    document.body.querySelector('main')!.append(this.dom);
  }
}
