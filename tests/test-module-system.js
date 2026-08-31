"use strict";
/**
 * Cathodique SES/Endo Module System Verification Test Suite.
 * Tests real modular packages with manifests, compartments, export maps, and asset security.
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("ses");
const index_js_1 = require("../src/renderer/index.js");
const interface_js_1 = require("../src/renderer/core/interface.js");
const ses_env_js_1 = require("../src/renderer/core/ses-env.js");
async function runTests() {
    console.log("==================================================================");
    console.log(" Cathodique SES/Endo Module System Tests");
    console.log("==================================================================");
    let passed = 0;
    let failed = 0;
    function assert(condition, message) {
        if (condition) {
            console.log(`  [PASS] ${message}`);
            passed++;
        }
        else {
            console.error(`  [FAIL] ${message}`);
            failed++;
        }
    }
    // 1. Test SES Lockdown & Primordial Hardening
    console.log("\n1. Testing SES Lockdown & Primordial Hardening...");
    (0, ses_env_js_1.ensureLockdown)();
    assert(typeof Compartment === "function", "Compartment global exists");
    assert(Object.isFrozen(Object.prototype), "Object.prototype is hardened / frozen");
    // 2. Test Interface Definitions & Export Map Validation
    console.log("\n2. Testing Interface Definitions & Export Map Validation...");
    const validExports = {
        createWindow: (t) => ({ id: "w-1", title: t }),
        closeWindow: (id) => true,
        listWindows: () => [],
    };
    const valResult1 = (0, interface_js_1.validateModuleExports)(validExports, interface_js_1.WindowManagerInterface);
    assert(valResult1.valid === true, "WindowManager exports conform to @cathodique/window-manager interface");
    const invalidExports = {
        createWindow: "invalid",
    };
    const valResult2 = (0, interface_js_1.validateModuleExports)(invalidExports, interface_js_1.WindowManagerInterface);
    assert(valResult2.valid === false, "Invalid exports correctly rejected");
    // 3. Test Real Module Loading (from folder with manifest)
    console.log("\n3. Testing Real Module Loading (Folder & Manifest)...");
    const loader = new index_js_1.CathodiqueModuleLoader({
        namespace: "@cathodique",
        baseURL: "https://mods.cathodique.de",
    });
    const layerMod = await loader.loadModule("@cathodique/layerloader");
    assert(Boolean(layerMod), "Loaded @cathodique/layerloader module from folder");
    assert(layerMod.compartment !== undefined, "Module executes inside dedicated Compartment");
    assert(typeof layerMod.exports.createLayer === "function", "Exported createLayer() function available");
    const layer = layerMod.exports.createLayer("DesktopIcons", 10);
    assert(layer.name === "DesktopIcons" && layer.zIndex === 10, "createLayer() executes cleanly in sandbox");
    // 4. Test Sandboxed Guest Compartment (No ambient global leakage)
    console.log("\n4. Testing Guest Compartment Sandboxing...");
    assert(layerMod.compartment.globalThis !== globalThis, "Guest Compartment globalThis is isolated from host");
    // 5. Test Privileged Init Module (Full access to globalThis)
    console.log("\n5. Testing Privileged Init Module...");
    const initResult = await loader.bootstrapInit("init");
    assert(typeof initResult === "object", "Init module executed in privileged compartment");
    assert(typeof initResult.loader === "object", "Init module received decoupled loader handle");
    // 6. Test Spawn & Resolve Interface Lifecycle
    console.log("\n6. Testing spawn() and resolve() on Real Window Manager Module...");
    loader.mapInterface("@cathodique/window-manager", "@cathodique/sample-wm");
    const wmInstance = await loader.spawn("@cathodique/window-manager");
    assert(typeof wmInstance.createWindow === "function", "spawned WindowManager from modules/cathodique/sample-wm/");
    const win = wmInstance.createWindow("Cathodique Terminal");
    assert(win.id === "win-1", "WindowManager createWindow operates across compartment");
    const resolvedWm = loader.resolve("@cathodique/window-manager");
    assert(resolvedWm === wmInstance, "resolve() retrieves the cached instance singleton");
    // 7. Test Service Module Lifecycle
    console.log("\n7. Testing Real Service Module from Folder...");
    loader.mapInterface("@cathodique/service", "@cathodique/sample-service");
    const svcInstance = await loader.spawn("@cathodique/service");
    assert(typeof svcInstance.start === "function", "Spawned Service from modules/cathodique/sample-service/");
    assert(typeof svcInstance.status === "function", "Service status function available");
    // 8. Test Loading with @cathodique/wl-serv-high
    console.log("\n8. Testing Loading with @cathodique/wl-serv-high...");
    loader.registerHostModule("@cathodique/wl-serv-high", {
        HLCompositor: class MockHLCompositor {
            metadata;
            params = { socketPath: "/tmp/wayland-mock-0" };
            constructor(metadata) {
                this.metadata = metadata;
            }
            start() { }
        },
        HLConnection: class MockHLConnection {
        },
    });
    const waylandInitHandle = await loader.loadModule("init", { isInit: true });
    assert(typeof waylandInitHandle.exports.init === "function", "Init module loaded with wl-serv-high host support");
    // 9. Test Cathodique Runtime Host Class
    console.log("\n9. Testing Cathodique Host Runtime Class...");
    const cathodique = new index_js_1.Cathodique({
        namespace: "@cathodique",
        baseURL: "https://mods.cathodique.de",
        interfaces: {
            "@cathodique/window-manager": "@cathodique/sample-wm",
            "@cathodique/service": "@cathodique/sample-service",
        },
    });
    const bootedResult = await cathodique.init("init");
    assert(typeof bootedResult === "object", "Cathodique.init() bootstrapped environment");
    console.log("\n==================================================================");
    console.log(` Summary: ${passed} passed, ${failed} failed`);
    console.log("==================================================================");
    if (failed > 0) {
        throw new Error(`${failed} tests failed`);
    }
}
runTests().catch((err) => {
    console.error("Test runner encountered error:", err);
    process.exit(1);
});
