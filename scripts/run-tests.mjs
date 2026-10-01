import {readdirSync} from 'node:fs';
// Discover every suite, so a newly added regression file cannot be forgotten.
// A single process also works on Windows without shell glob expansion.
const directory=new URL('../tests/',import.meta.url);
const suites=readdirSync(directory).filter(name=>name.endsWith('.test.mjs')).sort();
if(!suites.length)throw Error('No regression suites found');
for(const name of suites)await import(new URL(name,directory));
