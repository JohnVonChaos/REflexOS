interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  // add any other env keys you use
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
