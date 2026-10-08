import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBuiltinThemesCss } from '../src/theme/generated-css';

const out = join(import.meta.dir, '..', 'src', 'styles', 'themes.generated.css');
writeFileSync(out, buildBuiltinThemesCss());
console.log(`Wrote ${out}`);
