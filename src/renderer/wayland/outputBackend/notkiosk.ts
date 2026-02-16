import { Reactive } from "@cathodique/wl-serv-high/lib";
import { outputRegistry } from "../overlays/outputRegistryOverlay";

export function initNotkiosk() {
  const currentScreen = new Reactive({
    x: 0,
    y: 0,
    w: window.innerWidth,
    h: window.innerHeight,
    effectiveW: window.innerWidth,
    effectiveH: window.innerHeight,
  });
  outputRegistry.addAuthority(currentScreen);

  window.addEventListener("resize", () => {
    currentScreen.value.w = window.innerWidth;
    currentScreen.value.h = window.innerHeight;
    currentScreen.value.effectiveW = window.innerWidth;
    currentScreen.value.effectiveH = window.innerHeight;
  });
}
