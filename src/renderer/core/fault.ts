/**
 * Core Fault hierarchy for Cathodique interface contracts and module validations.
 */

export class Fault extends Error {
  public override get name(): string {
    return this.constructor.name;
  }
}

export class ConsumerFault extends Fault {}
export class ProviderFault extends Fault {}
