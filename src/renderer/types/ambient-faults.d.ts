/**
 * Ambient Fault class declarations for Cathodique interface definitions.
 */

declare class Fault extends Error {
  constructor(message: string);
}

declare class ConsumerFault extends Fault {
  constructor(message: string);
}

declare class ProviderFault extends Fault {
  constructor(message: string);
}
