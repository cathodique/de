import { OrderedPeer } from "../classes/orderedPeer.js";
import { OtherNodeRegistry } from "../classes/sharedDomHost.js";

export function makeComponentProxy(componentId: string, peer: Promise<OrderedPeer> | OrderedPeer) {
  return new Proxy({} as Record<string, any>, {
    get(_, prop) {
      if (prop === "then") return undefined;

      const calledOrGotten = async function (...args: any[]) {
        console.log(args);
        console.trace();
        const v = await (await peer).rpc("callProperty", {
          methodName: prop,
          arguments: args,
          componentId,
        });
        if ("nodeId" in v) {
          return OtherNodeRegistry.registryOf((await peer).win)!.getNode(v.nodeId);
        }
        return v.value;
      };
      calledOrGotten.then = async (resolve: (a: any) => void) => (await peer).rpc("getProperty", {
        propertyName: prop,
        componentId,
      }).then(async (v) => {
        if ("nodeId" in v) {
          return resolve(OtherNodeRegistry.registryOf((await peer).win)!.getNode(v.nodeId));
        }
        return resolve(v.value);
      });

      return calledOrGotten;
    },
  });
}
