let alphabet =
  "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

export class ShouldHaveBeenZodError extends Error {
  constructor(message?: string) {
    super(message || "This error should have been caught by zod");
  }
}

export function nanoid(e = 21) {
  let t = "",
    r = crypto.getRandomValues(new Uint8Array(e));
  for (let n = 0; n < e; n++) t += alphabet[63 & r[n]];
  return t;
}

const [projectSubdomain, userSubdomain, ...hostList] =
  window.location.hostname.split(".");
export { projectSubdomain, userSubdomain };
export const host = hostList.join('.')

export const canonicalHost = `${location.protocol}//${hostList.join(".")}:${location.port}`;
export const parentOrigin = await fetch("/.common/hostOverride").then((v) => v.text(), () => canonicalHost);

export const stringStartsWithDollar = (v: string): v is `$${string}` => v.startsWith("$");
