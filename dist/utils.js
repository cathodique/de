"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInRegion = isInRegion;
const wl_region_1 = require("@cathodique/wl-serv-high/dist/objects/wl_region");
function isInRegion(reg, y, x) {
    return reg.reduce((a, v) => {
        if (!v.hasCoordinate(y, x))
            return a;
        return v.type;
    }, null) === wl_region_1.InstructionType.Add;
}
