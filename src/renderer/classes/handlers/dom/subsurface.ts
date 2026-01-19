import { WlSubsurface } from "@cathodique/wl-serv-high/objects";
import { WlSurface } from "@cathodique/wl-serv-high/objects";
import { wlToObj } from "../handlers.js";
import { BaseDom } from "./base.js";

export class SubsurfaceDom extends BaseDom<WlSubsurface, HTMLDivElement> {
  get surfaceDom() { return wlToObj.get(this.wl.meta.surface)! };
  get parentSurfaceDom() { return wlToObj.get(this.wl.meta.parent)! };

  constructor(wl: WlSubsurface) {
    super(wl, document.createElement("div"));
    this.dom.append(this.surfaceDom.dom);
    this.dom.style.position = "absolute";

    wlToObj.set(wl, this);
  }

  init () {
    // Subsurface shenanigans
    // TODO: Apply on commit
    this.wl.on("wlPlaceAbove", this.placeAbove.bind(this));
    this.placeAbove({ sibling: this.wl.meta.parent });

    this.wl.on("wlPlaceBelow", this.placeBelow.bind(this));

    this.wl.on('wlSetPosition', ({ y, x }: { y: number, x: number }) => {
      this.dom.style.top = `${y}px`;
      this.dom.style.left = `${x}px`;
    });
  }

  get kid() {
    const kidWl = this.wl.meta.surface;
    const kidDom = wlToObj.get(kidWl);

    if (!kidDom) throw new Error("DOM of surface does not exist");
    return kidDom;
  }

  placeAbove({ sibling: other }: { sibling: WlSurface }) {
    console.log(other, this.wl.getRelationWith(other));
    switch (this.wl.getRelationWith(other)) {
      case "sibling": {
        const sibling = wlToObj.get(other)!;
        const commonParentWl = other.subsurface!.meta.parent;
        const commonParent = wlToObj.get(commonParentWl)!;

        commonParent.dom.insertBefore(this.dom, sibling.dom);
        break;
      }
      case "parent": {
        const parent = wlToObj.get(other)!;

        parent.dom.insertBefore(this.dom, parent.canvas);
        break;
      }
      default:
      // Already handled by wl-serv-high
    }
  }
  placeBelow({ sibling: other }: { sibling: WlSurface }) {
    switch (this.wl.getRelationWith(other)) {
      case "sibling": {
        const sibling = wlToObj.get(other)!;
        const commonParentWl = other.subsurface!.meta.parent;
        const commonParent = wlToObj.get(commonParentWl)!;

        commonParent.dom.insertBefore(this.dom, sibling.dom.nextSibling);
        break;
      }
      case "parent": {
        const parent = wlToObj.get(other)!;

        parent.dom.insertBefore(this.dom, parent.canvas.nextSibling);
        break;
      }
      default:
      // Already handled by wl-serv-high
    }
  }
}
