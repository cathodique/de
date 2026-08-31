declare module "@endo/module-source" {
  import type { ModuleSource } from "ses";
  export class ModuleSource {
    constructor(source: string, urlOrOptions?: string | { sourceUrl?: string; sourceMapUrl?: string; sourceMapHook?: (map: string) => void });
    imports: string[];
    exports: string[];
    reexports: string[];
  }
}

declare module "@babel/traverse" {
  export type Visitor = any;
}

declare module "@babel/generator" {
  export type GeneratorOptions = any;
}
