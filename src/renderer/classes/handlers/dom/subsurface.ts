import { WlSubsurface } from "@cathodique/wl-serv-high/dist/objects/wl_subsurface.js";
import { BaseDom } from "./base.js";
import { SurfaceDom } from "./surface.js";
import { WlSurface } from "@cathodique/wl-serv-high/dist/objects/wl_surface.js";

export class SubsurfaceDom extends BaseDom<WlSubsurface, HTMLDivElement> {
  static wlToSubsurfaceDom = new Map<WlSubsurface, SubsurfaceDom>();

  constructor(wl: WlSubsurface) {
    super(wl, document.createElement("div"));
    SubsurfaceDom.wlToSubsurfaceDom.set(wl, this);
    this.init();
  }

  get kid() {
    const kidWl = this.wl.meta.surface;
    const kidDom = SurfaceDom.wlToSurfaceDom.get(kidWl);

    if (!kidDom) throw new Error("DOM of surface does not exist");
    return kidDom;
  }

  init () {
    this.dom.append(this.kid.dom);

    // Subsurface shenanigans
    // TODO: Apply on commit
    this.wl.on("wlPlaceAbove", function (this: SubsurfaceDom, { sibling: other }: { sibling: WlSurface }) {
      switch (this.wl.getRelationWith(other)) {
        case "sibling": {
          const sibling = SurfaceDom.wlToSurfaceDom.get(other)!;
          const commonParentWl = other.subsurface!.meta.parent;
          const commonParent = SurfaceDom.wlToSurfaceDom.get(commonParentWl)!;

          commonParent.dom.insertBefore(this.dom, sibling.dom);
          break;
        }
        case "parent": {
          const parent = SurfaceDom.wlToSurfaceDom.get(other)!;

          const parentSubsurface = SubsurfaceDom.wlToSubsurfaceDom.get(other.subsurface!)!;

          parentSubsurface.dom.insertBefore(this.dom, parent.dom);
          break;
        }
        default:
        // Already handled by wl-serv-high
      }
    }.bind(this));

    this.wl.on("wlPlaceBelow", function (this: SubsurfaceDom, { sibling: other }: { sibling: WlSurface }) {
      switch (this.wl.getRelationWith(other)) {
        case "sibling": {
          const sibling = SurfaceDom.wlToSurfaceDom.get(other)!;
          const commonParentWl = other.subsurface!.meta.parent;
          const commonParent = SurfaceDom.wlToSurfaceDom.get(commonParentWl)!;

          commonParent.dom.insertBefore(this.dom, sibling.dom.nextSibling);
          break;
        }
        case "parent": {
          const parent = SurfaceDom.wlToSurfaceDom.get(other)!;

          const parentSubsurface = SubsurfaceDom.wlToSubsurfaceDom.get(other.subsurface!)!;

          parentSubsurface.dom.insertBefore(this.dom, parent.dom.nextSibling);
          break;
        }
        default:
        // Already handled by wl-serv-high
      }
    }.bind(this));

    this.wl.on('wlSetPosition', function (this: SubsurfaceDom, { y, x }: { y: number, x: number }) {
      const surface = SurfaceDom.wlToSurfaceDom.get(this.wl.meta.surface)!;

      surface.dom.style.top = `${y}px`;
      surface.dom.style.left = `${x}px`;
    }.bind(this));
  }
}
