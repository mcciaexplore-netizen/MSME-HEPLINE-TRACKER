declare module "jaro-winkler" {
  export default function jaroWinkler(a: string, b: string, options?: { caseSensitive?: boolean }): number;
}
