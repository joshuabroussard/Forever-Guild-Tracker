// Every embed section lives in this folder and registers here. To add raids,
// gear or professions later, write a new section file with an id and a
// build() that returns { lines }, add it below, and list its id in
// "sections" in config.json.
import { summary } from './summary.js';
import { leveling } from './leveling.js';

export const SECTIONS = { summary, leveling };
