import atlas from './atlas/index.js';
import dex from './dex.js';
import ellis from './ellis.js';
import lexi from './lexi.js';
import vera from './vera.js';
import viz from './viz.js';

const employees = [atlas, dex, ellis, lexi, vera, viz] as const;

export default employees;
