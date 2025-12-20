import { KeyedLatch } from "../classes/latch.js";

export class CathodiqueConsumerHandler {
  instanceReady: KeyedLatch<string, void>;

  constructor(instanceReady: KeyedLatch<string, void>) {
    this.instanceReady = instanceReady;
  }

  async componentRegistered({ data }: { data: { componentName: string } }) {
    this.instanceReady.resolve(data.componentName, undefined);
  }
};
