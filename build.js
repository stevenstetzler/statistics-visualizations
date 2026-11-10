// Builds docs/index.html (single page, three.js vendored next to it).
// Usage: npm install && npm run build
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// vendor three.js + OrbitControls so the page works offline / on GitHub Pages
const vendor = path.join(root, 'docs', 'vendor');
fs.mkdirSync(vendor, { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/three/build/three.module.min.js'), path.join(vendor, 'three.module.min.js'));
fs.copyFileSync(path.join(root, 'node_modules/three/examples/jsm/controls/OrbitControls.js'), path.join(vendor, 'OrbitControls.js'));

const html = read('src/template.html')
  .replace('/*__CSS__*/', () => read('src/style.css'))
  .replace('/*__JS__*/', () => read('src/app.js'));

fs.writeFileSync(path.join(root, 'docs', 'index.html'), html);
console.log('wrote docs/index.html (' + html.length + ' bytes)');

// tutorial.html: inline page script, shared lib served as docs/lib.js
fs.copyFileSync(path.join(root, 'src/lib.js'), path.join(root, 'docs', 'lib.js'));
const tut = read('src/tutorial.html')
  .replace('/*__CSS__*/', () => read('src/style.css') + '\n' + read('src/tutorial.css'))
  .replace('/*__JS__*/', () => read('src/tutorial.js').replace("from './lib.js'", "from './lib.js'"));
fs.writeFileSync(path.join(root, 'docs', 'tutorial.html'), tut);
console.log('wrote docs/tutorial.html (' + tut.length + ' bytes)');
