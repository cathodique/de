type ValueFor<Mapping, Key> = Extract<Mapping, [Key, any]>[1];

export class PolyMap<Mapping extends [any, any]> extends Map<any, any> {
  set<T extends Mapping[0]>(a: T, b: ValueFor<Mapping, T>) {
    return super.set(a, b);
  }
  get<T extends Mapping[0]>(a: T): ValueFor<Mapping, T> {
    return super.get(a);
  }
}
