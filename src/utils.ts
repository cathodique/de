import { InstructionType, RegRectangle } from "@cathodique/wayland-server-js-impl/dist/objects/wl_region";

export function isInRegion(reg: RegRectangle[], y: number, x: number) {
  return reg.reduce<InstructionType | null>((a, v) => {
    if (!v.hasCoordinate(y, x)) return a;
    return v.type;
  }, null) === InstructionType.Add;
}
