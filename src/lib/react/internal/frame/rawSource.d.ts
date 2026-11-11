// The bootstrap ships as the text of bootstrap.js: Vite and Vitest load a file's text with `?raw`
// (and inline it into the build). Declared here so the library does not depend on vite/client types.
declare module '*/bootstrap.js?raw' {
  const source: string;
  export default source;
}
