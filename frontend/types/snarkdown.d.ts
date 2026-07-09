// snarkdown ships no type definitions; public/vendor/snarkdown.d.ts re-exports this.
declare module 'snarkdown' {
  /** Render markdown to an HTML string. */
  export default function snarkdown(markdown: string): string;
}
