import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkNodePins({ root }) {
  const major = readFileSync(join(root, '.nvmrc'), 'utf8').trim();
  if (!/^\d+$/.test(major)) throw new Error('.nvmrc must contain a Node major version');
  const errors = [];
  const scan = (file, check) => {
    readFileSync(join(root, file), 'utf8').split(/\r?\n/).forEach((line, index) => {
      const report = (value) => errors.push(`${file}:${index + 1}: found ${value}; expected Node major ${major} (workflows must use node-version-file: .nvmrc)`);
      check(line, report);
    });
  };
  const entries = (dir) => existsSync(join(root, dir)) ? readdirSync(join(root, dir), { withFileTypes: true }) : [];
  for (const entry of entries('.github/workflows')) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
    scan(`.github/workflows/${entry.name}`, (line, report) => {
      const pin = line.match(/^\s*(?:-\s*)?node-version:\s*(.*)/);
      if (pin) report(pin[1]);
      const source = line.match(/^\s*(?:-\s*)?node-version-file:\s*(.*)/);
      if (source && source[1].replace(/\s+#.*$/, '').replace(/['"]/g, '').trim() !== '.nvmrc') report(source[1]);
    });
  }
  const dockerfiles = entries('').filter(e => e.isFile() && e.name.startsWith('Dockerfile')).map(e => e.name);
  const walk = (dir) => {
    for (const entry of entries(dir)) {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (entry.name.startsWith('Dockerfile')) dockerfiles.push(file);
    }
  };
  walk('docker');
  for (const file of dockerfiles) scan(file, (line, report) => {
    const pin = line.match(/^\s*FROM\s+(?:--platform=\S+\s+)?node:(\d+)/i)
      || line.match(/^\s*ARG\s+NODE_VERSION=["']?(\d+)/i);
    if (pin && pin[1] !== major) report(pin[0].trim());
  });
  for (const entry of entries('')) {
    if (!entry.isFile() || !/^docker-compose.*\.ya?ml$/.test(entry.name)) continue;
    scan(entry.name, (line, report) => {
      const pin = line.match(/^\s*image:\s*["']?node:(\d+)/);
      if (pin && pin[1] !== major) report(pin[0].trim());
    });
  }
  if (existsSync(join(root, 'mobile/eas.json'))) {
    const file = 'mobile/eas.json';
    const source = readFileSync(join(root, file), 'utf8');
    const config = JSON.parse(source);
    // Locate values through JSON tokens so compact JSON and unrelated node keys
    // still produce the correct source line and profile scope.
    const tokens = [...source.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?|true|false|null/g)];
    let cursor = 0;
    const visit = (path = []) => {
      const token = tokens[cursor++];
      if (token[0] === '{') {
        while (tokens[cursor][0] !== '}') {
          const key = JSON.parse(tokens[cursor++][0]);
          cursor++; // colon
          visit([...path, key]);
          if (tokens[cursor][0] === ',') cursor++;
        }
        cursor++;
      } else if (token[0] === '[') {
        while (tokens[cursor][0] !== ']') {
          visit([...path, String(cursor)]);
          if (tokens[cursor][0] === ',') cursor++;
        }
        cursor++;
      } else if (path.length === 3 && path[0] === 'build' && path[2] === 'node') {
        const value = config.build[path[1]].node;
        if (!new RegExp(`^${major}\\.\\d+\\.\\d+$`).test(value)) {
          const line = source.slice(0, token.index).split('\n').length;
          errors.push(`${file}:${line}: found ${JSON.stringify(value)}; expected Node major ${major}`);
        }
      }
    };
    visit();
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const errors = checkNodePins({ root: process.cwd() });
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log('Node version pins match .nvmrc');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
