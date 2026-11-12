// Builds dof/index.html and dof/tutorial.html (three.js vendored next to them).
// Usage: npm install && npm run build
const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'dof');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// vendor three.js + OrbitControls so the page works offline / on GitHub Pages
const vendor = path.join(out, 'vendor');
fs.mkdirSync(vendor, { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/three/build/three.module.min.js'), path.join(vendor, 'three.module.min.js'));
fs.copyFileSync(path.join(root, 'node_modules/three/examples/jsm/controls/OrbitControls.js'), path.join(vendor, 'OrbitControls.js'));

// KaTeX (math typesetting for the tutorial), woff2 fonts only
const kv = path.join(vendor, 'katex');
fs.mkdirSync(path.join(kv, 'fonts'), { recursive: true });
const kd = path.join(root, 'node_modules/katex/dist');
fs.copyFileSync(path.join(kd, 'katex.min.js'), path.join(kv, 'katex.min.js'));
fs.copyFileSync(path.join(kd, 'katex.min.css'), path.join(kv, 'katex.min.css'));
fs.copyFileSync(path.join(kd, 'contrib/auto-render.min.js'), path.join(kv, 'auto-render.min.js'));
for (const f of fs.readdirSync(path.join(kd, 'fonts'))) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(kd, 'fonts', f), path.join(kv, 'fonts', f));

const html = read('src/template.html')
  .replace('/*__CSS__*/', () => read('src/style.css'))
  .replace('/*__JS__*/', () => read('src/app.js'));

fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('wrote dof/index.html (' + html.length + ' bytes)');

// tutorial.html: inline page script, shared lib served as dof/lib.js
fs.copyFileSync(path.join(root, 'src/lib.js'), path.join(out, 'lib.js'));
const tut = read('src/tutorial.html')
  .replace('/*__CSS__*/', () => read('src/style.css') + '\n' + read('src/tutorial.css'))
  .replace('/*__JS__*/', () => read('src/tutorial.js').replace("from './lib.js'", "from './lib.js'"));
fs.writeFileSync(path.join(out, 'tutorial.html'), tut);
console.log('wrote dof/tutorial.html (' + tut.length + ' bytes)');
