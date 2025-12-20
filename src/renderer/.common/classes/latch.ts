enum LatchState {
  Pending,
  Fulfilled,
}

export class Latch<T> {
  promise: Promise<T>;
  resolve: ((v: T) => void) | undefined;
  constructor(value?: T) {
    if (value) {
      this.resolve = undefined;
      this.promise = Promise.resolve(value);
    } else {
      let resultingResolve: (r: T) => void;
      this.promise = new Promise<T>((r) => { resultingResolve = r });
      this.resolve = function (this: Latch<T>, r: T) {
        resultingResolve(r);
        this.resolve = undefined;
      }.bind(this);
    }
  }

  getState() {
    if (this.resolve) return LatchState.Pending;
    return LatchState.Fulfilled;
  }
}

export class KeyedLatch<T, U> {
  map = new Map<T, Latch<U>>();

  getStateOf(key: T) {
    return this.map.get(key)?.getState() ?? LatchState.Pending;
  }
  get(key: T) {
    if (this.map.has(key)) return this.map.get(key)!.promise;
    const latch = new Latch<U>();
    this.map.set(key, latch);
    return latch.promise;
  }
  resolve(key: T, value: U) {
    if (!this.map.has(key)) {
      this.map.set(key, new Latch(value));
    }
    this.map.get(key)!.resolve?.(value);
    return value;
  }
  getOptional(key: T) {
    if (this.map.has(key)) return this.get(key);
    return undefined;
  }
  delete(key: T) {
    this.map.delete(key);
  }
}

export class WeakKeyedLatch<T extends WeakKey, U> {
  map = new WeakMap<T, Latch<U>>();

  getStateOf(key: T) {
    return this.map.get(key)?.getState() ?? LatchState.Pending;
  }
  get(key: T) {
    if (this.map.has(key)) return this.map.get(key)!.promise;
    const latch = new Latch<U>();
    this.map.set(key, latch);
    return latch.promise;
  }
  resolve(key: T, value: U) {
    if (!this.map.has(key)) {
      this.map.set(key, new Latch(value));
    }
    this.map.get(key)!.resolve?.(value);
    return value;
  }
  getOptional(key: T) {
    if (this.map.has(key)) return this.get(key);
    return undefined;
  }
  delete(key: T) {
    this.map.delete(key);
  }
}

export class ConsumableKeyedLatch<T, U> extends KeyedLatch<T, U> {
  consumed = new Set<T>();

  consume(key: T) {
    const result = super.get(key);
    switch (this.getStateOf(key)) {
      case LatchState.Pending:
        this.consumed.add(key);
        break;
      case LatchState.Fulfilled:
        this.delete(key);
        break;
    }
    return result;
  }
  /**
   * @deprecated For semantic reasons, use consume instead
   * Method kept for inheritance
  */
  get(key: T) {
    return this.consume(key);
  }
  resolve(key: T, value: U) {
    const result = super.resolve(key, value);
    if (this.consumed.has(key)) {
      this.consumed.delete(key);
      this.delete(key);
    }
    return result;
  }
}

export class ConsumableWeakKeyedLatch<T extends WeakKey, U> extends WeakKeyedLatch<T, U> {
  consumed = new WeakSet<T>();

  consume(key: T) {
    const result = super.get(key);
    switch (this.getStateOf(key)) {
      case LatchState.Pending:
        this.consumed.add(key);
        break;
      case LatchState.Fulfilled:
        this.delete(key);
        break;
    }
    return result;
  }
  /**
   * @deprecated For semantic reasons, use consume instead
   * Method kept for inheritance
  */
  get(key: T) {
    return this.consume(key);
  }
  resolve(key: T, value: U) {
    const result = super.resolve(key, value);
    if (this.consumed.has(key)) {
      this.consumed.delete(key);
      this.delete(key);
    }
    return result;
  }
}
