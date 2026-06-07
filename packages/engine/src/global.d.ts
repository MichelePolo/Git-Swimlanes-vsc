/// <reference types="react" />

// Make the `JSX` namespace globally available so that component return types
// may be annotated as `JSX.Element` without an explicit React import.
declare namespace JSX {
  interface Element extends React.ReactElement<any, any> {}
  interface IntrinsicElements extends React.JSX.IntrinsicElements {}
  interface IntrinsicAttributes extends React.JSX.IntrinsicAttributes {}
  interface ElementChildrenAttribute extends React.JSX.ElementChildrenAttribute {}
}

// Allow side-effect CSS imports (processed by tsup's bundler).
declare module "*.css" {}

