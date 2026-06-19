declare module 'shpjs' {
  const shp: (input: ArrayBuffer) => Promise<unknown>;
  export default shp;
}

declare module 'rtf.js/dist/RTFJS.bundle.js' {
  export const RTFJS: any;
  const bundle: any;
  export default bundle;
}

declare module '@kenjiuno/msgreader' {
  const MsgReader: any;
  export default MsgReader;
}

declare module 'postal-mime' {
  const PostalMime: any;
  export default PostalMime;
}

declare module 'sql.js' {
  const initSqlJs: any;
  export default initSqlJs;
}

declare module 'avsc/etc/browser/avsc.js' {
  const avsc: any;
  export = avsc;
}
