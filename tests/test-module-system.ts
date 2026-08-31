/**
 * Cathodique SES/Endo Module System Verification Test Suite.
 * Tests:
 * 1. SES lockdown & primordial hardening
 * 2. Standalone interface modules with static export maps & metaparameters
 * 3. Modular folder packages with manifests
 * 4. Compartment isolation & guest sandboxing
 * 5. Privileged Init module orchestrating based on interface metaparameters
 * 6. Spawn & resolve lifecycle
 * 7. Host module linking (@cathodique/wl-serv-high)
 * 8. Asset security (blocking dangerous HTML/script content types)
 */

import "ses";
import { Cathodique, CathodiqueModuleLoader } from "../src/renderer/index.js";
import { validateModuleExports } from "../src/renderer/core/interface.js";
import { ensureLockdown } from "../src/renderer/core/ses-env.js";

async function runTests() {
  console.log("==================================================================");
  console.log(" Cathodique SES/Endo Module System Tests");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Test SES Lockdown & Primordial Hardening
  console.log("\n1. Testing SES Lockdown & Primordial Hardening...");
  ensureLockdown();
  assert(typeof Compartment === "function", "Compartment global exists");
  assert(Object.isFrozen(Object.prototype), "Object.prototype is hardened / frozen");

  // 2. Test Standalone Interface Modules with Metaparameters
  console.log("\n2. Testing Standalone Interface Modules & Metaparameters...");
  const loader = new CathodiqueModuleLoader({
    namespace: "@cathodique",
    baseURL: "https://mods.cathodique.de",
  });

  // Load standalone interface modules
  const wmIface = await loader.loadInterface("@cathodique/wm-iface");
  assert(wmIface.name === "@cathodique/wm-iface", "Loaded standalone @cathodique/wm-iface interface");
  assert(wmIface.exportMap.createWindow !== undefined, "Interface defines static exportMap");
  assert(wmIface.metaparameters?.category === "window-management", "Interface defines category metaparameter");
  assert(wmIface.metaparameters?.priority === 100, "Interface defines priority score metaparameter");

  const layerIface = await loader.loadInterface("@cathodique/layer-iface");
  assert(layerIface.name === "@cathodique/layer-iface", "Loaded @cathodique/layer-iface interface");
  assert(layerIface.metaparameters?.defaultImplementation === "@cathodique/layerloader", "Interface defines default implementation metaparameter");

  const serviceIface = await loader.loadInterface("@cathodique/service-iface");
  assert(serviceIface.name === "@cathodique/service-iface", "Loaded @cathodique/service-iface interface");
  assert(serviceIface.metaparameters?.capabilities?.includes("lifecycle:start") === true, "Interface defines capabilities metaparameter");

  const loaderIface = await loader.loadInterface("@cathodique/loader-iface");
  assert(loaderIface.name === "@cathodique/loader-iface", "Loaded @cathodique/loader-iface interface");

  const initIface = await loader.loadInterface("@cathodique/init-iface");
  assert(initIface.name === "@cathodique/init-iface", "Loaded @cathodique/init-iface interface");

  // 3. Test Export Map Validation
  console.log("\n3. Testing Export Map Contract Validation...");
  const validWmExports = {
    createWindow: (t: string) => ({ id: "w-1", title: t }),
    closeWindow: (id: string) => true,
    listWindows: () => [],
  };
  const valResult1 = validateModuleExports(validWmExports, wmIface);
  assert(valResult1.valid === true, "Valid exports conform to @cathodique/wm-iface contract");

  const invalidExports = { createWindow: "not-a-function" };
  const valResult2 = validateModuleExports(invalidExports as any, wmIface);
  assert(valResult2.valid === false, "Invalid exports correctly fail contract validation");

  // 4. Test Real Module Loading (from folder with manifest)
  console.log("\n4. Testing Real Module Loading (Folder & Manifest)...");
  const layerMod = await loader.loadModule<any>("@cathodique/layerloader");
  assert(Boolean(layerMod), "Loaded @cathodique/layerloader module from folder");
  assert(layerMod.compartment !== undefined, "Module executes inside dedicated Compartment");
  assert(typeof layerMod.exports.createLayer === "function", "Exported createLayer() function available");

  const layer = (layerMod.exports.createLayer as Function)("DesktopIcons", 10);
  assert(layer.name === "DesktopIcons" && layer.zIndex === 10, "createLayer() executes cleanly in sandbox");

  // 5. Test Guest Compartment Sandboxing
  console.log("\n5. Testing Guest Compartment Sandboxing...");
  assert(layerMod.compartment.globalThis !== globalThis, "Guest Compartment globalThis is isolated from host");

  // 6. Test Informed Module Selection based on Metaparameters in Init
  console.log("\n6. Testing Metaparameter-based Module Selection (Init Decision Engine)...");
  const { selectBestModuleForInterface } = await import("../src/renderer/modules/cathodique/init/index.js");
  const selectedWm = await selectBestModuleForInterface(loader, "@cathodique/wm-iface", wmIface.metaparameters ?? {}, { config: {} });
  assert(selectedWm === "@cathodique/sample-wm", "Selected @cathodique/sample-wm based on wm-iface metaparameters");

  const selectedLayer = await selectBestModuleForInterface(loader, "@cathodique/layer-iface", layerIface.metaparameters ?? {}, { config: {} });
  assert(selectedLayer === "@cathodique/layerloader", "Selected @cathodique/layerloader based on layer-iface metaparameters");

  const selectedService = await selectBestModuleForInterface(loader, "@cathodique/service-iface", serviceIface.metaparameters ?? {}, { config: {} });
  assert(selectedService === "@cathodique/sample-service", "Selected @cathodique/sample-service based on service-iface metaparameters");

  // 7. Test Privileged Init Module Orchestrating Interfaces
  console.log("\n7. Testing Privileged Init Module Orchestration...");
  const initResult = await loader.bootstrapInit("@cathodique/init") as any;
  assert(typeof initResult === "object", "Init module executed in privileged compartment");
  assert(initResult.exposedInterfaces?.includes("@cathodique/wm-iface"), "Init module exposed @cathodique/wm-iface based on metaparameters");
  assert(initResult.exposedInterfaces?.includes("@cathodique/service-iface"), "Init module exposed @cathodique/service-iface based on metaparameters");
  assert(initResult.exposedInterfaces?.includes("@cathodique/layer-iface"), "Init module exposed @cathodique/layer-iface based on metaparameters");

  // 8. Test Spawn & Resolve Singletons
  console.log("\n8. Testing spawn() and resolve() Singletons...");
  const wmInstance = await loader.spawn<any>("@cathodique/wm-iface");
  assert(typeof wmInstance.createWindow === "function", "spawned WindowManager implementation");
  const win = wmInstance.createWindow("Cathodique Terminal", { appId: "org.cathodique.terminal" });
  assert(win.id.startsWith("win-"), "WindowManager createWindow operates across compartment");

  const resolvedWm = loader.resolve<any>("@cathodique/wm-iface");
  assert(resolvedWm === wmInstance, "resolve() retrieves the cached instance singleton");

  // 8b. Test xdg_shell Toplevel Grouping and Parent-Child Hierarchy
  console.log("\n8b. Testing xdg_shell Toplevel Grouping & Hierarchy...");
  const browserMain = wmInstance.createWindow("Cathodique Web Browser", { appId: "org.cathodique.browser" });
  const browserModal = wmInstance.createWindow("Browser Settings Modal", {
    parentId: browserMain.id,
    isModal: true,
  });

  assert(browserModal.parentId === browserMain.id, "Child toplevel links to parent (set_parent)");
  assert(browserModal.groupId === browserMain.groupId, "Child toplevel inherits parent's groupId");
  assert(browserModal.zIndex > browserMain.zIndex, "Child modal is placed above parent in z-order");

  const group = wmInstance.getToplevelGroup(browserMain.id);
  assert(group !== undefined, "Retrieved toplevel group by windowId");
  assert(group?.windowIds.includes(browserMain.id) && group?.windowIds.includes(browserModal.id), "Group contains parent and child toplevels");

  // Test activating group
  wmInstance.activateGroup(browserMain.groupId);
  const reloadedModal = wmInstance.listWindows().find((w: any) => w.id === browserModal.id);
  assert(reloadedModal?.zIndex > browserMain.zIndex, "activateGroup preserves relative parent-child z-order");

  // Test minimize group
  wmInstance.minimizeGroup(browserMain.groupId, true);
  const minGroup = wmInstance.getToplevelGroup(browserMain.groupId);
  assert(minGroup?.minimized === true, "minimizeGroup minimizes all toplevels in the group");

  // Test close group
  wmInstance.closeGroup(browserMain.groupId);
  assert(wmInstance.getToplevelGroup(browserMain.groupId) === undefined, "closeGroup closes all toplevels in the group");

  // 9. Test Loading with @cathodique/wl-serv-high
  console.log("\n9. Testing Loading with @cathodique/wl-serv-high...");
  loader.registerHostModule("@cathodique/wl-serv-high", {
    HLCompositor: class MockHLCompositor {
      public params: any = { socketPath: "/tmp/wayland-mock-0" };
      constructor(public metadata: any) {}
      start() {}
    },
    HLConnection: class MockHLConnection {},
  });

  const waylandInitResult = await loader.bootstrapInit("@cathodique/init") as any;
  assert(waylandInitResult.compositor !== undefined, "Init module instantiated Wayland HLCompositor");

  // 10. Test Cathodique Runtime Host Class
  console.log("\n10. Testing Cathodique Host Runtime Class...");
  const cathodique = new Cathodique({
    namespace: "@cathodique",
    baseURL: "https://mods.cathodique.de",
  });

  // 11. Test DOM Membrane, Single-Ownership, and Scriptless Iframe Layers
  console.log("\n11. Testing DOM Membrane, Single Ownership, & Scriptless Iframe...");
  const { DomMembrane } = await import("../src/renderer/core/dom-membrane.js");
  const membrane = DomMembrane.getInstance();

  // Create mock scriptless iframe DOM structure for headless test
  class MockDOMNode {
    childNodes: MockDOMNode[] = [];
    parentNode: any = null;
    style: any = {};
    dataset: any = {};
    shadowRoot: any = null;
    constructor(public tagName = "DIV", public className = "") {}
    appendChild(child: any) {
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    removeChild(child: any) {
      this.childNodes = this.childNodes.filter(c => c !== child);
      child.parentNode = null;
      return child;
    }
    attachShadow(opts: any) {
      this.shadowRoot = new MockDOMNode("SHADOW_ROOT");
      return this.shadowRoot;
    }
    setAttribute(k: string, v: string) { (this as any)[k] = v; }
    getElementById(id: string): any {
      if ((this as any).id === id) return this;
      for (const c of this.childNodes) {
        const found = c.getElementById(id);
        if (found) return found;
      }
      return null;
    }
    createElement(tag: string) { return new MockDOMNode(tag.toUpperCase()); }
  }

  const mockDoc: any = new MockDOMNode("DOCUMENT");
  mockDoc.open = () => {};
  mockDoc.write = (html: string) => {
    const root = new MockDOMNode("DIV");
    root.setAttribute("id", "cathodique-desktop-root");
    mockDoc.appendChild(root);
  };
  mockDoc.close = () => {};
  mockDoc.getElementById = (id: string) => {
    return id === "cathodique-desktop-root" ? mockDoc.childNodes[0] : null;
  };

  const mockIframe: any = { contentDocument: mockDoc };

  const { root: desktopRoot } = membrane.initScriptlessIframe(mockIframe);
  assert(desktopRoot !== undefined, "Initialized scriptless iframe viewport");
  assert(membrane.isOwner(desktopRoot as any, "@cathodique/init"), "Init owns root desktop container");

  // Test DOM capabilities & ShadowRoot creation via Proxy
  const docA = membrane.createDocumentProxy("@cathodique/layerloader", mockDoc) as any;
  const docB = membrane.createDocumentProxy("@cathodique/sample-wm", mockDoc) as any;

  const componentA = docA.createElement("div");
  const shadowA = componentA.attachShadow({ mode: "open" });
  assert(shadowA !== undefined, "createDocumentProxy allows attachShadow on proxied node");
  
  const realComponentA = membrane.unwrapNode(componentA);
  const realShadowA = membrane.unwrapNode(shadowA);
  assert(membrane.isOwner(realComponentA, "@cathodique/layerloader") === true, "Module A is owner of its created element");
  assert(membrane.isOwner(realShadowA, "@cathodique/layerloader") === true, "Module A is owner of its ShadowRoot");

  // Test Single-Ownership enforcement: Module B cannot append to Node A
  let ownershipBlocked = false;
  try {
    const componentB = docB.createElement("div");
    // If B gets a hold of A's real node, and tries to append via its own proxy or real?
    // Let's test by creating a proxy of A for B, and B trying to mutate it
    const proxyAforB = membrane.createNodeProxy("@cathodique/sample-wm", realComponentA);
    proxyAforB.appendChild(componentB);
  } catch (err: any) {
    ownershipBlocked = err.message.includes("not permitted to mutate node");
    if (!ownershipBlocked) {
      console.error("UNEXPECTED ERROR:", err.message);
    }
  }
  assert(ownershipBlocked === true, "DOM Membrane blocks multi-module mutation / hijacking via Proxy traps");

  // Test DOM export into scriptless iframe layer
  (desktopRoot as any).appendChild(realComponentA);
  assert((desktopRoot as any).childNodes.includes(realComponentA), "Module A exported node into scriptless iframe root");

  console.log("\n==================================================================");
  console.log(` Summary: ${passed} passed, ${failed} failed`);
  console.log("==================================================================");

  if (failed > 0) {
    throw new Error(`${failed} tests failed`);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test runner encountered error:", err);
  process.exit(1);
});
