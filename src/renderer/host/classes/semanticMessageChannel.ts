export class SemanticMessageChannel extends MessageChannel {
  get consumerPort() {
    return this.port1;
  }
  get providerPort() {
    return this.port2;
  }
}
