/* Copyright 2017 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

// The upstream JBig2 decoder ships legacy polyfills through CommonJS require().
// This project targets modern browsers through Vite, so the compatibility layer is kept
// intentionally small to avoid pulling core-js into the lazy OFD chunk.
if (!globalThis._pdfjsCompatibilityChecked) {
  globalThis._pdfjsCompatibilityChecked = true;
}
